// /api/trajets.js
// Trajets PRIM avec limitation des appels
// Jason calculé avec l'API SNCF

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/coverage/sncf/journeys";

/*
 * Durée du cache serveur :
 * un nouveau calcul maximum toutes les 15 minutes.
 */
const CACHE_DURATION_MS = 15 * 60 * 1000;

/*
 * Petite pause entre chaque appel PRIM
 * pour éviter les rafales de requêtes.
 */
const PRIM_REQUEST_DELAY_MS = 1500;

/*
 * Temps habituels utilisés uniquement :
 * - si PRIM est temporairement bloqué ;
 * - et si aucun ancien résultat valide n'existe.
 */
const FALLBACK_TIMES = {
  ghulam: 40,
  nathan: 24,
  michael: 12,
  cedric: 24,
  liazide: 41,
  rachid: 41,
  toufik: 41,
  jason: 75,
};

/*
 * Cache conservé tant que l'instance
 * Vercel reste active.
 */
let memoryCache = {
  data: null,
  timestamp: 0,
};

/*
 * Empêche plusieurs visiteurs de lancer
 * le même calcul en parallèle.
 */
let calculationInProgress = null;

const sleep = (milliseconds) =>
  new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );

function parseNavitiaDate(value) {
  if (!/^\d{8}T\d{6}$/.test(value || "")) {
    return null;
  }

  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(9, 11)),
    Number(value.slice(11, 13)),
    Number(value.slice(13, 15))
  );
}

function formatNavitiaDate(timestamp) {
  const date = new Date(timestamp);

  const pad = (number) =>
    String(number).padStart(2, "0");

  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}`
  );
}

function addMinutes(value, minutes) {
  const timestamp = parseNavitiaDate(value);

  if (timestamp === null) {
    return null;
  }

  return formatNavitiaDate(
    timestamp + minutes * 60_000
  );
}

function minutesBetween(
  startValue,
  endValue
) {
  const start = parseNavitiaDate(startValue);
  const end = parseNavitiaDate(endValue);

  if (
    start === null ||
    end === null ||
    end < start
  ) {
    return null;
  }

  return Math.round(
    (end - start) / 60_000
  );
}

function getCurrentNavitiaDate() {
  return formatNavitiaDate(Date.now());
}

function hasPublicTransport(journey) {
  return journey?.sections?.some(
    (section) =>
      section.type === "public_transport"
  );
}

/*
 * Choisit l'itinéraire qui arrive
 * réellement le plus tôt.
 */
function selectBestJourney(
  data,
  referenceDateTime = null
) {
  const journeys = Array.isArray(
    data?.journeys
  )
    ? data.journeys
    : [];

  const candidates = journeys.filter(
    (journey) =>
      hasPublicTransport(journey) &&
      journey.arrival_date_time &&
      Number.isFinite(
        Number(journey.duration)
      )
  );

  if (candidates.length === 0) {
    return null;
  }

  const reference =
    referenceDateTime ||
    data?.context?.current_datetime ||
    candidates[0].departure_date_time;

  const ranked = candidates
    .map((journey) => {
      const totalMinutes =
        minutesBetween(
          reference,
          journey.arrival_date_time
        ) ??
        Math.round(
          Number(journey.duration) / 60
        );

      return {
        journey,
        minutes: totalMinutes,
      };
    })
    .filter((item) =>
      Number.isFinite(item.minutes)
    )
    .sort(
      (first, second) =>
        first.minutes - second.minutes
    );

  return ranked[0] || null;
}

async function readJsonResponse(
  response,
  serviceName
) {
  const body = await response.text();

  if (!response.ok) {
    const error = new Error(
      `${serviceName} HTTP ` +
        `${response.status} : ` +
        body.slice(0, 220)
    );

    error.status = response.status;
    throw error;
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `${serviceName} a renvoyé ` +
        "une réponse JSON invalide"
    );
  }
}

async function getPrimJourney(
  apiKey,
  from,
  to
) {
  const params = new URLSearchParams({
    from: `${from.lon};${from.lat}`,
    to: `${to.lon};${to.lat}`,
    count: "10",
    data_freshness: "realtime",
    datetime_represents: "departure",
  });

  const response = await fetch(
    `${PRIM_URL}?${params.toString()}`,
    {
      method: "GET",

      headers: {
        Accept: "application/json",
        apikey: apiKey,
      },
    }
  );

  const data = await readJsonResponse(
    response,
    "PRIM"
  );

  const selected = selectBestJourney(data);

  if (!selected) {
    throw new Error(
      "PRIM : aucun trajet trouvé"
    );
  }

  return selected;
}

async function requestSncfJourney(
  apiKey,
  departureDateTime,
  freshness
) {
  const params = new URLSearchParams({
    /*
     * Paris Gare du Nord.
     */
    from: "stop_area:SNCF:87271007",

    /*
     * Gare de Compiègne.
     */
    to: "stop_area:SNCF:87276691",

    datetime: departureDateTime,

    datetime_represents: "departure",

    count: "10",
  });

  if (freshness) {
    params.set(
      "data_freshness",
      freshness
    );
  }

  const basicAuth = Buffer.from(
    `${apiKey}:`
  ).toString("base64");

  const response = await fetch(
    `${SNCF_URL}?${params.toString()}`,
    {
      method: "GET",

      headers: {
        Accept: "application/json",

        Authorization:
          `Basic ${basicAuth}`,
      },
    }
  );

  return readJsonResponse(
    response,
    "SNCF"
  );
}

async function getSncfJourney(
  apiKey,
  departureDateTime
) {
  let firstError = null;

  /*
   * Premier essai avec les données
   * en temps réel.
   */
  try {
    const realtimeData =
      await requestSncfJourney(
        apiKey,
        departureDateTime,
        "realtime"
      );

    const selected =
      selectBestJourney(
        realtimeData,
        departureDateTime
      );

    if (selected) {
      return {
        ...selected,
        freshness: "realtime",
      };
    }
  } catch (error) {
    firstError = error;
  }

  /*
   * Deuxième essai avec les horaires
   * programmés.
   */
  try {
    const scheduledData =
      await requestSncfJourney(
        apiKey,
        departureDateTime,
        null
      );

    const selected =
      selectBestJourney(
        scheduledData,
        departureDateTime
      );

    if (selected) {
      return {
        ...selected,
        freshness: "base_schedule",
      };
    }
  } catch (error) {
    const firstMessage =
      firstError instanceof Error
        ? firstError.message
        : "Temps réel indisponible";

    throw new Error(
      `${firstMessage} | ` +
        `Second essai : ${error.message}`
    );
  }

  throw new Error(
    "SNCF : aucun trajet trouvé " +
      "entre Paris-Nord et Compiègne"
  );
}

function getFallbackResponse(
  reason,
  previousData = null
) {
  /*
   * On privilégie les anciennes valeurs
   * valides si elles existent.
   */
  if (previousData?.times) {
    return {
      ...previousData,

      stale: true,

      warning:
        "Dernières valeurs conservées : " +
        reason,

      servedAt:
        new Date().toISOString(),
    };
  }

  /*
   * Sinon, on affiche les temps habituels
   * plutôt que des tirets.
   */
  return {
    times: {
      ...FALLBACK_TIMES,
    },

    errors: {},

    details: {},

    stale: true,

    fallback: true,

    warning:
      "Temps habituels provisoires : " +
      reason,

    updatedAt:
      new Date().toISOString(),
  };
}

async function calculateAllJourneys(
  idfmApiKey,
  sncfApiKey
) {
  const start = {
    lat: 48.8615,
    lon: 2.3465,
  };

  /*
   * Six destinations différentes.
   * Rachid et Toufik partagent Poissy.
   */
  const destinations = [
    {
      key: "ghulam",
      names: ["ghulam"],
      lat: 48.882222,
      lon: 2.704167,
    },

    {
      key: "nathan",
      names: ["nathan"],
      lat: 48.824744,
      lon: 2.318872,
    },

    {
      key: "michael",
      names: ["michael"],
      lat: 48.895631,
      lon: 2.223138,
    },

    {
      key: "cedric",
      names: ["cedric"],
      lat: 48.963873,
      lon: 2.372285,
    },

    {
      key: "liazide",
      names: ["liazide"],
      lat: 49.019392,
      lon: 2.153672,
    },

    {
      key: "poissy",

      names: [
        "rachid",
        "toufik",
      ],

      lat: 48.933,
      lon: 2.04,
    },
  ];

  const times = {};
  const errors = {};
  const details = {};

  let rateLimitDetected = false;

  /*
   * Les appels sont effectués un par un,
   * avec une pause entre chaque appel.
   */
  for (
    let index = 0;
    index < destinations.length;
    index += 1
  ) {
    const destination =
      destinations[index];

    try {
      const result =
        await getPrimJourney(
          idfmApiKey,
          start,
          destination
        );

      for (
        const name
        of destination.names
      ) {
        times[name] = result.minutes;
      }
    } catch (error) {
      if (error?.status === 429) {
        rateLimitDetected = true;
      }

      for (
        const name
        of destination.names
      ) {
        times[name] = null;

        errors[name] =
          error instanceof Error
            ? error.message
            : String(error);
      }
    }

    /*
     * Dès qu'un 429 apparaît, on arrête
     * les autres appels PRIM.
     */
    if (rateLimitDetected) {
      break;
    }

    if (
      index <
      destinations.length - 1
    ) {
      await sleep(
        PRIM_REQUEST_DELAY_MS
      );
    }
  }

  /*
   * Si la limite est atteinte,
   * on ne continue pas le calcul.
   */
  if (rateLimitDetected) {
    const rateLimitError = new Error(
      "PRIM : limite de requêtes atteinte"
    );

    rateLimitError.status = 429;
    throw rateLimitError;
  }

  /*
   * Jason :
   *
   * On estime Châtelet -> Gare du Nord
   * à 8 minutes pour éviter un septième
   * appel PRIM.
   *
   * Puis l'API SNCF calcule l'attente
   * et le TER jusqu'à Compiègne.
   */
  try {
    if (!sncfApiKey) {
      throw new Error(
        "SNCF_API_KEY non configurée"
      );
    }

    const chateletToGareDuNord = 8;
    const correspondenceMinutes = 10;

    const now =
      getCurrentNavitiaDate();

    const terSearchDateTime =
      addMinutes(
        now,
        chateletToGareDuNord +
          correspondenceMinutes
      );

    const ter =
      await getSncfJourney(
        sncfApiKey,
        terSearchDateTime
      );

    times.jason =
      chateletToGareDuNord +
      correspondenceMinutes +
      ter.minutes;

    details.jason = {
      chateletToGareDuNordMinutes:
        chateletToGareDuNord,

      correspondenceMinutes,

      waitingAndTerMinutes:
        ter.minutes,

      sncfDataFreshness:
        ter.freshness,

      terDepartureDateTime:
        ter.journey
          .departure_date_time ||
        null,

      arrivalCompiegneDateTime:
        ter.journey
          .arrival_date_time ||
        null,
    };
  } catch (error) {
    /*
     * Un problème SNCF ne bloque pas
     * les sept autres personnes.
     */
    times.jason =
      FALLBACK_TIMES.jason;

    errors.jason =
      error instanceof Error
        ? error.message
        : String(error);

    details.jason = {
      fallback: true,
    };
  }

  return {
    times,
    errors,
    details,

    stale: false,
    fallback: false,

    updatedAt:
      new Date().toISOString(),
  };
}

export default async function handler(
  req,
  res
) {
  const IDFM_API_KEY =
    process.env.IDFM_API_KEY;

  const SNCF_API_KEY =
    process.env.SNCF_API_KEY;

  if (!IDFM_API_KEY) {
    return res.status(500).json({
      error:
        "IDFM_API_KEY non configurée " +
        "dans Vercel",
    });
  }

  const cacheAge =
    Date.now() -
    memoryCache.timestamp;

  /*
   * Renvoie immédiatement le cache
   * s'il a moins de 15 minutes.
   */
  if (
    memoryCache.data &&
    cacheAge < CACHE_DURATION_MS
  ) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, " +
        "stale-while-revalidate=3600"
    );

    return res.status(200).json({
      ...memoryCache.data,

      cache: true,

      cacheAgeSeconds:
        Math.round(cacheAge / 1000),
    });
  }

  /*
   * Si un calcul est déjà lancé,
   * les autres requêtes attendent
   * le même résultat.
   */
  if (!calculationInProgress) {
    calculationInProgress =
      calculateAllJourneys(
        IDFM_API_KEY,
        SNCF_API_KEY
      )
        .then((data) => {
          memoryCache = {
            data,
            timestamp: Date.now(),
          };

          return data;
        })
        .catch((error) => {
          return getFallbackResponse(
            error instanceof Error
              ? error.message
              : String(error),

            memoryCache.data
          );
        })
        .finally(() => {
          calculationInProgress = null;
        });
  }

  const result =
    await calculationInProgress;

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=900, " +
      "stale-while-revalidate=3600"
  );

  return res.status(200).json(result);
}
