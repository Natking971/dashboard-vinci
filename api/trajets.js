// /api/trajets.js - Route Vercel pour calculer les trajets avec TomTom
// Place ce fichier dans ton repo dans le dossier /api

export default async function handler(req, res) {
  const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;

  if (!TOMTOM_API_KEY) {
    return res.status(500).json({ error: "TOMTOM_API_KEY non configurée" });
  }

  // Point de départ : Châtelet
  const start = { lat: 48.8626, lon: 2.3469 };

  // Destinations (lat, lon) - Coordonnées GPS exactes des gares
  const trajets = [
    { nom: "ghulam", lat: 48.8822, lon: 2.7042 },      // Lagny-Thorigny
    { nom: "nathan", lat: 48.8185, lon: 2.3944 },      // Jean Moulin
    { nom: "michael", lat: 48.9037, lon: 2.1970 },     // Nanterre-Préfecture
    { nom: "jason", lat: 49.4203, lon: 2.8218 },       // Compiègne
    { nom: "cedric", lat: 48.9636, lon: 2.3719 },      // Pierrefitte-Stains
    { nom: "liazide", lat: 49.0194, lon: 2.1537 },     // Pierrelaye
    { nom: "rachid", lat: 48.933, lon: 2.040 },        // Poissy
    { nom: "toufik", lat: 48.933, lon: 2.040 }         // Poissy
  ];

  const times = {};

  try {
    // Requêtes séquentielles avec délai (au lieu de parallèles) pour éviter les limites TomTom
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
      
      // Délai de 200ms entre les requêtes pour respecter les limites TomTom
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.status(200).json({ times });
  } catch (error) {
    console.error("❌ Erreur calcul trajets:", error);
    res.status(500).json({ error: "Erreur lors du calcul des trajets" });
  }
}
