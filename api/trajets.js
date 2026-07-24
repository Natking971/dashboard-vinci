// /api/trajets.js
// Calcul des trajets IDFM + cas spécial Jason en TER SNCF

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function navitiaDateToTimestamp(value) {
  if (!value || !/^\d{8}T\d{6}$/.test(value)) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15));

  return Date.UTC(
    year,
    month,
    day,
    hour,
    minute,
    second
  );
}

function timestampToNavitiaDate(timestamp) {
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

function addMinutesToNavitiaDate(value, minutes) {
  const timestamp = navitiaDateToTimestamp(value);

  if (timestamp === null) {
    return null;
  }

  return timestampToNavitiaDate(
    timestamp + minutes * 60_000
  );
}

function minutesBetween(start, end) {
  const startTimestamp =
    navitiaDateToTimestamp(start);

  const endTimestamp =
    navitiaDateToTimestamp(end);

  if (
    startTimestamp === null ||
    endTimestamp === null
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (endTimestamp - startTimestamp) / 60_000
    )
  );
}

function hasPublicTransport(journey) {
  return journey?.sections?.some(
    (section) =>
      section.type === "public_transport"
  );
}

function isTerJourney(journey) {
  return journey?.sections?.some((section) => {
    if (section.type !== "public_transport") {
      return false;
    }

    const informations = JSON.stringify(
      section.display_informations || {}
    ).toUpperCase();

    return informations.includes("TER");
  });
}

function selectEarliestArrival(journeys) {
  return [...journeys].sort((a, b) => {
    const arrivalA =
      navitiaDateToTimestamp(
        a.arrival_date_time
      ) ?? Infinity;

    const arrivalB =
      navitiaDateToTimestamp(
        b.arrival_date_time
      ) ?? Infinity;

    return arrivalA - arrivalB;
  })[0];
}

export default async function handler(req, res) {
  const IDFM_API_KEY =
    process.env.IDFM_API_KEY;

  const SNCF_API_KEY =
    process.env.SNCF_API_KEY;

  if (!IDFM_API_KEY) {
    return res.status(500).json({
      error: "IDFM_API_KEY non configurée",
    });
  }

  // Départ : Châtelet-Les Halles
  const start = {
    lat: 48.8615,
    lon: 2.3465,
  };

  // Gare du Nord pour la correspondance de Jason
  const gareDuNord = {
    lat: 48.8809,
    lon: 2.3553,
  };

  // Trajets couverts par Île-de-France Mobilités
  const trajetsIDFM = [
    {
      nom: "ghulam",
      lat: 48.882222,
      lon: 2.704167,
      name: "Lagny-Thorigny",
    },
    {
      nom: "nathan",
      lat: 48.824744,
      lon: 2.318872,
      name: "Jean Moulin T3a",
    },
    {
      nom: "michael",
      lat: 48.895631,
      lon: 2.223138,
      name: "Nanterre-Préfecture RER A",
    },
    {
      nom: "cedric",
      lat: 48.963873,
      lon: 2.372285,
      name: "Pierrefitte-Stains RER D",
    },
    {
      nom: "liazide",
      lat: 49.019392,
      lon: 2.153672,
      name: "Pierrelaye RER C",
    },
    {
      nom: "rachid",
      lat: 48.933,
      lon: 2.04,
      name: "Poissy RER A",
    },
    {
      nom: "toufik",
      lat: 48.933,
      lon: 2.04,
      name: "Poissy RER A",
    },
  ];

  const times = {};
  const errors = {};
  const details = {};

  async function getPrimJourney(
    fromPoint,
    toPoint
  ) {
    const params = new URLSearchParams({
      from: `${fromPoint.lon};${fromPoint.lat}`,
      to: `${toPoint.lon};${toPoint.lat}`,
      count: "10",
      data_freshness: "realtime",
      datetime_represents: "departure",
    });

    const url =
      "https://prim.iledefrance-mobilites.fr/" +
      `marketplace/v2/navitia/journeys?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        apikey: IDFM_API_KEY,
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `PRIM HTTP ${response.status} : ` +
        body.slice(0, 150)
      );
    }

    const data = await response.json();

    const journeys = Array.isArray(
      data.journeys
    )
      ? data.journeys
      : [];

    const candidates =
      journeys.filter(hasPublicTransport);

    if (candidates.length === 0) {
      throw new Error(
        "Aucun trajet trouvé par PRIM"
      );
    }

    return selectEarliestArrival(candidates);
  }

  async function getSncfJourney(
    departureDateTime
  ) {
    if (!SNCF_API_KEY) {
      throw new Error(
        "SNCF_API_KEY non configurée"
      );
    }

    const params = new URLSearchParams({
      // Paris Gare du Nord
      from: "stop_area:SNCF:87271007",

      // Gare de Compiègne
      to: "stop_area:SNCF:87276691",

      datetime: departureDateTime,
      datetime_represents: "departure",
      data_freshness: "realtime",
      count: "10",
    });

    const basicAuth = Buffer.from(
      `${SNCF_API_KEY}:`
    ).toString("base64");

    const url =
      "https://api.sncf.com/v1/" +
      `coverage/sncf/journeys?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `SNCF HTTP ${response.status} : ` +
        body.slice(0, 150)
      );
    }

    const data = await response.json();

    const journeys = Array.isArray(
      data.journeys
    )
      ? data.journeys
      : [];

    const publicTransportJourneys =
      journeys.filter(hasPublicTransport);

    const terJourneys =
      publicTransportJourneys.filter(
        isTerJourney
      );

    // On choisit d'abord un TER.
    // Si le mot TER n'est pas présent dans
    // la réponse, on garde le trajet SNCF.
    const candidates =
      terJourneys.length > 0
        ? terJourneys
        : publicTransportJourneys;

    if (candidates.length === 0) {
      throw new Error(
        "Aucun trajet SNCF trouvé vers Compiègne"
      );
    }

    return selectEarliestArrival(candidates);
  }

  try {
    // Calcul des sept trajets IDFM
    for (const trajet of trajetsIDFM) {
      try {
        const journey =
          await getPrimJourney(
            start,
            trajet
          );

        times[trajet.nom] = Math.round(
          journey.duration / 60
        );
      } catch (error) {
        times[trajet.nom] = null;
        errors[trajet.nom] =
          error.message;
      }

      await sleep(250);
    }

    // Cas spécial Jason :
    // Châtelet -> Gare du Nord -> TER -> Compiègne
    try {
      const firstLeg =
        await getPrimJourney(
          start,
          gareDuNord
        );

      // Temps prévu pour passer du RER
      // jusqu'aux quais TER
      const transferMinutes = 10;

      const sncfSearchTime =
        addMinutesToNavitiaDate(
          firstLeg.arrival_date_time,
          transferMinutes
        );

      if (!sncfSearchTime) {
        throw new Error(
          "Horaire Gare du Nord introuvable"
        );
      }

      const terJourney =
        await getSncfJourney(
          sncfSearchTime
        );

      const totalMinutes =
        minutesBetween(
          firstLeg.departure_date_time,
          terJourney.arrival_date_time
        );

      times.jason =
        totalMinutes ??
        Math.round(
          (
            firstLeg.duration +
            terJourney.duration
          ) /
            60 +
            transferMinutes
        );

      details.jason = {
        chateletToGareDuNordMinutes:
          Math.round(
            firstLeg.duration / 60
          ),

        transferMinutes,

        terMinutes: Math.round(
          terJourney.duration / 60
        ),

        departureDateTime:
          firstLeg.departure_date_time,

        terDepartureDateTime:
          terJourney.departure_date_time,

        arrivalDateTime:
          terJourney.arrival_date_time,
      };
    } catch (error) {
      times.jason = null;
      errors.jason = error.message;
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=240, stale-while-revalidate=60"
    );

    return res.status(200).json({
      times,
      errors,
      details,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error:
        "Erreur lors du calcul des trajets",

      details: error.message,
    });
  }
}
