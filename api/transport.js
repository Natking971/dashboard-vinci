// api/transport.js — Proxy Vercel pour l'API IDF Mobilités

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const apiKey = process.env.IDFM_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ lines: [], error: "IDFM_API_KEY non configuree" });
  }

  const CODES_METRO      = ["1","2","3","3B","4","5","6","7","7B","8","9","10","11","12","13","14"];
  const CODES_RER        = ["A","B","C","D","E"];
  const CODES_TRANSILIEN = ["H","J","K","L","N","P","R","U","V"];
  const ALL_CODES        = [...CODES_METRO, ...CODES_RER, ...CODES_TRANSILIEN];

  try {
    const response = await fetch(
      "https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2",
      { headers: { "apikey": apiKey, "Accept": "application/json" } }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Si mode debug : retourner les données brutes pour voir le format
    if (req.query.debug === "1") {
      const sample = Array.isArray(data) ? data.slice(0, 2) : 
                     data.disruptions ? data.disruptions.slice(0, 2) : data;
      return res.status(200).json({ raw_sample: sample, keys: Object.keys(data) });
    }

    const lineMap = {};

    // Essayer tous les formats possibles
    const disruptions = Array.isArray(data) ? data :
                        data.disruptions || data.Disruptions || 
                        data.data?.disruptions || [];

    disruptions.forEach(d => {
      // Format 1 : impacted_objects avec pt_object.line
      const sources = [
        ...(d.impacted_objects || []),
        ...(d.impacted_lines || []),
        ...(d.lines || []),
        ...(d.affected_lines || []),
      ];

      const msg = d.messages?.[0]?.text || d.messages?.[0]?.value ||
                  d.message?.text || d.message || d.title || d.cause || "";
      const sev = d.severity?.effect || d.severity?.name || d.severity || "PERTURBATION";

      sources.forEach(obj => {
        // Chercher le code dans toutes les structures possibles
        const candidates = [
          obj?.line?.code, obj?.line?.shortName,
          obj?.pt_object?.line?.code, obj?.pt_object?.id,
          obj?.code, obj?.shortName, obj?.id,
        ].filter(Boolean);

        candidates.forEach(raw => {
          // Nettoyer l'id type "line:IDFM:C01742" → extraire la lettre/chiffre
          const cleaned = raw.replace(/^.*[:_]/, "").replace(/^0+/, "");
          const matched = ALL_CODES.find(c => 
            c.toLowerCase() === cleaned.toLowerCase() ||
            c.toLowerCase() === raw.toLowerCase()
          );
          if (!matched) return;
          if (!lineMap[matched]) lineMap[matched] = [];
          lineMap[matched].push({ severity: sev, message: String(msg).substring(0, 150) });
        });
      });
    });

    const lines = ALL_CODES.map(code => ({
      code,
      disruptions: lineMap[code] || [],
    }));

    res.status(200).json({ lines, updatedAt: new Date().toISOString(), total_disruptions: disruptions.length });

  } catch (e) {
    res.status(200).json({ lines: [], error: e.message });
  }
}
