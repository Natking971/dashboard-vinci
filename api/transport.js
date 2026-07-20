// api/transport.js — Proxy Vercel pour l'API IDF Mobilités
// Endpoint : disruptions_bulk/disruptions/v2
// Ajouter IDFM_API_KEY dans Vercel > Settings > Environment Variables

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

    const lineMap = {};

    const disruptions = data.disruptions || data || [];
    (Array.isArray(disruptions) ? disruptions : []).forEach(d => {
      const affectedLines = d.impacted_objects || d.lines || d.affected_lines || [];
      const message = d.messages?.[0]?.text
        || d.message?.text
        || d.message
        || d.title
        || "";
      const severity = d.severity?.name || d.severity || "UNKNOWN";

      affectedLines.forEach(obj => {
        const line = obj.line || obj.pt_object?.line || obj;
        const code = line.code || line.shortName || line.name || "";
        const normalised = ALL_CODES.find(c => c.toLowerCase() === code.toLowerCase());
        if (!normalised) return;

        if (!lineMap[normalised]) lineMap[normalised] = [];
        lineMap[normalised].push({
          severity,
          message: String(message).substring(0, 150),
        });
      });
    });

    const lines = ALL_CODES.map(code => ({
      code,
      disruptions: lineMap[code] || [],
    }));

    res.status(200).json({ lines, updatedAt: new Date().toISOString() });

  } catch (e) {
    res.status(200).json({ lines: [], error: e.message });
  }
}
