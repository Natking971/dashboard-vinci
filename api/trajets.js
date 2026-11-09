// api/trajets.js
// Calcul des trajets en transports en commun avec PRIM / Navitia IDFM.
//
// À placer dans le dossier "api" à la racine du projet Vercel.
// Variable Vercel requise : IDFM_API_KEY

const PRIM_JOURNEYS_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const START = {
  name: "Châtelet - Les Halles",
  lon: 2.3469,
  lat: 48.8626,
};

// Navitia attend les coordonnées dans l'ordre longitude;latitude.
const DESTINATIONS = [
  {
    key: "ghulam",
    name: "Lagny - Thorigny",
    lon: 2.704251,
    lat: 48.8822,
  },
  {
    key: "nathan",
    name: "Jean Moulin, Paris 14e",
    lon: 2.3186,
    lat: 48.8263,
  },
  {
    key: "michael",
    name: "Nanterre-Préfecture",
    lon: 2.223138,
    lat: 48.895631,
  },
  {
    key: "jason",
    name: "Compiègne",
    lon: 2.8218,
    lat: 49.4203,
  },
  {
    key: "cedric",
    name: "Pierrefitte - Stains",
    lon: 2.372285,
    lat: 48.963873,
  },
  {
    key: "liazide",
    name: "Pierrelaye",
    lon: 2.1537,
    lat: 49.0194,
  },
  {
    key: "rachid",
    name: "Poissy",
    lon: 2.04,
    lat: 48.933,
  },
  {
    key: "toufik",
    name: "Poissy",
    lon: 2.04,
    lat: 48.933,
  },
  {
    key: "ayoub",
    name: "Nanterre-Ville (RER A)",
    lon: 2.19584,
    lat: 48.89533,
  },
];

let cachedAuthMode = null;

function createAuthHeaders(apiKey, mode) {
  const base = {
    Accept: "application/json",
    "User-Agent": "dashboard-vinci/1.0",
  };

  if (mode === "apikey") {
    return { ...base, apikey: apiKey };
  }

  if (mode === "bearer") {
    return { ...base, Authorization: `Bearer ${apiKey}` };
  }

  // Format historique utilisé par Navitia.
  return { ...base, Authorization: apiKey };
}

function parisDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return (
    `${values.year}${values.month}${values.day}` +
    `T${values.hour}${values.minute}${values.second}`
  );
}

function buildJourneyUrl(destination, freshness = "realtime") {
  const params = new URLSearchParams();

  params.set("from", `${START.lon};${START.lat}`);
  params.set("to", `${destination.lon};${destination.lat}`);
  params.set("datetime", parisDateTime());
  params.set("datetime_represents", "departure");
  params.set("data_freshness", freshness);
  params.set("direct_path", "none");
  params.set("count", "6");
  params.set("max_nb_transfers", "5");
  params.set("max_duration", "10800");
  params.set("language", "fr-FR");
  params.append("first_section_mode[]", "walking");
  params.append("last_section_mode[]", "walking");

  return `${PRIM_JOURNEYS_URL}?${params.toString()}`;
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPrim(url, apiKey) {
  const modes = cachedAuthMode
    ? [cachedAuthMode]
    : ["apikey", "authorization", "bearer"];

  let lastResponse = null;

  for (const mode of modes) {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: createAuthHeaders(apiKey, mode),
    });

    lastResponse = response;

    if (response.ok) {
      cachedAuthMode = mode;
      return response;
    }

    // On essaie un autre format d'authentification uniquement pour 401/403.
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }
  }

  return lastResponse;
}

function chooseBestJourney(data) {
  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];

  const publicTransportJourneys = journeys.filter(journey => {
    const hasPublicTransport = Array.isArray(journey.sections)
      && journey.sections.some(section => section.type === "public_transport");

    return hasPublicTransport && Number.isFinite(journey.duration);
  });

  return publicTransportJourneys.sort(
    (first, second) => first.duration - second.duration
  )[0] || null;
}

function journeyDetails(journey) {
  const lines = (journey.sections || [])
    .filter(section => section.type === "public_transport")
    .map(section => {
      const info = section.display_informations || {};
      return info.code || info.name || info.commercial_mode || null;
    })
    .filter(Boolean);

  return {
    duration: Math.round(journey.duration / 60),
    departureDateTime: journey.departure_date_time || null,
    arrivalDateTime: journey.arrival_date_time || null,
    transfers: Number.isFinite(journey.nb_transfers)
      ? journey.nb_transfers
      : null,
    status: journey.status || null,
    lines: [...new Set(lines)],
  };
}

async function calculateDestination(destination, apiKey) {
  // Première tentative avec les données temps réel.
  let freshness = "realtime";
  let url = buildJourneyUrl(destination, freshness);
  let response = await requestPrim(url, apiKey);

  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      `Réponse IDFM invalide pour ${destination.name} (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    const apiMessage =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      rawText.slice(0, 180);

    throw new Error(
      `${destination.name}: HTTP ${response.status} - ${apiMessage}`
    );
  }

  let bestJourney = chooseBestJourney(data);

  // Certaines lignes n'exposent pas toujours de calcul temps réel.
  // Dans ce cas, on tente le planning théorique plutôt que d'afficher une fausse durée.
  if (!bestJourney) {
    freshness = "base_schedule";
    url = buildJourneyUrl(destination, freshness);
    response = await requestPrim(url, apiKey);

    const fallbackText = await response.text();

    try {
      data = fallbackText ? JSON.parse(fallbackText) : {};
    } catch {
      data = {};
    }

    if (response.ok) {
      bestJourney = chooseBestJourney(data);
    }
  }

  if (!bestJourney) {
    throw new Error(`Aucun trajet en transport trouvé vers ${destination.name}`);
  }

  return {
    key: destination.key,
    name: destination.name,
    freshness,
    ...journeyDetails(bestJourney),
  };
}

async function mapInBatches(items, batchSize, mapper) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.allSettled(batch.map(mapper));
    results.push(...batchResults);

    // L'API PRIM impose une limite de requêtes par seconde.
    if (index + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  return results;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.IDFM_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "La variable IDFM_API_KEY n'est pas configurée dans ce déploiement Vercel.",
    });
  }

  try {
    const settledResults = await mapInBatches(
      DESTINATIONS,
      4,
      destination => calculateDestination(destination, apiKey)
    );

    const times = {};
    const details = {};
    const errors = [];

    settledResults.forEach((result, index) => {
      const destination = DESTINATIONS[index];

      if (result.status === "fulfilled") {
        times[destination.key] = result.value.duration;
        details[destination.key] = result.value;
      } else {
        times[destination.key] = null;
        errors.push({
          key: destination.key,
          destination: destination.name,
          message: result.reason?.message || "Erreur inconnue",
        });
      }
    });

    const successfulCount = Object.values(times).filter(Number.isFinite).length;

    // Cache CDN court. Le navigateur utilise quand même cache:no-store,
    // mais Vercel peut réutiliser une réponse récente côté serveur.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=60"
    );

    return res.status(successfulCount > 0 ? 200 : 502).json({
      times,
      details,
      errors,
      updatedAt: new Date().toISOString(),
      successfulCount,
      totalCount: DESTINATIONS.length,
      authMode: cachedAuthMode,
    });
  } catch (error) {
    console.error("Erreur globale /api/trajets :", error);

    return res.status(500).json({
      error: error.message || "Impossible de calculer les trajets",
      updatedAt: new Date().toISOString(),
    });
  }
}
