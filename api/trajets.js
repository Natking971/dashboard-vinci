// api/trajets.js
// Calcul des trajets en transports en commun avec PRIM / Navitia IDFM.
// À placer dans le dossier "api" à la racine du projet Vercel.
// Variable Vercel requise : IDFM_API_KEY

const PRIM_JOURNEYS_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

// Départ : La Poste du Louvre, 50 rue du Louvre, Paris 1er.
// Coordonnées GPS du site : longitude, latitude.
const START = {
  name: "La Poste du Louvre",
  lon: 2.34379,
  lat: 48.86473,
};

// Coordonnées des gares / destinations confirmées.
// Rachid et Toufik partagent une seule requête vers la gare de Poissy.
const DESTINATIONS = [
  { key: "ghulam", name: "Gare de Lagny - Thorigny", lon: 2.70404228, lat: 48.88218325 },
  { key: "nathan", name: "Jean Moulin, Paris 14e", lon: 2.3186, lat: 48.8263 },
  { key: "michael", name: "Nanterre-Préfecture", lon: 2.223138, lat: 48.895631 },
  { key: "jason", name: "Gare de Compiègne", lon: 2.8218, lat: 49.4203 },
  { key: "cedric", name: "Gare de Longueville", lon: 3.249822, lat: 48.513703 },
  { key: "liazide", name: "Gare de Pierrelaye", lon: 2.1537, lat: 49.0194 },
  { key: "ayoub", name: "Gare de Nanterre-Ville", lon: 2.19584, lat: 48.89533 },
  { key: "poissy", name: "Gare de Poissy", lon: 2.04, lat: 48.933, sharedKeys: ["rachid", "toufik"] },
];

let cachedAuthMode = null;

function createAuthHeaders(apiKey, mode) {
  const base = { Accept: "application/json", "User-Agent": "dashboard-vinci/1.0" };
  if (mode === "apikey") return { ...base, apikey: apiKey };
  if (mode === "bearer") return { ...base, Authorization: `Bearer ${apiKey}` };
  return { ...base, Authorization: apiKey };
}

function parisDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return `${values.year}${values.month}${values.day}T${values.hour}${values.minute}${values.second}`;
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
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPrim(url, apiKey) {
  const modes = cachedAuthMode ? [cachedAuthMode] : ["apikey", "authorization", "bearer"];
  let lastResponse = null;
  for (const mode of modes) {
    const response = await fetchWithTimeout(url, { method: "GET", headers: createAuthHeaders(apiKey, mode) });
    lastResponse = response;
    if (response.ok) {
      cachedAuthMode = mode;
      return response;
    }
    if (response.status !== 401 && response.status !== 403) return response;
  }
  return lastResponse;
}

function chooseBestJourney(data) {
  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
  return journeys
    .filter(journey => Array.isArray(journey.sections)
      && journey.sections.some(section => section.type === "public_transport")
      && Number.isFinite(journey.duration))
    .sort((a, b) => a.duration - b.duration)[0] || null;
}

function journeyDetails(journey) {
  const lines = (journey.sections || [])
    .filter(section => section.type === "public_transport")
    .map(section => {
      const info = section.display_informations || {};
      return info.code || info.name || info.commercial_mode || null;
    }).filter(Boolean);
  return {
    duration: Math.round(journey.duration / 60),
    departureDateTime: journey.departure_date_time || null,
    arrivalDateTime: journey.arrival_date_time || null,
    transfers: Number.isFinite(journey.nb_transfers) ? journey.nb_transfers : null,
    status: journey.status || null,
    lines: [...new Set(lines)],
  };
}

async function calculateDestination(destination, apiKey) {
  let freshness = "realtime";
  let response = await requestPrim(buildJourneyUrl(destination, freshness), apiKey);
  const rawText = await response.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Réponse IDFM invalide pour ${destination.name} (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.error || rawText.slice(0, 180);
    throw new Error(`${destination.name}: HTTP ${response.status} - ${message}`);
  }

  let bestJourney = chooseBestJourney(data);
  if (!bestJourney) {
    freshness = "base_schedule";
    response = await requestPrim(buildJourneyUrl(destination, freshness), apiKey);
    const fallbackText = await response.text();
    try { data = fallbackText ? JSON.parse(fallbackText) : {}; } catch { data = {}; }
    if (response.ok) bestJourney = chooseBestJourney(data);
  }
  if (!bestJourney) throw new Error(`Aucun trajet en transport trouvé vers ${destination.name}`);
  return { key: destination.key, name: destination.name, freshness, ...journeyDetails(bestJourney) };
}

async function mapInBatches(items, batchSize, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    results.push(...await Promise.allSettled(items.slice(i, i + batchSize).map(mapper)));
    if (i + batchSize < items.length) await new Promise(resolve => setTimeout(resolve, 1100));
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
    return res.status(500).json({ error: "La variable IDFM_API_KEY n'est pas configurée dans ce déploiement Vercel." });
  }

  try {
    const settled = await mapInBatches(DESTINATIONS, 4, destination => calculateDestination(destination, apiKey));
    const times = {};
    const details = {};
    const errors = [];

    settled.forEach((result, index) => {
      const destination = DESTINATIONS[index];
      const keys = destination.sharedKeys || [destination.key];
      if (result.status === "fulfilled") {
        for (const key of keys) {
          times[key] = result.value.duration;
          details[key] = { ...result.value, key };
        }
      } else {
        errors.push({ key: destination.key, destination: destination.name, message: result.reason?.message || "Erreur inconnue" });
        for (const key of keys) times[key] = null;
      }
    });

    const successfulCount = Object.values(times).filter(Number.isFinite).length;
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    return res.status(successfulCount > 0 ? 200 : 502).json({
      times, details, errors, updatedAt: new Date().toISOString(),
      successfulCount, totalCount: Object.keys(times).length, authMode: cachedAuthMode,
    });
  } catch (error) {
    console.error("Erreur globale /api/trajets :", error);
    return res.status(500).json({ error: error.message || "Impossible de calculer les trajets", updatedAt: new Date().toISOString() });
  }
}
