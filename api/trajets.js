// /api/trajets.js
// Trajets depuis le point réel : 48.864725, 2.343634
// PRIM pour l'Île-de-France
// API SNCF pour le TER de Jason vers Compiègne

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/coverage/sncf/journeys";

/*
 * Les trajets sont recalculés au maximum
 * une fois toutes les 30 minutes.
 */
const CACHE_DURATION_MS = 30 * 60 * 1000;

/*
 * Pause entre deux appels PRIM.
 */
const PRIM_REQUEST_DELAY_MS = 1000;

/*
 * Cache mémoire Vercel.
 *
 * Il conserve uniquement les dernières
 * données réellement obtenues.
 */
let memoryCache = {
  data: null,
  timestamp: 0,
};

/*
 * Évite que plusieurs requêtes lancent
 * le calcul en même temps.
 */
let calculationInProgress = null;

const sleep = (milliseconds) =>
  new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );

/*
 * Transforme une date Navitia :
 * 20260727T153000
 * en timestamp.
 *
 * Les calculs de différences restent
 * corrects car les deux dates utilisent
 * le même format.
 */
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

/*
 * Ajoute des minutes à une date Navitia.
 */
function addMinutesToNavitiaDate(
  value,
  minutes
) {
  const timestamp =
    parseNavitiaDate(value);

  if (timestamp === null) {
    return null;
  }

  const date = new Date(
    timestamp + minutes * 60_000
  );

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

/*
 * Calcule la différence en minutes
 * entre deux dates Navitia.
 */
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

/*
 * Vérifie qu'un trajet contient
 * bien un transport en commun.
 */
function hasPublicTransport(journey) {
  return journey?.sections?.some(
    (section) =>
      section.type ===
      "public_transport"
  );
}

/*
 * Choisit le trajet qui arrive
 * réellement le plus tôt.
 *
 * On ne prend pas automatiquement
 * le premier trajet de la réponse.
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
      /*
       * Le temps comprend :
       * - la marche ;
       * - l'attente ;
       * - les transports ;
       * - les correspondances ;
       * - la marche à l'arrivée.
       */
      const completeMinutes =
        minutesBetween(
          reference,
          journey.arrival_date_time
        ) ??
        Math.round(
          Number(journey.duration) / 60
        );

      return {
        journey,
        minutes: completeMinutes,
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

/*
 * Lit une réponse JSON.
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
 * Appel PRIM.
 *
 * Le départ et l'arrivée sont transmis
 * sous la forme longitude;latitude.
 *
 * En utilisant les coordonnées réelles,
 * PRIM ajoute automatiquement la marche
 * jusqu'à une station adaptée.
 */
async function getPrimJourney(
  apiKey,
  from,
  to
) {
  const params =
    new URLSearchParams({
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
         * Ne pas mettre
         * Authorization: Basic ici.
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
 * Appel SNCF :
 * Paris Gare du Nord -> Compiègne.
 */
async function requestSncfJourneys(
  apiKey,
  departureDateTime,
  dataFreshness
) {
  const params =
    new URLSearchParams({
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
   * identifiant = clé SNCF
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
 * Cherche le meilleur TER.
 *
 * Premier essai :
 * horaires en temps réel.
 *
 * Deuxième essai :
 * horaires programmés.
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
    const realtimeMessage =
      realtimeError instanceof Error
        ? realtimeError.message
        : "Temps réel indisponible";

    const scheduledMessage =
      scheduledError instanceof Error
        ? scheduledError.message
        : String(scheduledError);

    throw new Error(
      `${realtimeMessage} | ` +
        `Second essai : ${scheduledMessage}`
    );
  }

  throw new Error(
    "SNCF : aucun trajet trouvé " +
      "entre Paris-Nord et Compiègne"
  );
}

/*
 * En cas d'erreur temporaire :
 *
 * - conserve les dernières vraies données ;
 * - n'affiche pas de faux temps habituels ;
 * - sinon affiche null / Indisponible.
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
        "Dernières données réelles conservées : " +
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
 * Calcul complet.
 */
async function calculateAllJourneys(
  idfmApiKey,
  sncfApiKey
) {
  /*
   * Nouveau point de départ réel.
   *
   * La marche jusqu'à la station
   * appropriée sera incluse.
   */
  const start = {
    lat: 48.864725,
    lon: 2.343634,
  };

  /*
   * Gare du Nord utilisée uniquement
   * pour la première partie du trajet
   * de Jason.
   */
  const gareDuNord = {
    lat: 48.8809,
    lon: 2.3553,
  };

  /*
   * Six destinations PRIM différentes.
   *
   * Rachid et Toufik partagent
   * le même trajet vers Poissy.
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
   * Calcul des six destinations
   * franciliennes.
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

      details[destination.key] = {
        departureDateTime:
          result.journey
            .departure_date_time ||
          null,

        arrivalDateTime:
          result.journey
            .arrival_date_time ||
          null,

        durationMinutes:
          result.minutes,
      };
    } catch (error) {
      /*
       * Dès qu'un quota 429 apparaît,
       * on arrête les autres appels.
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
   * Cas spécial Jason.
   *
   * 1. Point réel -> Gare du Nord
   *    avec PRIM.
   *
   * 2. Correspondance vers les quais TER.
   *
   * 3. Gare du Nord -> Compiègne
   *    avec SNCF.
   */
  try {
    if (!sncfApiKey) {
      throw new Error(
        "SNCF_API_KEY non configurée"
      );
    }

    /*
     * Première partie :
     * marche + transport jusqu'à
     * Gare du Nord.
     */
    const firstLeg =
      await getPrimJourney(
        idfmApiKey,
        start,
        gareDuNord
      );

    /*
     * Temps prévu entre l'arrivée
     * et le quai du TER.
     */
    const correspondenceMinutes = 10;

    const terSearchDateTime =
      addMinutesToNavitiaDate(
        firstLeg.journey
          .arrival_date_time,

        correspondenceMinutes
      );

    if (!terSearchDateTime) {
      throw new Error(
        "Horaire d'arrivée à " +
          "Gare du Nord invalide"
      );
    }

    /*
     * Deuxième partie :
     * TER vers Compiègne.
     */
    const ter =
      await getSncfJourney(
        sncfApiKey,
        terSearchDateTime
      );

    /*
     * Temps porte à porte :
     *
     * départ depuis le point réel
     * jusqu'à l'arrivée à Compiègne.
     *
     * Cela inclut l'attente réelle
     * du prochain TER.
     */
    const totalMinutes =
      minutesBetween(
        firstLeg.referenceDateTime,

        ter.journey
          .arrival_date_time
      );

    times.jason =
      totalMinutes ??
      firstLeg.minutes +
        correspondenceMinutes +
        ter.minutes;

    details.jason = {
      startCoordinates: {
        lat: start.lat,
        lon: start.lon,
      },

      toGareDuNordMinutes:
        firstLeg.minutes,

      correspondenceMinutes,

      waitingAndTerMinutes:
        ter.minutes,

      totalMinutes:
        times.jason,

      sncfDataFreshness:
        ter.freshness,

      departureDateTime:
        firstLeg.journey
          .departure_date_time ||
        null,

      arrivalGareDuNordDateTime:
        firstLeg.journey
          .arrival_date_time ||
        null,

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

    startPoint: {
      lat: start.lat,
      lon: start.lon,
    },

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
   * Renvoie immédiatement le dernier
   * résultat s'il a moins de 30 minutes.
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
   * les nouvelles requêtes attendent
   * son résultat.
   */
  if (!calculationInProgress) {
    calculationInProgress =
      calculateAllJourneys(
        IDFM_API_KEY,
        SNCF_API_KEY
      )
        .then((data) => {
          /*
           * On met en cache uniquement
           * les résultats obtenus.
           */
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

  /*
   * Une réponse correcte est mise
   * en cache 30 minutes.
   *
   * Une réponse d'erreur ne doit pas
   * rester bloquée 30 minutes.
   */
  if (
    result.stale === false
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
  } else {
    res.setHeader(
      "Cache-Control",
      "no-store, max-age=0"
    );

    res.setHeader(
      "CDN-Cache-Control",
      "no-store"
    );
  }

  return res.status(200).json(result);
}
