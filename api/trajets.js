// /api/trajets.js
// PRIM / Île-de-France Mobilités + TER SNCF pour Jason

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

const SNCF_URL =
  "https://api.sncf.com/v1/journeys";

const pause = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseDate(value) {
  if (!/^\d{8}T\d{6}$/.test(value || "")) return null;

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
  const timestamp = parseDate(value);

  return timestamp === null
    ? null
    : formatDate(
        timestamp + minutes * 60_000
      );
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

  return Math.round(
    (end - start) / 60_000
  );
}

function hasPublicTransport(journey) {
  return journey?.sections?.some(
    (section) =>
      section.type === "public_transport"
  );
}

function hasTer(journey) {
  return journey?.sections?.some(
    (section) => {
      if (
        section.type !==
        "public_transport"
      ) {
        return false;
      }

      return JSON.stringify(
        section.display_informations || {}
      )
        .toUpperCase()
        .includes("TER");
    }
  );
}

function selectBestJourney(
  data,
  requestedDateTime = null,
  terOnly = false
) {
  let journeys =
    Array.isArray(data?.journeys)
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

  const reference =
    requestedDateTime ||
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
        Math.round(
          Number(journey.duration) / 60
        ),
    }))
    .sort(
      (a, b) =>
        a.minutes - b.minutes
    )[0];
}

async function getJson(
  response,
  service
) {
  const body =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `${service} HTTP ${response.status} : ${body.slice(
        0,
        180
      )}`
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `${service} a renvoyé un JSON invalide`
    );
  }
}

async function getPrimJourney(
  apiKey,
  from,
  to
) {
  const params =
    new URLSearchParams({
      from: `${from.lon};${from.lat}`,
      to: `${to.lon};${to.lat}`,
      data_freshness: "realtime",
      datetime_represents:
        "departure",
      count: "10",
    });

  const response = await fetch(
    `${PRIM_URL}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `apikey ${apiKey}`,
        apikey: apiKey,
      },
    }
  );

  const data =
    await getJson(
      response,
      "PRIM"
    );

  const result =
    selectBestJourney(data);

  if (!result) {
    throw new Error(
      "PRIM : aucun trajet trouvé"
    );
  }

  return result;
}

async function getSncfTer(
  apiKey,
  departureDateTime
) {
  const params =
    new URLSearchParams({
      from:
        "stop_area:SNCF:87271007",
      to:
        "stop_area:SNCF:87276691",
      datetime:
        departureDateTime,
      datetime_represents:
        "departure",
      data_freshness:
        "realtime",
      count: "10",
    });

  const basicAuth =
    Buffer.from(
      `${apiKey}:`
    ).toString("base64");

  const response =
    await fetch(
      `${SNCF_URL}?${params.toString()}`,
      {
        headers: {
          Accept:
            "application/json",
          Authorization:
            `Basic ${basicAuth}`,
        },
      }
    );

  const data =
    await getJson(
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
      "SNCF : aucun TER trouvé"
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

  if (
    !IDFM_API_KEY ||
    !SNCF_API_KEY
  ) {
    return res
      .status(500)
      .json({
        error:
          "IDFM_API_KEY ou SNCF_API_KEY non configurée dans Vercel",
      });
  }

  // Départ :
  // Châtelet - Les Halles
  const start = {
    lat: 48.8615,
    lon: 2.3465,
  };

  // Gare du Nord
  const gareDuNord = {
    lat: 48.8809,
    lon: 2.3553,
  };

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

  try {
    const jobs = [
      ...destinations.map(
        (destination) => ({
          key: destination.key,
          destination,
        })
      ),

      {
        key: "gareDuNord",
        destination:
          gareDuNord,
      },
    ];

    const results = {};

    // Maximum 4 appels PRIM à la fois
    for (
      let index = 0;
      index < jobs.length;
      index += 4
    ) {
      const batch =
        jobs.slice(
          index,
          index + 4
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
                    error instanceof
                    Error
                      ? error.message
                      : String(error),
                };
              }
            }
          )
        );

      batchResults.forEach(
        (item) => {
          results[item.key] =
            item;
        }
      );

      if (
        index + 4 <
        jobs.length
      ) {
        await pause(1100);
      }
    }

    // Autres techniciens
    destinations.forEach(
      (destination) => {
        const selected =
          results[
            destination.key
          ];

        destination.names.forEach(
          (name) => {
            if (
              !selected?.result
            ) {
              times[name] =
                null;

              errors[name] =
                selected?.error ||
                "Trajet indisponible";

              return;
            }

            times[name] =
              selected.result.minutes;
          }
        );
      }
    );

    // =========================
    // JASON
    // Châtelet
    // → Gare du Nord
    // → correspondance 10 min
    // → TER
    // → Gare de Compiègne
    // =========================

    try {
      const firstLeg =
        results.gareDuNord;

      if (
        !firstLeg?.result
      ) {
        throw new Error(
          firstLeg?.error ||
            "Trajet vers Gare du Nord indisponible"
        );
      }

      // Temps de marche /
      // correspondance dans la gare
      const transferMinutes = 10;

      const terSearchTime =
        addMinutes(
          firstLeg.result
            .journey
            .arrival_date_time,
          transferMinutes
        );

      if (!terSearchTime) {
        throw new Error(
          "Horaire Gare du Nord invalide"
        );
      }

      const ter =
        await getSncfTer(
          SNCF_API_KEY,
          terSearchTime
        );

      // Temps total réel Jason
      times.jason =
        firstLeg.result.minutes +
        transferMinutes +
        ter.minutes;

      details.jason = {
        chateletToGareDuNord:
          firstLeg.result.minutes,

        correspondence:
          transferMinutes,

        waitingAndTer:
          ter.minutes,

        terDeparture:
          ter.journey
            .departure_date_time ||
          null,

        arrivalCompiegne:
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

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=30"
    );

    return res
      .status(200)
      .json({
        times,
        errors,
        details,
        updatedAt:
          new Date().toISOString(),
      });
  } catch (error) {
    return res
      .status(500)
      .json({
        error:
          "Erreur lors du calcul des trajets",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
  }
}
