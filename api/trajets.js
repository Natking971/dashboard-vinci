
// api/trajets.js
// Calcul des trajets en transports en commun avec PRIM / Navitia IDFM et SNCF.
// Variables Vercel requises : IDFM_API_KEY et SNCF_API_KEY.

const PRIM_JOURNEYS_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_JOURNEYS_URL =
  "https://api.sncf.com/v1/coverage/sncf/journeys";

// ============================================================
// DÉPART : LA POSTE DU LOUVRE
// ============================================================

const START = {
  name: "La Poste du Louvre",
  lon: 2.34379,
  lat: 48.86473,
};

// ============================================================
// JASON : GARE DU NORD
// ============================================================

const GARE_DU_NORD = {
  key: "gareDuNord",
  name: "Gare du Nord",
  lon: 2.3553,
  lat: 48.8809,
};

const JASON_TRAIN_FROM = "stop_area:SNCF:87271007";
const JASON_TRAIN_TO = "stop_area:SNCF:87276691";
const JASON_TRANSFER_MINUTES = 10;

// ============================================================
// AUTRES DESTINATIONS
// ============================================================

const DESTINATIONS = [
  {
    key: "ghulam",
    name: "Gare de Lagny - Thorigny",
    lon: 2.70404228,
    lat: 48.88218325,
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
    key: "cedric",
    name: "Gare de Longueville",
    lon: 3.249822,
    lat: 48.513703,
  },
  {
    key: "liazide",
    name: "Gare de Pierrelaye",
    lon: 2.1537,
    lat: 49.0194,
  },
  {
    key: "ayoub",
    name: "Gare de Nanterre-Ville",
    lon: 2.19584,
    lat: 48.89533,
  },
  {
    key: "poissy",
    name: "Gare de Poissy",
    lon: 2.04,
    lat: 48.933,
    sharedKeys: ["rachid", "toufik"],
  },
];

let cachedAuthMode = null;

// ============================================================
// AUTHENTIFICATION IDFM
// ============================================================

function createAuthHeaders(apiKey, mode) {
  const base = {
    Accept: "application/json",
    "User-Agent": "dashboard-vinci/1.0",
  };

  if (mode === "apikey") {
    return { ...base, apikey: apiKey };
  }

  if (mode === "bearer") {
    return {
      ...base,
      Authorization: `Bearer ${apiKey}`,
    };
  }

  return {
    ...base,
    Authorization: apiKey,
  };
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
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );

  return `${values.year}${values.month}${values.day}T${values.hour}${values.minute}${values.second}`;
}

// ============================================================
// CONSTRUCTION REQUÊTE IDFM
// ============================================================

function buildJourneyUrl(
  destination,
  freshness = "realtime",
  departureDateTime = parisDateTime(),
  start = START
) {
  const params = new URLSearchParams();

  params.set("from", `${start.lon};${start.lat}`);
  params.set("to", `${destination.lon};${destination.lat}`);
  params.set("datetime", departureDateTime);
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

// ============================================================
// FETCH AVEC TIMEOUT
// ============================================================

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// REQUÊTE IDFM
// ============================================================

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

    if (response.status !== 401 && response.status !== 403) {
      return response;
    }
  }

  return lastResponse;
}

// ============================================================
// SÉLECTION DU MEILLEUR TRAJET IDFM
// ============================================================

function chooseBestJourney(data) {
  const journeys = Array.isArray(data?.journeys)
    ? data.journeys
    : [];

  return journeys
    .filter(journey =>
      Array.isArray(journey.sections) &&
      journey.sections.some(
        section => section.type === "public_transport"
      ) &&
      Number.isFinite(Number(journey.duration))
    )
    .sort(
      (a, b) => Number(a.duration) - Number(b.duration)
    )[0] || null;
}

function journeyDetails(journey) {
  const lines = (journey.sections || [])
    .filter(section => section.type === "public_transport")
    .map(section => {
      const info = section.display_informations || {};

      return (
        info.code ||
        info.name ||
        info.commercial_mode ||
        null
      );
    })
    .filter(Boolean);

  return {
    duration: Math.round(Number(journey.duration) / 60),
    departureDateTime: journey.departure_date_time || null,
    arrivalDateTime: journey.arrival_date_time || null,
    transfers: Number.isFinite(journey.nb_transfers)
      ? journey.nb_transfers
      : null,
    status: journey.status || null,
    lines: [...new Set(lines)],
  };
}

// ============================================================
// CALCUL D'UN TRAJET IDFM
// ============================================================

async function calculateDestination(
  destination,
  apiKey,
  departureDateTime = parisDateTime(),
  start = START
) {
  let freshness = "realtime";

  let response = await requestPrim(
    buildJourneyUrl(destination, freshness, departureDateTime, start),
    apiKey
  );

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
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      rawText.slice(0, 180);

    throw new Error(
      `${destination.name}: HTTP ${response.status} - ${message}`
    );
  }

  let bestJourney = chooseBestJourney(data);

  // Si aucun trajet en temps réel, tentative avec les horaires théoriques.
  if (!bestJourney) {
    freshness = "base_schedule";

    response = await requestPrim(
      buildJourneyUrl(destination, freshness, departureDateTime, start),
      apiKey
    );

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
    throw new Error(
      `Aucun trajet en transport trouvé vers ${destination.name}`
    );
  }

  return {
    key: destination.key,
    name: destination.name,
    freshness,
    ...journeyDetails(bestJourney),
  };
}

// ============================================================
// JASON : AJOUT DES 10 MINUTES DE CORRESPONDANCE
// ============================================================

function addMinutesToDateTime(value, minutes) {
  if (!/^\d{8}T\d{6}$/.test(value || "")) {
    throw new Error(
      "Horaire d'arrivée à Gare du Nord invalide"
    );
  }

  const date = new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(9, 11)),
    Number(value.slice(11, 13)),
    Number(value.slice(13, 15))
  ) + minutes * 60000);

  const pad = number =>
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

// ============================================================
// JASON : RECHERCHE DU TRAIN SNCF
// ============================================================

async function calculateSncfTrain(
  apiKey,
  departureDateTime,
  fromStation = JASON_TRAIN_FROM,
  toStation = JASON_TRAIN_TO,
  destinationLabel = "Gare de Compiègne"
) {
  if (!apiKey) {
    throw new Error(
      "SNCF_API_KEY absente du projet Vercel"
    );
  }

  const params = new URLSearchParams({
    from: fromStation,
    to: toStation,
    datetime: departureDateTime,
    datetime_represents: "departure",
    count: "6",
  });

  const authorization = Buffer
    .from(`${apiKey}:`)
    .toString("base64");

  const response = await fetchWithTimeout(
    `${SNCF_JOURNEYS_URL}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
        "User-Agent": "dashboard-vinci/1.0",
      },
    },
    20000
  );

  const rawText = await response.text();

  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      `Réponse SNCF invalide (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      rawText.slice(0, 180);

    throw new Error(
      `SNCF HTTP ${response.status} - ${message}`
    );
  }

  const journeys = Array.isArray(data?.journeys)
    ? data.journeys
    : [];

  const trains = journeys
    .filter(journey =>
      Array.isArray(journey.sections) &&
      journey.sections.some(
        section => section.type === "public_transport"
      ) &&
      Number.isFinite(Number(journey.duration)) &&
      journey.departure_date_time &&
      journey.arrival_date_time
    )
    .sort(
      (a, b) => Number(a.duration) - Number(b.duration)
    );

  if (!trains.length) {
    throw new Error(
      `Aucun train trouvé depuis Gare du Nord vers ${destinationLabel}`
    );
  }

  const train = trains[0];

  const lines = train.sections
    .filter(section => section.type === "public_transport")
    .map(section => {
      const info = section.display_informations || {};

      return (
        info.code ||
        info.name ||
        info.commercial_mode ||
        null
      );
    })
    .filter(Boolean);

  return {
    duration: Math.round(Number(train.duration) / 60),
    departureDateTime: train.departure_date_time,
    arrivalDateTime: train.arrival_date_time,
    lines: [...new Set(lines)],
  };
}

// ============================================================
// JASON : TRAJET COMPLET LOUVRE -> COMPIÈGNE
// ============================================================

async function calculateJason(apiKey, sncfApiKey) {
  if (!sncfApiKey) {
    throw new Error(
      "La variable SNCF_API_KEY n'est pas configurée dans Vercel."
    );
  }

  // ÉTAPE 1 : La Poste du Louvre -> Gare du Nord avec IDFM.

  const firstLeg = await calculateDestination(
    GARE_DU_NORD,
    apiKey
  );

  const stationArrival = firstLeg.arrivalDateTime;

  if (!stationArrival) {
    throw new Error(
      "Heure d'arrivée à Gare du Nord introuvable"
    );
  }

  // ÉTAPE 2 : Correspondance de 10 minutes.

  const trainDeparture = addMinutesToDateTime(
    stationArrival,
    JASON_TRANSFER_MINUTES
  );

  // ÉTAPE 3 : Gare du Nord -> Gare de Compiègne avec SNCF.

  const train = await calculateSncfTrain(
    sncfApiKey,
    trainDeparture
  );

  // TEMPS TOTAL.

  const totalMinutes =
    firstLeg.duration +
    JASON_TRANSFER_MINUTES +
    train.duration;

  return {
    time: totalMinutes,

    detail: {
      key: "jason",
      name: "Jason",
      destination: "Gare de Compiègne",
      louvreToGareDuNord: firstLeg.duration,
      correspondence: JASON_TRANSFER_MINUTES,
      gareDuNordToCompiegne: train.duration,
      gareDuNordArrival: stationArrival,
      trainDeparture: train.departureDateTime,
      trainArrival: train.arrivalDateTime,
      trainLines: train.lines,
      totalMinutes,
    },
  };
}

// ============================================================
// EXÉCUTION PAR LOTS
// ============================================================

async function mapInBatches(items, batchSize, mapper) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    results.push(
      ...await Promise.allSettled(
        items.slice(i, i + batchSize).map(mapper)
      )
    );

    if (i + batchSize < items.length) {
      await new Promise(resolve =>
        setTimeout(resolve, 1100)
      );
    }
  }

  return results;
}

// ============================================================
// CONFIGURATION RHAPSODY
// ============================================================

const RHAPSODY_START = {
  name: "Rhapsody",
  lat: 48.911619,
  lon: 2.333753,
};

const RHAPSODY_GARE_DU_NORD = {
  key: "gareDuNordRhapsody",
  name: "Gare du Nord",
  lat: 48.8809,
  lon: 2.3553,
};

const RHAPSODY_DESTINATIONS = [
  {
    key: "alvaro",
    name: "Ermont",
    lon: 2.2667,
    lat: 48.9833,
  },
  {
    key: "camara",
    name: "Clichy",
    lon: 2.306389,
    lat: 48.904444,
  },
  {
    key: "bazil",
    name: "Longperrier",
    lon: 2.6635,
    lat: 49.05227,
  },
  {
    key: "bongo",
    name: "Montmorency",
    lon: 2.3333,
    lat: 49.0,
  },
  {
    key: "picart",
    name: "Viroflay",
    lon: 2.173056,
    lat: 48.800833,
  },
  {
    key: "royer",
    name: "Fublaines",
    lon: 2.93556,
    lat: 48.93778,
  },
];

async function calculateRhapsody(apiKey, sncfApiKey) {
  const times = {};
  const details = {};
  const errors = [];

  // Les six trajets directs au départ de Rhapsody.
  const results = await mapInBatches(
    RHAPSODY_DESTINATIONS,
    4,
    destination =>
      calculateDestination(
        destination,
        apiKey,
        parisDateTime(),
        RHAPSODY_START
      )
  );

  results.forEach((result, index) => {
    const destination = RHAPSODY_DESTINATIONS[index];

    if (result.status === "fulfilled") {
      times[destination.key] = result.value.duration;
      details[destination.key] = {
        ...result.value,
        destination: destination.name,
      };
    } else {
      times[destination.key] = null;
      errors.push({
        key: destination.key,
        destination: destination.name,
        message: result.reason?.message || "Erreur inconnue",
      });
    }
  });

  // Avril Nicodeme : Rhapsody -> Gare du Nord -> Bornel-Belle-Église.
  try {
    const firstLeg = await calculateDestination(
      RHAPSODY_GARE_DU_NORD,
      apiKey,
      parisDateTime(),
      RHAPSODY_START
    );

    if (!firstLeg.arrivalDateTime) {
      throw new Error("Arrivée à Gare du Nord introuvable");
    }

    const transferMinutes = 10;
    const trainDeparture = addMinutesToDateTime(
      firstLeg.arrivalDateTime,
      transferMinutes
    );

    const train = await calculateSncfTrain(
      sncfApiKey,
      trainDeparture,
      "stop_area:SNCF:87271007",
      "stop_area:SNCF:87276717",
      "Bornel-Belle-Église"
    );

    times.nicodeme =
      firstLeg.duration + transferMinutes + train.duration;

    details.nicodeme = {
      key: "nicodeme",
      name: "Avril Nicodeme",
      destination: "Bornel-Belle-Église",
      rhapsodyToGareDuNord: firstLeg.duration,
      correspondence: transferMinutes,
      gareDuNordToBornel: train.duration,
      gareDuNordArrival: firstLeg.arrivalDateTime,
      trainDeparture: train.departureDateTime,
      bornelArrival: train.arrivalDateTime,
      totalMinutes: times.nicodeme,
    };
  } catch (error) {
    times.nicodeme = null;
    errors.push({
      key: "nicodeme",
      destination: "Bornel-Belle-Église",
      message: error?.message || "Erreur lors du calcul du trajet",
    });
  }

  return { times, details, errors };
}

// ============================================================
// API PRINCIPALE
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  const apiKey = process.env.IDFM_API_KEY;
  const sncfApiKey = process.env.SNCF_API_KEY;
  const site = String(
    req.query?.site || process.env.VITE_SITE || "lpdl"
  ).toLowerCase();

  if (!apiKey) {
    return res.status(500).json({
      error:
        "La variable IDFM_API_KEY n'est pas configurée dans ce déploiement Vercel.",
    });
  }

  try {
    // ========================================================
    // RHAPSODY — CETTE BRANCHE NE MODIFIE PAS LES TRAJETS LPDL
    // ========================================================
    if (site === "rhapsody") {
      const result = await calculateRhapsody(apiKey, sncfApiKey);

      res.setHeader(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=60"
      );

      const successfulCount = Object.values(result.times)
        .filter(Number.isFinite).length;

      return res.status(successfulCount > 0 ? 200 : 502).json({
        site: "rhapsody",
        times: result.times,
        details: result.details,
        errors: result.errors,
        updatedAt: new Date().toISOString(),
        successfulCount,
        totalCount: Object.keys(result.times).length,
      });
    }

    // ========================================================
    // LA POSTE DU LOUVRE — CODE EXISTANT CONSERVÉ
    // ========================================================
    const settled = await mapInBatches(
      DESTINATIONS,
      4,
      destination => calculateDestination(destination, apiKey)
    );

    const times = {};
    const details = {};
    const errors = [];

    // Récupération des résultats IDFM.
    settled.forEach((result, index) => {
      const destination = DESTINATIONS[index];

      const keys = destination.sharedKeys || [
        destination.key,
      ];

      if (result.status === "fulfilled") {
        for (const key of keys) {
          times[key] = result.value.duration;

          details[key] = {
            ...result.value,
            key,
          };
        }
      } else {
        errors.push({
          key: destination.key,
          destination: destination.name,
          message:
            result.reason?.message || "Erreur inconnue",
        });

        for (const key of keys) {
          times[key] = null;
        }
      }
    });

    // ========================================================
    // JASON : IDFM + SNCF
    // ========================================================

    try {
      const jason = await calculateJason(
        apiKey,
        sncfApiKey
      );

      times.jason = jason.time;
      details.jason = jason.detail;

    } catch (error) {
      times.jason = null;

      errors.push({
        key: "jason",
        destination: "Gare de Compiègne",
        message:
          error?.message ||
          "Erreur lors du calcul du trajet de Jason",
      });
    }

    // ========================================================
    // RÉPONSE API
    // ========================================================

    const successfulCount = Object.values(times)
      .filter(Number.isFinite).length;

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=60"
    );

    return res.status(
      successfulCount > 0 ? 200 : 502
    ).json({
      times,
      details,
      errors,
      updatedAt: new Date().toISOString(),
      successfulCount,
      totalCount: Object.keys(times).length,
      authMode: cachedAuthMode,
    });

  } catch (error) {
    console.error(
      "Erreur globale /api/trajets :",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Impossible de calculer les trajets",
      updatedAt: new Date().toISOString(),
    });
  }
}
