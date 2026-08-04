// api/trajets.js
// Calcul des temps de trajet en transports en commun avec l'API PRIM
// Île-de-France Mobilités.
//
// Variable requise dans Vercel :
// IDFM_API_KEY

const PRIM_API_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

// Point de départ : secteur La Poste du Louvre / Châtelet
const START_POINT = {
  lat: 48.864725,
  lon: 2.343634,
  label: "La Poste du Louvre",
};

// Destinations de l'équipe
const DESTINATIONS = [
  {
    key: "ghulam",
    names: ["ghulam"],
    label: "Lagny-Thorigny",
    lat: 48.882222,
    lon: 2.704167,
  },
  {
    key: "nathan",
    names: ["nathan"],
    label: "Jean Moulin",
    lat: 48.824744,
    lon: 2.318872,
  },
  {
    key: "michael",
    names: ["michael"],
    label: "Nanterre",
    lat: 48.895631,
    lon: 2.223138,
  },
  {
    key: "jason",
    names: ["jason"],
    label: "Chez tata",
    lat: 48.9621042,
    lon: 2.336431,
  },
  {
    key: "cedric",
    names: ["cedric"],
    label: "Pierrefitte",
    lat: 48.963873,
    lon: 2.372285,
  },
  {
    key: "liazide",
    names: ["liazide"],
    label: "Pierrelaye",
    lat: 49.019392,
    lon: 2.153672,
  },
  {
    key: "poissy",
    names: ["rachid", "toufik"],
    label: "Poissy",
    lat: 48.933,
    lon: 2.04,
  },
];

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseNavitiaDate(value) {
  if (!value || !/^\d{8}T\d{6}$/.test(value)) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15));

  return Date.UTC(year, month, day, hour, minute, second);
}

function getMinutesBetween(startValue, endValue) {
  const start = parseNavitiaDate(startValue);
  const end = parseNavitiaDate(endValue);

  if (start === null || end === null || end < start) {
    return null;
  }

  return Math.round((end - start) / 60000);
}

function journeyContainsPublicTransport(journey) {
  return Array.isArray(journey?.sections)
    ? journey.sections.some(
        (section) => section.type === "public_transport"
      )
    : false;
}

function getJourneyDurationMinutes(journey) {
  const duration = Number(journey?.duration);

  if (Number.isFinite(duration) && duration > 0) {
    return Math.round(duration / 60);
  }

  const calculatedDuration = getMinutesBetween(
    journey?.departure_date_time,
    journey?.arrival_date_time
  );

  return calculatedDuration;
}

function selectBestJourney(data) {
  if (!Array.isArray(data?.journeys)) {
    return null;
  }

  const validJourneys = data.journeys
    .filter((journey) => journeyContainsPublicTransport(journey))
    .map((journey) => ({
      journey,
      durationMinutes: getJourneyDurationMinutes(journey),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.durationMinutes) &&
        item.durationMinutes > 0
    )
    .sort((a, b) => a.durationMinutes - b.durationMinutes);

  return validJourneys[0] || null;
}

async function readJsonResponse(response, serviceName) {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `${serviceName} HTTP ${response.status} : ${body.slice(0, 250)}`
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${serviceName} a renvoyé une réponse invalide`);
  }
}

async function calculatePrimJourney(apiKey, destination) {
  const query = new URLSearchParams({
    from: `${START_POINT.lon};${START_POINT.lat}`,
    to: `${destination.lon};${destination.lat}`,
    data_freshness: "realtime",
    datetime_represents: "departure",
    count: "10",
  });

  const response = await fetch(
    `${PRIM_API_URL}?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: apiKey,
      },
    }
  );

  const data = await readJsonResponse(response, "PRIM");
  const selectedJourney = selectBestJourney(data);

  if (!selectedJourney) {
    throw new Error(
      `Aucun trajet trouvé vers ${destination.label}`
    );
  }

  return {
    durationMinutes: selectedJourney.durationMinutes,
    departure:
      selectedJourney.journey.departure_date_time || null,
    arrival:
      selectedJourney.journey.arrival_date_time || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  const apiKey = process.env.IDFM_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "La variable IDFM_API_KEY n'est pas configurée dans Vercel.",
    });
  }

  const times = {};
  const errors = {};
  const details = {};

  try {
    /*
     * On traite les destinations par petits groupes.
     * Cela évite d'envoyer trop de demandes simultanées à PRIM.
     */
    for (let index = 0; index < DESTINATIONS.length; index += 3) {
      const batch = DESTINATIONS.slice(index, index + 3);

      const results = await Promise.all(
        batch.map(async (destination) => {
          try {
            const journey = await calculatePrimJourney(
              apiKey,
              destination
            );

            return {
              destination,
              journey,
              error: null,
            };
          } catch (error) {
            return {
              destination,
              journey: null,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            };
          }
        })
      );

      results.forEach(({ destination, journey, error }) => {
        destination.names.forEach((personName) => {
          if (journey) {
            times[personName] = journey.durationMinutes;

            details[personName] = {
              destination: destination.label,
              latitude: destination.lat,
              longitude: destination.lon,
              departure: journey.departure,
              arrival: journey.arrival,
              durationMinutes: journey.durationMinutes,
            };
          } else {
            times[personName] = null;
            errors[personName] =
              error || "Temps de trajet indisponible";
          }
        });
      });

      if (index + 3 < DESTINATIONS.length) {
        await wait(1000);
      }
    }

    /*
     * Cache de 5 minutes.
     * Le dashboard peut donc se mettre à jour régulièrement
     * sans dépasser inutilement le quota de l'API.
     */
    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=60"
    );

    return res.status(200).json({
      times,
      errors,
      details,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erreur générale API trajets :", error);

    return res.status(500).json({
      error: "Impossible de calculer les trajets",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}
