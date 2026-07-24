// /api/trajets.js - Route Vercel pour calculer les trajets avec TomTom
export default async function handler(req, res) {
  const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;

  if (!TOMTOM_API_KEY) {
    return res.status(500).json({ error: "TOMTOM_API_KEY non configurée" });
  }

  const start = { lat: 48.8626, lon: 2.3469 };

  const trajets = [
    { nom: "ghulam", lat: 48.8728, lon: 2.7169 },
    { nom: "nathan", lat: 48.8185, lon: 2.3944 },
    { nom: "michael", lat: 48.9003, lon: 2.1969 },
    { nom: "jason", lat: 49.4194, lon: 2.8169 },
    { nom: "cedric", lat: 48.9731, lon: 2.4089 },
    { nom: "liazide", lat: 48.9797, lon: 2.1686 },
    { nom: "rachid", lat: 48.8203, lon: 2.0275 },
    { nom: "toufik", lat: 48.8203, lon: 2.0275 }
  ];

  const times = {};

  try {
    // Requêtes séquentielles (une à la fois) avec délai pour éviter les limites TomTom
    for (const trajet of trajets) {
      try {
        const url =
          `https://api.tomtom.com/routing/1/calculateRoute/` +
          `${start.lat},${start.lon}:${trajet.lat},${trajet.lon}/json` +
          `?traffic=true` +
          `&departAt=now` +
          `&routeType=fastest` +
          `&travelMode=car` +
          `&key=${TOMTOM_API_KEY}`;

        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();

        if (data.routes && data.routes[0] && data.routes[0].summary) {
          const summary = data.routes[0].summary;
          const durationMinutes = Math.round(summary.travelTimeInSeconds / 60);
          const trafficDelayMinutes = summary.trafficDelayInSeconds
            ? Math.round(summary.trafficDelayInSeconds / 60)
            : 0;

          times[trajet.nom] = durationMinutes;
          console.log(`✅ ${trajet.nom}: ${durationMinutes}min (trafic: +${trafficDelayMinutes}min)`);
        } else {
          times[trajet.nom] = null;
          console.error(`⚠️ Pas de route trouvée pour ${trajet.nom}`);
        }
      } catch (error) {
        console.error(`❌ Erreur TomTom ${trajet.nom}:`, error.message);
        times[trajet.nom] = null;
      }
      
      // Délai de 200ms entre les requêtes
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.status(200).json({ times });
  } catch (error) {
    console.error("Erreur calcul trajets:", error);
    res.status(500).json({ error: "Erreur lors du calcul des trajets" });
  }
}
