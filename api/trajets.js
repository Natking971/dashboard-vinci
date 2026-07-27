// /api/trajets.js
// Trajets PRIM / IDFM avec cache de 30 minutes
// Cas spécial Jason avec l'API SNCF

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/coverage/sncf/journeys";

/*
 * Un nouveau calcul complet est effectué
 * au maximum toutes les 30 minutes.
 */
const CACHE_DURATION_MS = 30 * 60 * 1000;

/*
 * Pause entre les appels PRIM.
 */
const PRIM_REQUEST_DELAY_MS = 1500;

/*
 * Cache mémoire de l'instance Vercel.
 */
let memoryCache = {
  data: null,
  timestamp: 0,
};

/*
 * Empêche plusieurs calculs identiques
 * de se lancer en même temps.
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

function getCurrentNavitiaDate() {
  return formatNavitiaDate(Date.now());
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
  const start =
    parseNavitiaDate(startValue);

  const end =
    parseNavitiaDate(endValue);

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

function hasPublicTransport(journey) {
  return journey?.sections?.some(
    (section) =>
      section.type ===
      "public_transport"
  );
}

/*
 * Sélectionne le trajet qui arrive
 * le plus tôt parmi les propositions.
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

  const rankedJourneys = candidates
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

  return rankedJourneys[0] || null;
}

/*
 * Lit proprement la réponse d'une API.
 */
async function readJsonResponse(
  response,
  serviceName
) {
  const body = await response.text();

  if (!response.ok) {
    const error = new Error(
      `${serviceName} HTTP ` +
        `${response.status} : ` +
        body.slice(0, 250)
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

/*
 * Appel PRIM pour un trajet francilien.
 */
async function getPrimJourney(
  apiKey,
  from,
  to
) {
  const params = new URLSearchParams({
    /*
     * Navitia utilise :
     * longitude;latitude
     */
    from:
      `${from.lon};${from.lat}`,

    to:
      `${to.lon};${to.lat}`,

    count: "10",

    data_freshness:
      "realtime",

    datetime_represents:
      "departure",
  });

  const response = await fetch(
    `${PRIM_URL}?${params.toString()}`,
    {
      method: "GET",

      headers: {
        Accept: "application/json",

        /*
         * Authentification PRIM.
         */
        apikey: apiKey,
      },
    }
  );

  const data =
    await readJsonResponse(
      response,
      "PRIM"
    );

  const selected =
    selectBestJourney(data);

  if (!selected) {
    throw new Error(
      "PRIM : aucun trajet en " +
        "transport en commun trouvé"
    );
  }

  return {
    ...selected,

    referenceDateTime:
      data?.context?.current_datetime ||
      selected.journey
        .departure_date_time,
  };
}

/*
 * Appel de l'API SNCF.
 */
async function requestSncfJourneys(
  apiKey,
  departureDateTime,
  dataFreshness
) {
  const params = new URLSearchParams({
    /*
     * Paris Gare du Nord.
     */
    from:
      "stop_area:SNCF:87271007",

    /*
     * Gare de Compiègne.
     */
    to:
      "stop_area:SNCF:87276691",

    datetime:
      departureDateTime,

    datetime_represents:
      "departure",

    count: "10",
  });

  if (dataFreshness) {
    params.set(
      "data_freshness",
      dataFreshness
    );
  }

  /*
   * API SNCF :
   * utilisateur = token
   * mot de passe = vide
   */
  const basicAuth =
    Buffer.from(
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

/*
 * Premier essai SNCF en temps réel.
 * Second essai avec les horaires programmés.
 */
async function getSncfJourney(
  apiKey,
  departureDateTime
) {
  let realtimeError = null;

  try {
    const realtimeData =
      await requestSncfJourneys(
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
    realtimeError = error;
  }

  try {
    const scheduledData =
      await requestSncfJourneys(
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
        freshness:
          "base_schedule",
      };
    }
  } catch (scheduledError) {
    const firstMessage =
      realtimeError instanceof Error
        ? realtimeError.message
        : "Temps réel indisponible";

    const secondMessage =
      scheduledError instanceof Error
        ? scheduledError.message
        : String(scheduledError);

    throw new Error(
      `${firstMessage} | ` +
        `Second essai : ${secondMessage}`
    );
  }

  throw new Error(
    "SNCF : aucun trajet trouvé " +
      "entre Paris-Nord et Compiègne"
  );
}

/*
 * Retourne une réponse sans fausses valeurs.
 *
 * Si une ancienne vraie réponse existe,
 * elle est conservée.
 *
 * Sinon, les valeurs restent null.
 */
function buildUnavailableResponse(
  reason,
  previousData = null
) {
  if (previousData?.times) {
    return {
      ...previousData,

      stale: true,

      warning:
        "Dernières vraies valeurs conservées : " +
        reason,

      servedAt:
        new Date().toISOString(),
    };
  }

  return {
    times: {
      ghulam: null,
      nathan: null,
      michael: null,
      cedric: null,
      liazide: null,
      rachid: null,
      toufik: null,
      jason: null,
    },

    errors: {
      service: reason,
    },

    details: {},

    stale: true,
    fallback: false,

    warning:
      "Aucune donnée réelle disponible",

    updatedAt:
      new Date().toISOString(),
  };
}

/*
 * Calcul complet de tous les trajets.
 */
async function calculateAllJourneys(
  idfmApiKey,
  sncfApiKey
) {
  /*
   * Point de départ :
   * Châtelet-Les Halles.
   */
  const start = {
    lat: 48.8615,
    lon: 2.3465,
  };

  /*
   * Six destinations PRIM différentes.
   *
   * Poissy est calculé une seule fois
   * pour Rachid et Toufik.
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

  /*
   * Appels PRIM un par un.
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
        times[name] =
          result.minutes;
      }
    } catch (error) {
      /*
       * Dès qu'un 429 apparaît,
       * on arrête tous les autres appels.
       */
      if (error?.status === 429) {
        const rateLimitError =
          new Error(
            "PRIM : limite de requêtes atteinte"
          );

        rateLimitError.status = 429;

        throw rateLimitError;
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
   * Jason :
   *
   * Châtelet -> Gare du Nord
   * estimé à 8 minutes.
   *
   * Correspondance jusqu'au quai TER :
   * 10 minutes.
   *
   * Le reste est calculé par SNCF.
   */
  try {
    if (!sncfApiKey) {
      throw new Error(
        "SNCF_API_KEY non configurée"
      );
    }

    const chateletToGareDuNordMinutes = 8;
    const correspondenceMinutes = 10;

    const currentDateTime =
      getCurrentNavitiaDate();

    const terSearchDateTime =
      addMinutes(
        currentDateTime,

        chateletToGareDuNordMinutes +
          correspondenceMinutes
      );

    if (!terSearchDateTime) {
      throw new Error(
        "Horaire de départ TER invalide"
      );
    }

    const ter =
      await getSncfJourney(
        sncfApiKey,
        terSearchDateTime
      );

    times.jason =
      chateletToGareDuNordMinutes +
      correspondenceMinutes +
      ter.minutes;

    details.jason = {
      chateletToGareDuNordMinutes,

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
     * Une erreur SNCF ne bloque pas
     * les autres trajets.
     */
    times.jason = null;

    errors.jason =
      error instanceof Error
        ? error.message
        : String(error);
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
   * Renvoie les données déjà calculées
   * si elles ont moins de 30 minutes.
   */
  if (
    memoryCache.data &&
    cacheAge < CACHE_DURATION_MS
  ) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=1800, " +
        "stale-while-revalidate=7200"
    );

    res.setHeader(
      "CDN-Cache-Control",
      "public, s-maxage=1800, " +
        "stale-while-revalidate=7200"
    );

    return res.status(200).json({
      ...memoryCache.data,

      cache: true,

      cacheAgeSeconds:
        Math.round(cacheAge / 1000),
    });
  }

  /*
   * Si un calcul est déjà en cours,
   * toutes les requêtes attendent
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
          return buildUnavailableResponse(
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
    "public, s-maxage=1800, " +
      "stale-while-revalidate=7200"
  );

  res.setHeader(
    "CDN-Cache-Control",
    "public, s-maxage=1800, " +
      "stale-while-revalidate=7200"
  );

  return res.status(200).json(result);
}
