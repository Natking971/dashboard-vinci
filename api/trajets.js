// /api/trajets.js
// API des trajets personnels multi-sites.
// Le site est détecté avec VITE_SITE dans Vercel.
// LPDL = trajets historiques + Jason vers Compiègne.
// Rhapsody = 27-31 rue de Clichy, 93400 Saint-Ouen-sur-Seine.

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

  if (timestamp === null) {
    return null;
  }

  return formatDate(
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
        section.type !== "public_transport"
      ) {
        return false;
      }

      const informations =
        JSON.stringify(
          section.display_informations || {}
        ).toUpperCase();

      return informations.includes("TER");
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

async function getJson(response, service) {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `${service} HTTP ${response.status} : ${body.slice(0, 180)}`
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

  const data = await getJson(response, "PRIM");
  const result = selectBestJourney(data);

  if (!result) {
    throw new Error("PRIM : aucun trajet trouvé");
  }

  return result;
}

async function getSncfJourney(apiKey, from, to) {
  const params = new URLSearchParams({
    from: `${from.lon};${from.lat}`,
    to: `${to.lon};${to.lat}`,
    datetime: formatDate(Date.now()),
    datetime_represents: "departure",
    data_freshness: "realtime",
    count: "10",
  });

  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");

  const response = await fetch(
    `${SNCF_URL}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
    }
  );

  const data = await getJson(response, "SNCF");
  const result = selectBestJourney(data);

  if (!result) {
    throw new Error("SNCF : aucun trajet trouvé");
  }

  return result;
}

async function getJourney(
  apiKey,
  sncfApiKey,
  from,
  to,
  allowSncfFallback = false
) {
  try {
    return await getPrimJourney(
      apiKey,
      from,
      to
    );
  } catch (primError) {
    if (
      !allowSncfFallback ||
      !sncfApiKey
    ) {
      throw primError;
    }

    return await getSncfJourney(
      sncfApiKey,
      from,
      to
    );
  }
}

export default async function handler(
  req,
  res
) {
  const IDFM_API_KEY =
    process.env.IDFM_API_KEY;

  const SNCF_API_KEY =
    process.env.SNCF_API_KEY;

  const site = String(
    process.env.VITE_SITE || "lpdl"
  ).toLowerCase();

  if (!IDFM_API_KEY) {
    return res.status(500).json({
      error:
        "La variable IDFM_API_KEY n'est pas configurée dans Vercel.",
    });
  }

  // ============================================================
  // CONFIGURATION LPDL
  // ============================================================

  const lpdlStart = {
    lat: 48.864725,
    lon: 2.343634,
  };

  const gareDuNord = {
    lat: 48.8809,
    lon: 2.3553,
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
      names: ["rachid", "toufik"],
      lat: 48.933,
      lon: 2.04,
    },
  ];

  // ============================================================
  // CONFIGURATION RHAPSODY
  // Départ : 27-31 rue de Clichy, 93400 Saint-Ouen-sur-Seine
  // ============================================================

  const rhapsodyStart = {
    // Point de départ utilisé pour l'itinéraire autour du bâtiment.
    // La station Mairie de Saint-Ouen est à proximité immédiate.
    lat: 48.911619,
    lon: 2.333753,
  };

  const rhapsodyDestinations = [
    {
      key: "nicodeme",
      names: ["nicodeme"],
      lat: 49.1989,
      lon: 2.21,
    },
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
      lon: 2.66350,
    },
    {
      key: "bongo",
      names: ["bongo"],
      lat: 49.0000,
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

  const times = {};
  const errors = {};
  const details = {};

  try {
    // ============================================================
    // RHAPSODY
    // ============================================================

    if (site === "rhapsody") {
      const results = {};

      const jobs =
        rhapsodyDestinations.map(
          (destination) => ({
            key: destination.key,
            destination,
          })
        );

      // Maximum 4 requêtes simultanées pour ne pas saturer PRIM.
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
                    await getJourney(
                      IDFM_API_KEY,
                      SNCF_API_KEY,
                      rhapsodyStart,
                      destination,
                      true
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

        batchResults.forEach(
          (item) => {
            results[item.key] = item;
          }
        );

        if (
          index + 4 <
          jobs.length
        ) {
          await pause(1100);
        }
      }

      rhapsodyDestinations.forEach(
        (destination) => {
          const selected =
            results[
              destination.key
            ];

          destination.names.forEach(
            (name) => {
              if (!selected?.result) {
                times[name] = null;

                errors[name] =
                  selected?.error ||
                  "Trajet indisponible";

                return;
              }

              times[name] =
                selected.result.minutes;

              details[name] = {
                minutes:
                  selected.result.minutes,

                departure:
                  selected.result.journey
                    ?.departure_date_time ||
                  null,

                arrival:
                  selected.result.journey
                    ?.arrival_date_time ||
                  null,

                destination:
                  destination.key,
              };
            }
          );
        }
      );
    } else {
      // ============================================================
      // LPDL
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
          destination: gareDuNord,
        },
      ];

      const results = {};

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
                      lpdlStart,
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

        batchResults.forEach(
          (item) => {
            results[item.key] = item;
          }
        );

        if (
          index + 4 <
          jobs.length
        ) {
          await pause(1100);
        }
      }

      lpdlDestinations.forEach(
        (destination) => {
          const selected =
            results[
              destination.key
            ];

          destination.names.forEach(
            (name) => {
              if (!selected?.result) {
                times[name] = null;

                errors[name] =
                  selected?.error ||
                  "Trajet indisponible";

                return;
              }

              times[name] =
                selected.result.minutes;

              details[name] = {
                minutes:
                  selected.result.minutes,

                departure:
                  selected.result.journey
                    ?.departure_date_time ||
                  null,

                arrival:
                  selected.result.journey
                    ?.arrival_date_time ||
                  null,
              };
            }
          );
        }
      );

      // ============================================================
      // JASON — LPDL -> Gare du Nord -> TER -> Compiègne
      // ============================================================

      try {
        if (!SNCF_API_KEY) {
          throw new Error(
            "SNCF_API_KEY non configurée dans Vercel"
          );
        }

        const firstLeg =
          results.gareDuNord;

        if (!firstLeg?.result) {
          throw new Error(
            firstLeg?.error ||
              "Trajet vers Gare du Nord indisponible"
          );
        }

        const transferMinutes = 10;

        const arrivalGareDuNord =
          firstLeg.result.journey
            .arrival_date_time;

        const terSearchTime =
          addMinutes(
            arrivalGareDuNord,
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

        times.jason =
          firstLeg.result.minutes +
          transferMinutes +
          ter.minutes;

        details.jason = {
          destination:
            "Gare de Compiègne",

          laPosteToGareDuNord:
            firstLeg.result.minutes,

          correspondence:
            transferMinutes,

          waitingAndTer:
            ter.minutes,

          terDeparture:
            ter.journey
              ?.departure_date_time ||
            null,

          arrivalCompiegne:
            ter.journey
              ?.arrival_date_time ||
            null,

          totalMinutes:
            times.jason,
        };
      } catch (error) {
        times.jason = null;

        errors.jason =
          error instanceof Error
            ? error.message
            : String(error);
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
      updatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error:
        "Erreur lors du calcul des trajets",

      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
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

      count:
        "10",
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
