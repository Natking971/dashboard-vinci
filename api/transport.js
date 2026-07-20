// api/transport.js — Proxy Vercel pour l'API IDF Mobilités
// Format réel : { disruptions: [{ id, cause, severity, title, message, lines: [{id, name}] }] }

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

  // Map IDs IDFM connus → code ligne
  // Format : "line:IDFM:CXXXXX" — on extrait le nom depuis le champ "name" ou "lines[].name"
  const IDFM_NAME_TO_CODE = {
    "metro 1":"1","metro 2":"2","metro 3":"3","metro 3b":"3B","metro 3bis":"3B",
    "metro 4":"4","metro 5":"5","metro 6":"6","metro 7":"7","metro 7b":"7B","metro 7bis":"7B",
    "metro 8":"8","metro 9":"9","metro 10":"10","metro 11":"11","metro 12":"12",
    "metro 13":"13","metro 14":"14",
    "rer a":"A","rer b":"B","rer c":"C","rer d":"D","rer e":"E",
    "transilien h":"H","transilien j":"J","transilien k":"K","transilien l":"L",
    "transilien n":"N","transilien p":"P","transilien r":"R","transilien u":"U","transilien v":"V",
    "ligne h":"H","ligne j":"J","ligne k":"K","ligne l":"L","ligne n":"N",
    "ligne p":"P","ligne r":"R","ligne u":"U","ligne v":"V",
  };

  function findCode(name = "", lineId = "") {
    const n = name.toLowerCase().trim();
    // Cherche direct dans la map
    if (IDFM_NAME_TO_CODE[n]) return IDFM_NAME_TO_CODE[n];
    // Cherche par code simple (ex: "4", "A", "RER C between...")
    for (const code of ALL_CODES) {
      if (n === code.toLowerCase()) return code;
      if (n.startsWith("rer " + code.toLowerCase())) return code;
      if (n.startsWith("metro " + code.toLowerCase() + " ") || n === "metro " + code.toLowerCase()) return code;
      if (n.includes(" line " + code.toLowerCase() + " ") || n.includes(" ligne " + code.toLowerCase() + " ")) return code;
    }
    // Cherche dans le titre (ex: "RER C : between Dourdan...")
    const rerMatch = n.match(/\brer\s+([a-e])\b/i);
    if (rerMatch) return rerMatch[1].toUpperCase();
    const metroMatch = n.match(/\bm[eé]tro\s+(\d{1,2}[ab]?)\b/i);
    if (metroMatch) {
      const num = metroMatch[1].replace(/b$/i, "B");
      if (ALL_CODES.includes(num)) return num;
    }
    // Cherche via lineId IDFM (ex: "line:IDFM:C01727")
    // On ne peut pas faire la correspondance sans la table complète mais on essaie le nom
    return null;
  }

  try {
    const response = await fetch(
      "https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2",
      { headers: { "apikey": apiKey, "Accept": "application/json" } }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (req.query.debug === "1") {
      const sample = (data.disruptions || data || []).slice(0, 3);
      return res.status(200).json({ sample, keys: Object.keys(data) });
    }

    const lineMap = {};

    const disruptions = data.disruptions || (Array.isArray(data) ? data : []);

    disruptions.forEach(d => {
      const title   = d.title || "";
      const message = d.shortMessage || d.message || d.title || "";
      const cause   = d.cause || d.severity || "Perturbation";
      const severity = d.severity || "PERTURBEE";

      // Ignorer si pas vraiment perturbé
      if (severity === "NORMAL" || severity === "INFORMATION") return;

      // Les lignes affectées peuvent être dans d.lines ou extraites du titre
      const affectedLines = d.lines || [];

      const addToLine = (code) => {
        if (!code || !ALL_CODES.includes(code)) return;
        if (!lineMap[code]) lineMap[code] = [];
        // Éviter les doublons
        const exists = lineMap[code].some(x => x.message === String(message).substring(0, 150));
        if (!exists) {
          lineMap[code].push({
            severity: cause,
            message: String(message).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 150),
          });
        }
      };

      if (affectedLines.length > 0) {
        affectedLines.forEach(l => {
          const code = findCode(l.name || l.shortName || "", l.id || l.lineId || "");
          if (code) addToLine(code);
        });
      } else {
        // Essayer d'extraire depuis le titre
        const code = findCode(title);
        if (code) addToLine(code);
      }
    });

    const lines = ALL_CODES.map(code => ({
      code,
      disruptions: lineMap[code] || [],
    }));

    res.status(200).json({
      lines,
      updatedAt: new Date().toISOString(),
      total_disruptions: disruptions.length,
      affected_lines: Object.keys(lineMap).length,
    });

  } catch (e) {
    res.status(200).json({ lines: [], error: e.message });
  }
}
