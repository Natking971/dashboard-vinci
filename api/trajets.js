// /api/trajets.js
// Calcul des trajets en transports en commun avec PRIM / Navitia

export default async function handler(req, res) {
  const IDFM_API_KEY = process.env.IDFM_API_KEY;

  if (!IDFM_API_KEY) {
    console.error("IDFM_API_KEY non configurée");

    return res.status(500).json({
      error: "IDFM_API_KEY non configurée",
    });
  }

  // Point de départ : Châtelet-Les Halles
  const start = {
    lat: 48.8626,
    lon: 2.3469,
  };

  const trajets = [
    {
      nom: "ghulam",
      lat: 48.8822,
      lon: 2.7042,
      name: "Lagny-Thorigny RER A",
    },
    {
      nom: "nathan",
      lat: 48.835,
      lon: 2.327,
      name: "Jean Moulin T3a",
    },
    {
      nom: "michael",
      lat: 48.9037,
      lon: 2.197,
      name: "Nanterre-Préfecture RER A",
    },
    {
      nom: "jason",
      lat: 49.4203,
      lon: 2.8218,
      name: "Compiègne SNCF",
    },
    {
      nom: "cedric",
      lat: 48.9636,
      lon: 2.3719,
      name: "Pierrefitte-Stains RER D",
    },
    {
      nom: "liazide",
      lat: 49.0194,
      lon: 2.1537,
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

  try {
    for (const trajet of trajets) {
      try {
        // Format Navitia : longitude;latitude
        const from = `${start.lon};${start.lat}`;
        const to = `${trajet.lon};${trajet.lat}`;

        const params = new URLSearchParams({
          from,
          to,
          count: "10",
        });

        const url =
          "https://prim.iledefrance-mobilites.fr/" +
          `marketplace/v2/navitia/journeys?${params.toString()}`;

        console.log(`Appel PRIM pour ${trajet.nom} vers ${trajet.name}`);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",

            // Authentification officielle PRIM
            apikey: IDFM_API_KEY,
          },
        });

        console.log(
          `Réponse PRIM pour ${trajet.nom} : HTTP ${response.status}`
        );

        if (!response.ok) {
          const errorBody = await response.text();

          console.error(
            `Erreur PRIM ${trajet.nom} :`,
            response.status,
            errorBody.slice(0, 500)
          );

          times[trajet.nom] = null;
          errors[trajet.nom] = `HTTP ${response.status}`;

          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }

        const data = await response.json();

        const journeys = Array.isArray(data.journeys)
          ? data.journeys
          : [];

        // On sélectionne uniquement un trajet contenant
        // réellement des transports en commun.
        const publicTransportJourney = journeys.find((journey) =>
          journey.sections?.some(
            (section) => section.type === "public_transport"
          )
        );

        if (!publicTransportJourney) {
          console.warn(
            `Aucun trajet en transport en commun pour ${trajet.nom}`
          );

          times[trajet.nom] = null;
          errors[trajet.nom] = "Aucun trajet en transport en commun";
        } else {
          const durationSeconds = publicTransportJourney.duration;
          const durationMinutes = Math.round(durationSeconds / 60);

          times[trajet.nom] = durationMinutes;

          console.log(
            `${trajet.nom} (${trajet.name}) : ${durationMinutes} min`
          );
        }
      } catch (error) {
        console.error(
          `Erreur pendant le calcul de ${trajet.nom} :`,
          error
        );

        times[trajet.nom] = null;
        errors[trajet.nom] = error.message;
      }

      // Quatre requêtes par seconde maximum environ
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Évite qu'une ancienne réponse soit conservée trop longtemps
    res.setHeader(
      "Cache-Control",
      "s-maxage=240, stale-while-revalidate=60"
    );

    return res.status(200).json({
      times,
      errors,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erreur générale trajets :", error);

    return res.status(500).json({
      error: "Erreur lors du calcul des trajets",
      details: error.message,
    });
  }
}
