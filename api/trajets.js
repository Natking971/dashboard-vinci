// /api/trajets.js
// Trajets PRIM + trajet SNCF pour Jason

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/coverage/sncf/journeys";

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

  const ranked = candidates
    .map((journey) => {
      const minutes =
        minutesBetween(
          reference,
          journey.arrival_date_time
        ) ??
        Math.round(
          Number(journey.duration) / 60
        );

      return {
        journey,
        minutes,
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
 * Lit la réponse des API.
 */
async function readJsonResponse(
  response,
  serviceName
) {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `${serviceName} HTTP ` +
        `${response.status} : ` +
        body.slice(0, 220)
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `${serviceName} a renvoyé ` +
        "un JSON invalide"
    );
  }
}

/*
 * Trajets franciliens avec PRIM.
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
         * PRIM utilise uniquement
         * le header apikey.
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
 * Requête SNCF Paris-Nord
 * vers Compiègne.
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

  /*
   * Le deuxième essai est réalisé
   * sans ce paramètre.
   */
  if (dataFreshness) {
    params.set(
      "data_freshness",
      dataFreshness
    );
  }

  /*
   * API SNCF :
   * identifiant = clé API
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
 * Premier essai en temps réel.
 * Deuxième essai avec les horaires
 * programmés si nécessaire.
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

    const realtimeJourney =
      selectBestJourney(
        realtimeData,
        departureDateTime
      );

    if (realtimeJourney) {
      return {
        ...realtimeJourney,
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

    const scheduledJourney =
      selectBestJourney(
        scheduledData,
        departureDateTime
      );

    if (scheduledJourney) {
      return {
        ...scheduledJourney,
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
    "SNCF : aucun trajet " +
      "Paris-Nord vers Compiègne trouvé"
  );
}

export default async function handler(
  req,
  res
) {
  const IDFM_API_KEY =
    process.env.IDFM_API_KEY;

  const SNCF_API_KEY =
    process.env.SNCF_API_KEY;

  /*
   * La clé PRIM est obligatoire
   * pour les trajets franciliens.
   */
  if (!IDFM_API_KEY) {
    return res.status(500).json({
      error:
        "IDFM_API_KEY non configurée " +
        "dans Vercel",
    });
  }

  /*
   * Départ :
   * Châtelet-Les Halles.
   */
  const start = {
    lat: 48.8615,
    lon: 2.3465,
  };

  /*
   * Correspondance de Jason :
   * Gare du Nord.
   */
  const gareDuNord = {
    lat: 48.8809,
    lon: 2.3553,
  };

  /*
   * Destinations PRIM.
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
  const results = {};

  try {
    /*
     * Les six destinations PRIM
     * et la Gare du Nord.
     */
    const jobs = [
      ...destinations.map(
        (destination) => ({
          key: destination.key,
          destination,
        })
      ),

      {
        key: "gareDuNord",
        destination: gareDuNord,
      },
    ];

    /*
     * Trois appels PRIM simultanés
     * maximum.
     */
    for (
      let index = 0;
      index < jobs.length;
      index += 3
    ) {
      const batch =
        jobs.slice(
          index,
          index + 3
        );

      const batchResults =
        await Promise.all(
          batch.map(
            async ({
              key,
              destination,
            }) => {
              try {
                const result =
                  await getPrimJourney(
                    IDFM_API_KEY,
                    start,
                    destination
                  );

                return {
                  key,
                  result,
                  error: null,
                };
              } catch (error) {
                return {
                  key,
                  result: null,

                  error:
                    error instanceof Error
                      ? error.message
                      : String(error),
                };
              }
            }
          )
        );

      for (
        const item
        of batchResults
      ) {
        results[item.key] = item;
      }

      if (
        index + 3 <
        jobs.length
      ) {
        await sleep(800);
      }
    }

    /*
     * Enregistre les temps PRIM.
     */
    for (
      const destination
      of destinations
    ) {
      const selected =
        results[destination.key];

      for (
        const name
        of destination.names
      ) {
        if (!selected?.result) {
          times[name] = null;

          errors[name] =
            selected?.error ||
            "Trajet indisponible";

          continue;
        }

        times[name] =
          selected.result.minutes;
      }
    }

    /*
     * Cas spécial Jason :
     *
     * Châtelet
     * -> Gare du Nord
     * -> correspondance
     * -> TER
     * -> Compiègne
     */
    try {
      if (!SNCF_API_KEY) {
        throw new Error(
          "SNCF_API_KEY non configurée " +
            "dans Vercel"
        );
      }

      const firstLeg =
        results.gareDuNord;

      if (!firstLeg?.result) {
        throw new Error(
          firstLeg?.error ||
            "Trajet Châtelet vers " +
              "Gare du Nord indisponible"
        );
      }

      /*
       * Temps prévu pour aller
       * du RER jusqu'au quai TER.
       */
      const transferMinutes = 10;

      const terSearchDateTime =
        addMinutes(
          firstLeg.result.journey
            .arrival_date_time,

          transferMinutes
        );

      if (!terSearchDateTime) {
        throw new Error(
          "Horaire d'arrivée à " +
            "Gare du Nord invalide"
        );
      }

      const ter =
        await getSncfJourney(
          SNCF_API_KEY,
          terSearchDateTime
        );

      /*
       * Temps total depuis maintenant
       * jusqu'à l'arrivée à Compiègne.
       */
      const totalFromNow =
        minutesBetween(
          firstLeg.result
            .referenceDateTime,

          ter.journey
            .arrival_date_time
        );

      times.jason =
        totalFromNow ??
        firstLeg.result.minutes +
          transferMinutes +
          ter.minutes;

      details.jason = {
        chateletToGareDuNordMinutes:
          firstLeg.result.minutes,

        correspondenceMinutes:
          transferMinutes,

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
      times.jason = null;

      errors.jason =
        error instanceof Error
          ? error.message
          : String(error);
    }

    /*
     * Cache d'environ quatre minutes.
     */
    res.setHeader(
      "Cache-Control",

      "s-maxage=240, " +
        "stale-while-revalidate=30"
    );

    return res.status(200).json({
      times,
      errors,
      details,

      updatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error:
        "Erreur lors du calcul " +
        "des trajets",

      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}
