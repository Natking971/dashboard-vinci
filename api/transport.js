// api/transport.js — Proxy Vercel pour l'API IDF Mobilités

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const apiKey = process.env.IDFM_API_KEY;
  if (!apiKey) return res.status(200).json({ lines: [], error: "IDFM_API_KEY non configuree" });

  const CODES_METRO      = ["1","2","3","3B","4","5","6","7","7B","8","9","10","11","12","13","14"];
  const CODES_RER        = ["A","B","C","D","E"];
  const CODES_TRANSILIEN = ["H","J","K","L","N","P","R","U","V"];
  const ALL_CODES        = [...CODES_METRO, ...CODES_RER, ...CODES_TRANSILIEN];

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
    "line h":"H","line j":"J","line k":"K","line l":"L","line n":"N",
    "line p":"P","line r":"R","line u":"U","line v":"V",
  };

  const CAUSE_FR = {
    "TRAVAUX":"Travaux","PERTURBATION":"Perturbation","INCIDENT":"Incident",
    "INFORMATION":"Information","PERTURBEE":"Perturbé","BLOQUEE":"Bloqué",
    "REDUITE":"Trafic réduit","GREVE":"Grève","ACCIDENT":"Accident",
    "PANNE":"Panne","NORMAL":"Normal","TRAVAUX_PLANIFIES":"Travaux planifiés",
    "MAJEURE":"Perturbation majeure",
  };

  function nettoyer(texte = "") {
    return texte
      .replace(/<[^>]*>/g, " ")          // balises HTML
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
      .replace(/&#[0-9]+;/g, " ")
      // Supprimer les emoji (plages Unicode emoji)
      .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}]/gu, "")
      .replace(/[\u{1F000}-\u{1F9FF}]/gu, "")
      .replace(/⚠|🚇|🚆|🚊|🚋|🚌|🚍|🚎|🚏|🚐|🚑|🚒|🚓|🚔|🚕|🚖|🚗|🚘|🚙|⛽|🛣|🛤/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function traduire(texte = "") {
    let t = nettoyer(texte);
    const remplacements = [
      [/traffic is interrupted between (.+?) and (.+?)(\.|$)/gi, "Trafic interrompu entre $1 et $2"],
      [/traffic is interrupted on (.+?)(\.|$)/gi, "Trafic interrompu sur $1"],
      [/traffic disrupted/gi, "Trafic perturbé"],
      [/traffic interrupted/gi, "Trafic interrompu"],
      [/traffic is disrupted/gi, "Trafic perturbé"],
      [/train parked/gi, "Train en stationnement"],
      [/train stalled/gi, "Train en panne"],
      [/stop[s]? not served[:\s]*(.*?)(\.|$)/gi, "Arrêt(s) non desservi(s) : $1"],
      [/stop[s]? not served/gi, "Arrêt(s) non desservi(s)"],
      [/a replacement bus service is provided/gi, "Bus de remplacement mis en place"],
      [/bus de remplacement/gi, "Bus de remplacement"],
      [/due to construction/gi, "En raison de travaux"],
      [/due to works?/gi, "En raison de travaux"],
      [/due to engineering works?/gi, "En raison de travaux techniques"],
      [/due to a breakdown/gi, "En raison d'une panne"],
      [/due to an incident/gi, "En raison d'un incident"],
      [/due to a strike/gi, "En raison d'une grève"],
      [/will not be served/gi, "ne sera pas desservi"],
      [/will be served/gi, "sera desservi"],
      [/will be moved to/gi, "sera déplacé vers"],
      [/in both directions/gi, "dans les deux sens"],
      [/last departure from/gi, "Dernier départ depuis"],
      [/last departure at/gi, "Dernier départ à"],
      [/period[:\s]*evenings?/gi, "Période : soirées"],
      [/thanks for your understanding/gi, "Merci de votre compréhension"],
      [/engineering works? on the rail network/gi, "travaux sur le réseau ferroviaire"],
      [/between (.+?) and (.+?)(\.|,|$)/gi, "entre $1 et $2"],
      [/inclusive/gi, "inclus"],
      [/#infotrafic/gi, "Info Trafic"],
      [/line ([0-9]{1,2}[ab]?)/gi, "Ligne $1"],
      [/line ([a-e])\b/gi, "Ligne $1"],
      [/\bdetails? of\b/gi, "Détails"],
      [/\bdetails?\b/gi, "Détails"],
    ];
    for (const [pattern, remplacement] of remplacements) {
      t = t.replace(pattern, remplacement);
    }
    return t.substring(0, 150);
  }

  function findCode(name = "") {
    const n = name.toLowerCase().trim();
    if (IDFM_NAME_TO_CODE[n]) return IDFM_NAME_TO_CODE[n];
    for (const code of ALL_CODES) {
      if (n === code.toLowerCase()) return code;
      if (n === "rer " + code.toLowerCase()) return code;
    }
    const rerMatch = n.match(/\brer\s+([a-e])\b/i);
    if (rerMatch) return rerMatch[1].toUpperCase();
    const metroMatch = n.match(/\bm[eé]tro\s+(\d{1,2}[ab]?)\b/i);
    if (metroMatch) {
      const num = metroMatch[1].replace(/b$/i, "B");
      if (ALL_CODES.includes(num)) return num;
    }
    const lineMatch = n.match(/\bline\s+([a-e]|\d{1,2}[ab]?)\b/i);
    if (lineMatch) {
      const code = lineMatch[1].toUpperCase().replace(/B$/i, "B");
      if (ALL_CODES.includes(code)) return code;
    }
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
      const sample = (data.disruptions || data || []).slice(0, 2);
      return res.status(200).json({ sample, keys: Object.keys(data) });
    }

    const lineMap = {};
    const disruptions = data.disruptions || (Array.isArray(data) ? data : []);

    disruptions.forEach(d => {
      const severity = d.severity || "";
      if (severity === "NORMAL" || severity === "INFORMATION") return;

      const causeFR  = CAUSE_FR[d.cause] || CAUSE_FR[severity] || "Perturbation";
      const rawMsg   = d.shortMessage || d.message || d.title || "";
      const message  = traduire(rawMsg) || causeFR;
      const affectedLines = d.lines || [];

      const addToLine = (code) => {
        if (!code || !ALL_CODES.includes(code)) return;
        if (!lineMap[code]) lineMap[code] = [];
        const exists = lineMap[code].some(x => x.message === message);
        if (!exists) lineMap[code].push({ severity: causeFR, message });
      };

      if (affectedLines.length > 0) {
        affectedLines.forEach(l => addToLine(findCode(l.name || l.shortName || "")));
      } else {
        addToLine(findCode(d.title || ""));
      }
    });

    const lines = ALL_CODES.map(code => ({ code, disruptions: lineMap[code] || [] }));
    res.status(200).json({ lines, updatedAt: new Date().toISOString(), total_disruptions: disruptions.length });

  } catch (e) {
    res.status(200).json({ lines: [], error: e.message });
  }
}
