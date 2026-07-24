// /api/trajets.js
// Trajets en transports en commun avec PRIM
// Cas spécial Jason avec le TER SNCF

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/journeys";

const pause = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

/*
 * Transforme une date Navitia :
 * 20260724T213000
 * en timestamp utilisable.
 */
function parseNavitiaDate(value) {
  if (
    !/^\d{8}T\d{6}$/.test(value || "")
  ) {
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
 * Transforme un timestamp en date Navitia.
 */
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

/*
 * Ajoute des minutes à une date Navitia.
 */
function addMinutes(value, minutes) {
  const timestamp =
    parseNavitiaDate(value);

  if (timestamp === null) {
    return null;
  }

  return formatNavitiaDate(
    timestamp + minutes * 60_000
  );
}

/*
 * Calcule le nombre de minutes
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
 * Vérifie que l'itinéraire utilise
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
 * Vérifie si l'itinéraire SNCF
 * contient un TER.
 */
function hasTer(journey) {
  return journey?.sections?.some(
    (section) => {
      if (
        section.type !==
        "public_transport"
      ) {
        return false;
      }

      const information =
        JSON.stringify({
          displayInformations:
            section.display_informations ||
            {},

          physicalMode:
            section.physical_mode || {},

          commercialMode:
            section.commercial_mode || {},

          links:
            section.links || [],
        }).toUpperCase();

      return information.includes("TER");
    }
  );
}

/*
 * Sélectionne l'itinéraire qui arrive
 * le plus tôt.
 *
 * Cela évite de prendre automatiquement
 * le premier trajet renvoyé par l'API,
 * qui n'est pas toujours le plus rapide.
 */
function selectBestJourney(
  data,
  requestedDateTime = null,
  terOnly = false
) {
  let journeys = Array.isArray(
    data?.journeys
  )
    ? data.journeys
    : [];

  journeys = journeys.filter(
    (journey) =>
      hasPublicTransport(journey) &&
      journey.arrival_date_time &&
      Number.isFinite(
        Number(journey.duration)
      )
  );

  /*
   * Pour Jason, on privilégie
   * les trajets indiqués comme TER.
   */
  if (terOnly) {
    const terJourneys =
      journeys.filter(hasTer);

    if (terJourneys.length > 0) {
      journeys = terJourneys;
    }
  }

  if (journeys.length === 0) {
    return null;
  }

  /*
   * Pour les trajets PRIM :
   * on utilise l'heure actuelle retournée
   * par l'API.
   *
   * Pour le TER :
   * on utilise l'heure d'arrivée prévue
   * à Gare du Nord + la correspondance.
   */
  const referenceDateTime =
    requestedDateTime ||
    data?.context?.current_datetime ||
    journeys[0].departure_date_time;

  const rankedJourneys = journeys
    .map((journey) => {
      const totalMinutes =
        minutesBetween(
          referenceDateTime,
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
 * Lit la réponse JSON et retourne
 * une erreur claire en cas de problème.
 */
async function readJson(
  response,
  serviceName
) {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `${serviceName} HTTP ` +
        `${response.status} : ` +
        body.slice(0, 200)
    );
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
 * Appel de l'API PRIM
 * pour les trajets franciliens.
 */
async function getPrimJourney(
  apiKey,
  from,
  to
) {
  const params =
    new URLSearchParams({
      /*
       * Navitia utilise le format :
       * longitude;latitude
       */
      from:
        `${from.lon};${from.lat}`,

      to:
        `${to.lon};${to.lat}`,

      /*
       * Horaires et perturbations
       * en temps réel.
       */
      data_freshness: "realtime",

      /*
       * Calcul pour un départ immédiat.
       */
      datetime_represents:
        "departure",

      /*
       * Demande plusieurs possibilités
       * pour sélectionner la meilleure.
       */
      count: "10",
    });

  const response = await fetch(
    `${PRIM_URL}?${params.toString()}`,
    {
      method: "GET",

      headers: {
        Accept: "application/json",

        /*
         * Ne pas ajouter de header
         * Authorization ici.
         *
         * La clé PRIM est envoyée
         * uniquement avec apikey.
         */
        apikey: apiKey,
      },
    }
  );

  const data = await readJson(
    response,
    "PRIM"
  );

  const result =
    selectBestJourney(data);

  if (!result) {
    throw new Error(
      "PRIM : aucun trajet en " +
        "transport en commun trouvé"
    );
  }

  return result;
}

/*
 * Appel de l'API SNCF
 * pour Paris-Nord vers Compiègne.
 */
async function getSncfTer(
  apiKey,
  departureDateTime
) {
  const params =
    new URLSearchParams({
      /*
       * Gare de Paris-Nord.
       */
      from:
        "stop_area:SNCF:87271007",

      /*
       * Gare de Compiègne.
       */
      to:
        "stop_area:SNCF:87276691",

      /*
       * Heure à laquelle Jason peut
       * prendre son TER après la
       * correspondance.
       */
      datetime:
        departureDateTime,

      datetime_represents:
        "departure",

      data_freshness: "realtime",

      count: "10",
    });

  /*
   * API SNCF :
   * utilisateur = token
   * mot de passe = vide
   */
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

  const data = await readJson(
    response,
    "SNCF"
  );

  const result =
    selectBestJourney(
      data,
      departureDateTime,
      true
    );

  if (!result) {
    throw new Error(
      "SNCF : aucun TER trouvé " +
        "entre Paris-Nord et Compiègne"
    );
  }

  return result;
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
   * PRIM est obligatoire pour les
   * sept trajets franciliens.
   *
   * La clé SNCF est contrôlée
   * séparément pour éviter que les
   * sept autres trajets disparaissent
   * en cas de problème avec Jason.
   */
  if (!IDFM_API_KEY) {
    return res.status(500).json({
      error:
        "IDFM_API_KEY non configurée " +
        "dans Vercel",
    });
  }

  /*
   * Point de départ :
   * gare Châtelet-Les Halles.
   */
  const start = {
    lat: 48.8615,
    lon: 2.3465,
  };

  /*
   * Gare du Nord :
   * correspondance de Jason.
   */
  const gareDuNord = {
    lat: 48.8809,
    lon: 2.3553,
  };

  /*
   * Destinations couvertes par PRIM.
   *
   * Rachid et Toufik ont la même
   * destination : une seule requête
   * est effectuée pour Poissy.
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
     * Liste des appels PRIM :
     * six destinations différentes
     * + Gare du Nord pour Jason.
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
     * Trois appels simultanés maximum.
     * Cela évite de surcharger l'API.
     */
    for (
      let index = 0;
      index < jobs.length;
      index += 3
    ) {
      const batch = jobs.slice(
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
        const item of batchResults
      ) {
        results[item.key] = item;
      }

      /*
       * Petite pause entre les groupes
       * de requêtes.
       */
      if (
        index + 3 <
        jobs.length
      ) {
        await pause(800);
      }
    }

    /*
     * Enregistrement des temps
     * des sept personnes IDFM.
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
     * 1. Châtelet vers Gare du Nord
     * 2. Dix minutes de correspondance
     * 3. TER Paris-Nord vers Compiègne
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
       * Temps prévu pour rejoindre
       * le quai du TER.
       */
      const transferMinutes = 10;

      const firstLegArrival =
        firstLeg.result.journey
          .arrival_date_time;

      const terSearchTime =
        addMinutes(
          firstLegArrival,
          transferMinutes
        );

      if (!terSearchTime) {
        throw new Error(
          "Horaire d'arrivée à " +
            "Gare du Nord invalide"
        );
      }

      const ter =
        await getSncfTer(
          SNCF_API_KEY,
          terSearchTime
        );

      /*
       * Temps total de Jason :
       *
       * attente + trajet vers Gare du Nord
       * + correspondance
       * + attente du TER
       * + trajet TER vers Compiègne
       */
      times.jason =
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
     * Le résultat peut être conservé
     * environ quatre minutes.
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
