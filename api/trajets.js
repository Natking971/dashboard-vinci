// /api/trajets.js - Route Vercel pour calculer les trajets avec Navitia/PRIM
// API officielle d'Île-de-France Mobilités

export default async function handler(req, res) {
  const IDFM_API_KEY = process.env.IDFM_API_KEY;

  if (!IDFM_API_KEY) {
    console.error("❌ IDFM_API_KEY non configurée");
    return res.status(500).json({ error: "IDFM_API_KEY non configurée" });
  }

  // Point de départ : Châtelet-Les Halles (Navitia format: lon,lat)
  const start = { lat: 48.8626, lon: 2.3469 };

  // Destinations (coordonnées GPS des gares/arrêts)
  const trajets = [
    { nom: "ghulam", lat: 48.8822, lon: 2.7042, name: "Lagny-Thorigny RER A" },
    { nom: "nathan", lat: 48.8350, lon: 2.3270, name: "Jean Moulin T3a" },
    { nom: "michael", lat: 48.9037, lon: 2.1970, name: "Nanterre-Préfecture RER A" },
    { nom: "jason", lat: 49.4203, lon: 2.8218, name: "Compiègne SNCF" },
    { nom: "cedric", lat: 48.9636, lon: 2.3719, name: "Pierrefitte-Stains RER D" },
    { nom: "liazide", lat: 49.0194, lon: 2.1537, name: "Pierrelaye RER C" },
    { nom: "rachid", lat: 48.933, lon: 2.040, name: "Poissy RER A" },
    { nom: "toufik", lat: 48.933, lon: 2.040, name: "Poissy RER A" }
  ];

  const times = {};

  try {
    // Requêtes séquentielles avec délai pour respecter les limites Navitia
    for (const trajet of trajets) {
      try {
        // Format Navitia: lon;lat
        const from = `${start.lon};${start.lat}`;
        const to = `${trajet.lon};${trajet.lat}`;

        // Requête Navitia avec paramètres pour transports en commun
        const url = 
          `https://api.navitia.io/v1/journeys?` +
          `from=${from}&` +
          `to=${to}&` +
          `datetime=${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}&` +
          `max_nb_transfers=4&` +
          `min_nb_journeys=1`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${IDFM_API_KEY}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Extraire le temps du premier itinéraire
        if (data.journeys && data.journeys.length > 0) {
          const journey = data.journeys[0];
          const durationSeconds = journey.duration;
          const durationMinutes = Math.round(durationSeconds / 60);

          times[trajet.nom] = durationMinutes;
          console.log(`✅ ${trajet.nom} (${trajet.name}): ${durationMinutes}min`);
        } else {
          console.warn(`⚠️ ${trajet.nom} (${trajet.name}): Pas d'itinéraire trouvé`);
          times[trajet.nom] = null;
        }
      } catch (error) {
        console.error(`❌ Erreur Navitia ${trajet.nom}:`, error.message);
        times[trajet.nom] = null;
      }

      // Délai de 200ms entre les requêtes pour respecter les limites
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.status(200).json({ times });
  } catch (error) {
    console.error("❌ Erreur calcul trajets:", error);
    res.status(500).json({ error: "Erreur lors du calcul des trajets" });
  }
}
