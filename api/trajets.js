// api/trajets.js — Dashboard Vinci multi-site
// Variables Vercel : IDFM_API_KEY obligatoire ; SNCF_API_KEY pour les trajets en train.
// VITE_SITE = lpdl (par défaut) ou rhapsody.

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/coverage/sncf/journeys";

const pause = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseDate(value) {
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

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");

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
  const timestamp = parseDate(value);

  return timestamp === null
    ? null
    : formatDate(timestamp + minutes * 60000);
}

function minutesBetween(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (
    start === null ||
    end === null ||
    end < start
  ) {
    return null;
  }

  return Math.round((end - start) / 60000);
}

function hasPublicTransport(journey) {
  return journey?.sections?.some(
    (section) => section.type === "public_transport"
  );
}

function selectBestJourney(data, referenceDateTime = null) {
  const journeys = (
    Array.isArray(data?.journeys)
      ? data.journeys
      : []
  ).filter(
    (journey) =>
      hasPublicTransport(journey) &&
      journey.arrival_date_time &&
      Number.isFinite(Number(journey.duration))
  );

  if (!journeys.length) {
    return null;
  }

  const reference =
    referenceDateTime ||
    data?.context?.current_datetime ||
    journeys[0].departure_date_time;

  return journeys
    .map((journey) => ({
      journey,
      minutes:
        minutesBetween(
          reference,
          journey.arrival_date_time
        ) ??
        Math.round(Number(journey.duration) / 60),
    }))
    .sort((a, b) => a.minutes - b.minutes)[0];
}

async function readJson(response, serviceName) {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `${serviceName} HTTP ${response.status}: ${body.slice(0, 180)}`
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `${serviceName} a renvoyé une réponse JSON invalide`
    );
  }
}

async function getPrimJourney(apiKey, from, to) {
  const params = new URLSearchParams({
    from: `${from.lon};${from.lat}`,
    to: `${to.lon};${to.lat}`,
    data_freshness: "realtime",
    datetime_represents: "departure",
    count: "10",
  });

  const response = await fetch(
    `${PRIM_URL}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        apikey: apiKey,
      },
    }
  );

  const data = await readJson(
    response,
    "PRIM / Île-de-France Mobilités"
  );

  const result = selectBestJourney(data);

  if (!result) {
    throw new Error(
      "PRIM : aucun trajet en transport trouvé"
    );
  }

  return result;
}

// SNCF : calcul des trajets ferroviaires.
// La ligne P vers Longueville est un service Transilien,
// donc on ne filtre pas les résultats pour garder uniquement les TER.
async function getSncfStationJourney(
  apiKey,
  fromStationId,
  toStationId,
  departureDateTime
) {
  const params = new URLSearchParams({
    from: fromStationId,
    to: toStationId,
    datetime: departureDateTime,
    datetime_represents: "departure",
    data_freshness: "realtime",
    count: "10",
  });

  const authorization = Buffer
    .from(`${apiKey}:`)
    .toString("base64");

  const response = await fetch(
    `${SNCF_URL}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
      },
    }
  );

  const data = await readJson(response, "API SNCF");
  const result = selectBestJourney(data, departureDateTime);

  if (!result) {
    throw new Error(
      "SNCF : aucun trajet trouvé entre les deux gares"
    );
  }

  return result;
}

async function getPrimBatch(apiKey, start, destinations) {
  const results = {};

  for (
    let index = 0;
    index < destinations.length;
    index += 4
  ) {
    const batch = destinations.slice(index, index + 4);

    const batchResults = await Promise.all(
      batch.map(async ({ key, destination }) => {
        try {
          return {
            key,
            result: await getPrimJourney(
              apiKey,
              start,
              destination
            ),
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
      })
    );

    batchResults.forEach((item) => {
      results[item.key] = item;
    });

    if (index + 4 < destinations.length) {
      await pause(1100);
    }
  }

  return results;
}

function copyPrimResults(
  destinations,
  results,
  times,
  errors,
  details
) {
  for (const destination of destinations) {
    const selected = results[destination.key];

    for (const name of destination.names) {
      if (!selected?.result) {
        times[name] = null;
        errors[name] =
          selected?.error || "Trajet indisponible";
        continue;
      }

      times[name] = selected.result.minutes;

      details[name] = {
        minutes: selected.result.minutes,
        departure:
          selected.result.journey?.departure_date_time || null,
        arrival:
          selected.result.journey?.arrival_date_time || null,
        destination:
          destination.destinationName || destination.key,
      };
    }
  }
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

export default async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  const IDFM_API_KEY = process.env.IDFM_API_KEY;
  const SNCF_API_KEY = process.env.SNCF_API_KEY;

  const site = String(
    process.env.VITE_SITE || "lpdl"
  ).toLowerCase();

  if (!IDFM_API_KEY) {
    return res.status(500).json({
      error:
        "La variable IDFM_API_KEY n'est pas configurée dans Vercel.",
    });
  }

  const times = {};
  const errors = {};
  const details = {};

  // ============================================================
  // CONFIGURATION LPDL
  // ============================================================

  const lpdlStart = {
    lat: 48.864725,
    lon: 2.343634,
  };

  const gareDuNordCoords = {
    lat: 48.8809,
    lon: 2.3553,
  };

  const gareDeLEstCoords = {
    lat: 48.8761,
    lon: 2.3592,
  };

  const lpdlDestinations = [
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
      key: "liazide",
      names: ["liazide"],
      lat: 49.019392,
      lon: 2.153672,
    },
    {
      key: "poissy",
      names: ["rachid", "toufik"],
      lat: 48.933,
      lon: 2.04,
    },
  ];

  // ============================================================
  // CONFIGURATION RHAPSODY
  // ============================================================

  const rhapsodyStart = {
    lat: 48.911619,
    lon: 2.333753,
  };

  const rhapsodyDestinations = [
    {
      key: "alvaro",
      names: ["alvaro"],
      lat: 48.9833,
      lon: 2.2667,
    },
    {
      key: "camara",
      names: ["camara"],
      lat: 48.904444,
      lon: 2.306389,
    },
    {
      key: "bazil",
      names: ["bazil"],
      lat: 49.05227,
      lon: 2.6635,
    },
    {
      key: "bongo",
      names: ["bongo"],
      lat: 49.0,
      lon: 2.3333,
    },
    {
      key: "picart",
      names: ["picart"],
      lat: 48.800833,
      lon: 2.173056,
    },
    {
      key: "royer",
      names: ["royer"],
      lat: 48.93778,
      lon: 2.93556,
    },
  ];

  try {
    // ============================================================
    // RHAPSODY
    // ============================================================

    if (site === "rhapsody") {
      const jobs = rhapsodyDestinations.map(
        (destination) => ({
          key: destination.key,
          destination,
        })
      );

      const results = await getPrimBatch(
        IDFM_API_KEY,
        rhapsodyStart,
        jobs
      );

      copyPrimResults(
        rhapsodyDestinations,
        results,
        times,
        errors,
        details
      );

      // Nicodeme :
      // Rhapsody -> Gare du Nord -> Bornel-Belle-Église.
      try {
        if (!SNCF_API_KEY) {
          throw new Error(
            "SNCF_API_KEY absente du projet Vercel dashboard-rhapsody"
          );
        }

        const firstLeg = await getPrimJourney(
          IDFM_API_KEY,
          rhapsodyStart,
          gareDuNordCoords
        );

        const stationArrival =
          firstLeg.journey?.arrival_date_time;

        if (!stationArrival) {
          throw new Error(
            "Arrivée à Gare du Nord introuvable"
          );
        }

        const transferMinutes = 10;

        const trainDateTime = addMinutes(
          stationArrival,
          transferMinutes
        );

        if (!trainDateTime) {
          throw new Error(
            "Horaire Gare du Nord invalide"
          );
        }

        const train = await getSncfStationJourney(
          SNCF_API_KEY,
          "stop_area:SNCF:87271007",
          "stop_area:SNCF:87276717",
          trainDateTime
        );

        times.nicodeme =
          firstLeg.minutes +
          transferMinutes +
          train.minutes;

        details.nicodeme = {
          destination: "Bornel-Belle-Église",
          rhapsodyToGareDuNord: firstLeg.minutes,
          correspondence: transferMinutes,
          gareDuNordToBornel: train.minutes,
          gareDuNordArrival: stationArrival,
          trainDeparture:
            train.journey?.departure_date_time || null,
          bornelArrival:
            train.journey?.arrival_date_time || null,
          totalMinutes: times.nicodeme,
        };
      } catch (error) {
        times.nicodeme = null;
        errors.nicodeme = getErrorMessage(error);
      }
    } else {
      // ============================================================
      // LPDL — TRAJETS IDFM
      // ============================================================

      const jobs = [
        ...lpdlDestinations.map(
          (destination) => ({
            key: destination.key,
            destination,
          })
        ),
        {
          key: "gareDuNord",
          destination: gareDuNordCoords,
        },
        {
          key: "gareDeLEst",
          destination: gareDeLEstCoords,
        },
      ];

      const results = await getPrimBatch(
        IDFM_API_KEY,
        lpdlStart,
        jobs
      );

      copyPrimResults(
        lpdlDestinations,
        results,
        times,
        errors,
        details
      );

      // ============================================================
      // CÉDRIC — LOUVRE -> GARE DE L'EST -> LIGNE P -> LONGUEVILLE
      // ============================================================

      try {
        if (!SNCF_API_KEY) {
          throw new Error(
            "SNCF_API_KEY absente du projet Vercel dashboard-vinci"
          );
        }

        const firstLeg = results.gareDeLEst;

        if (!firstLeg?.result) {
          throw new Error(
            firstLeg?.error ||
              "Trajet vers Gare de l'Est indisponible"
          );
        }

        const stationArrival =
          firstLeg.result.journey?.arrival_date_time;

        if (!stationArrival) {
          throw new Error(
            "Arrivée à Gare de l'Est introuvable"
          );
        }

        const transferMinutes = 10;

        const trainDateTime = addMinutes(
          stationArrival,
          transferMinutes
        );

        if (!trainDateTime) {
          throw new Error(
            "Horaire Gare de l'Est invalide"
          );
        }

        const train = await getSncfStationJourney(
          SNCF_API_KEY,
          "stop_area:SNCF:87113001",
          "stop_area:SNCF:87116137",
          trainDateTime
        );

        times.cedric =
          firstLeg.result.minutes +
          transferMinutes +
          train.minutes;

        details.cedric = {
          destination: "Gare de Longueville",
          louvreToGareDeLEst: firstLeg.result.minutes,
          correspondence: transferMinutes,
          gareDeLEstToLongueville: train.minutes,
          gareDeLEstArrival: stationArrival,
          trainDeparture:
            train.journey?.departure_date_time || null,
          longvilleArrival:
            train.journey?.arrival_date_time || null,
          totalMinutes: times.cedric,
        };
      } catch (error) {
        times.cedric = null;
        errors.cedric = getErrorMessage(error);
      }

      // ============================================================
      // JASON — LOUVRE -> GARE DU NORD -> TRAIN -> COMPIÈGNE
      // ============================================================

      try {
        if (!SNCF_API_KEY) {
          throw new Error(
            "SNCF_API_KEY absente du projet Vercel dashboard-vinci"
          );
        }

        const firstLeg = results.gareDuNord;

        if (!firstLeg?.result) {
          throw new Error(
            firstLeg?.error ||
              "Trajet vers Gare du Nord indisponible"
          );
        }

        const stationArrival =
          firstLeg.result.journey?.arrival_date_time;

        if (!stationArrival) {
          throw new Error(
            "Arrivée à Gare du Nord introuvable"
          );
        }

        const transferMinutes = 10;

        const trainDateTime = addMinutes(
          stationArrival,
          transferMinutes
        );

        if (!trainDateTime) {
          throw new Error(
            "Horaire Gare du Nord invalide"
          );
        }

        const train = await getSncfStationJourney(
          SNCF_API_KEY,
          "stop_area:SNCF:87271007",
          "stop_area:SNCF:87276691",
          trainDateTime
        );

        times.jason =
          firstLeg.result.minutes +
          transferMinutes +
          train.minutes;

        details.jason = {
          destination: "Gare de Compiègne",
          laPosteToGareDuNord: firstLeg.result.minutes,
          correspondence: transferMinutes,
          gareDuNordToCompiegne: train.minutes,
          gareDuNordArrival: stationArrival,
          trainDeparture:
            train.journey?.departure_date_time || null,
          arrivalCompiegne:
            train.journey?.arrival_date_time || null,
          totalMinutes: times.jason,
        };
      } catch (error) {
        times.jason = null;
        errors.jason = getErrorMessage(error);
      }
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=30"
    );

    return res.status(200).json({
      site,
      times,
      errors,
      details,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Erreur lors du calcul des trajets",
      details: getErrorMessage(error),
    });
  }
}
