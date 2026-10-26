
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const apiKey = process.env.IDFM_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      lines: [],
      error: "IDFM_API_KEY non configuree",
    });
  }

  const CODES_METRO = [
    "1", "2", "3", "3B", "4", "5", "6", "7", "7B",
    "8", "9", "10", "11", "12", "13", "14",
  ];

  const CODES_RER = ["A", "B", "C", "D", "E"];

  const CODES_TRANSILIEN = [
    "H", "J", "K", "L", "N", "P", "R", "U", "V",
  ];

  const ALL_CODES = [
    ...CODES_METRO,
    ...CODES_RER,
    ...CODES_TRANSILIEN,
  ];

  const CAUSE_FR = {
    TRAVAUX: "Travaux",
    PERTURBATION: "Perturbation",
    INCIDENT: "Incident",
    INFORMATION: "Information",
    PERTURBEE: "Perturbation",
    BLOQUANTE: "Perturbation",
    BLOQUEE: "Bloqué",
    REDUITE: "Trafic réduit",
    GREVE: "Grève",
    ACCIDENT: "Accident",
    PANNE: "Panne",
    NORMAL: "Normal",
    TRAVAUX_PLANIFIES: "Travaux planifiés",
    MAJEURE: "Perturbation majeure",
  };

  function text(value) {
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }

    if (value && typeof value === "object") {
      return String(
        value.name ||
        value.label ||
        value.value ||
        value.shortName ||
        value.code ||
        ""
      );
    }

    return "";
  }

  function array(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  function clean(value = "") {
    return String(value)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&#[0-9]+;/g, " ")
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalize(value = "") {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findCode(value = "") {
    const n = normalize(value);

    if (!n) return null;

    // Correspondance directe avec les codes connus.
    if (ALL_CODES.includes(n.toUpperCase())) {
      return n.toUpperCase();
    }

    // RER A à E.
    const rer = n.match(/\brer\s*[-:]?\s*([a-e])\b/i);

    if (rer) {
      return rer[1].toUpperCase();
    }

    // Transilien H, J, K, L, N, P, R, U ou V.
    const transilien = n.match(
      /\btransilien\s*(?:ligne\s*)?([hj klnpruv])\b/i
    );

    if (transilien) {
      const code = transilien[1].replace(/\s/g, "").toUpperCase();
      if (ALL_CODES.includes(code)) return code;
    }

    // Ligne J, Line J, Train J, Ligne 13, Line 3B, etc.
    const line = n.match(
      /\b(?:ligne|line|train)\s*[-:]?\s*([a-e]|\d{1,2}(?:bis|b)?)\b/i
    );

    if (line) {
      let code = line[1]
        .replace(/\s+/g, "")
        .replace(/bis$/i, "B")
        .toUpperCase();

      if (ALL_CODES.includes(code)) return code;
    }

    // Métro 3, Métro 3bis, Métro 7bis.
    const metro = n.match(
      /\bmetro\s*(\d{1,2}(?:bis|b)?)\b/i
    );

    if (metro) {
      const code = metro[1]
        .replace(/bis$/i, "B")
        .toUpperCase();

      if (ALL_CODES.includes(code)) return code;
    }

    // Certaines réponses fournissent simplement « Transilien J ».
    const aliases = {
      "transilien h": "H",
      "transilien j": "J",
      "transilien k": "K",
      "transilien l": "L",
      "transilien n": "N",
      "transilien p": "P",
      "transilien r": "R",
      "transilien u": "U",
      "transilien v": "V",
      "ligne h": "H",
      "ligne j": "J",
      "ligne k": "K",
      "ligne l": "L",
      "ligne n": "N",
      "ligne p": "P",
      "ligne r": "R",
      "ligne u": "U",
      "ligne v": "V",
      "line h": "H",
      "line j": "J",
      "line k": "K",
      "line l": "L",
      "line n": "N",
      "line p": "P",
      "line r": "R",
      "line u": "U",
      "line v": "V",
    };

    return aliases[n] || null;
  }

  function codeFromObject(obj) {
    if (typeof obj === "string") {
      return findCode(obj);
    }

    if (!obj || typeof obj !== "object") {
      return null;
    }

    const candidates = [
      obj.shortName,
      obj.short_name,
      obj.code,
      obj.name,
      obj.label,
      obj.line,
    ];

    for (const candidate of candidates) {
      const code = findCode(text(candidate));
      if (code) return code;
    }

    return null;
  }

  function translate(value = "") {
    let t = clean(value);

    const replacements = [
      [/traffic is interrupted between (.+?) and (.+?)(?:\.|,|$)/gi,
        "Trafic interrompu entre $1 et $2"],
      [/traffic is interrupted on (.+?)(?:\.|$)/gi,
        "Trafic interrompu sur $1"],
      [/traffic is interrupted/gi, "Trafic interrompu"],
      [/traffic interrupted/gi, "Trafic interrompu"],
      [/traffic disrupted/gi, "Trafic perturbé"],
      [/traffic is disrupted/gi, "Trafic perturbé"],
      [/traffic is running normally/gi, "Trafic normal"],
      [/train parked/gi, "Train en stationnement"],
      [/train stalled/gi, "Train en panne"],
      [/stop[s]? not served/gi, "Arrêt(s) non desservi(s)"],
      [/station[s]? not served/gi, "Station(s) non desservie(s)"],
      [/will not be served/gi, "ne sera pas desservi"],
      [/will be served/gi, "sera desservi"],
      [/departures? (?:are )?cancelled/gi, "Départs supprimés"],
      [/the following departures are cancelled[:\s]*/gi,
        "Départs supprimés : "],
      [/cancelled/gi, "supprimé(s)"],
      [/cancellation/gi, "suppression"],
      [/replacement bus service is provided/gi,
        "Bus de remplacement mis en place"],
      [/replacement bus/gi, "bus de remplacement"],
      [/due to construction/gi, "en raison de travaux"],
      [/due to engineering works?/gi, "en raison de travaux techniques"],
      [/due to works?/gi, "en raison de travaux"],
      [/due to a breakdown/gi, "en raison d'une panne"],
      [/due to an incident/gi, "en raison d'un incident"],
      [/due to a strike/gi, "en raison d'une grève"],
      [/engineering works?/gi, "travaux techniques"],
      [/until further notice/gi, "jusqu'à nouvel ordre"],
      [/in both directions?/gi, "dans les deux sens"],
      [/last departure from/gi, "dernier départ depuis"],
      [/last departure at/gi, "dernier départ à"],
      [/a detour has been set up/gi,
        "Un itinéraire de substitution est mis en place"],
      [/the line will be diverted/gi, "La ligne sera déviée"],
      [/will be diverted/gi, "sera déviée"],
      [/diverted/gi, "déviée"],
      [/platform/gi, "quai"],
      [/monday/gi, "lundi"],
      [/tuesday/gi, "mardi"],
      [/wednesday/gi, "mercredi"],
      [/thursday/gi, "jeudi"],
      [/friday/gi, "vendredi"],
      [/saturday/gi, "samedi"],
      [/sunday/gi, "dimanche"],
      [/january/gi, "janvier"],
      [/february/gi, "février"],
      [/march/gi, "mars"],
      [/april/gi, "avril"],
      [/may/gi, "mai"],
      [/june/gi, "juin"],
      [/july/gi, "juillet"],
      [/august/gi, "août"],
      [/september/gi, "septembre"],
      [/october/gi, "octobre"],
      [/november/gi, "novembre"],
      [/december/gi, "décembre"],
      [/thanks for your understanding\.?/gi,
        "Merci de votre compréhension."],
    ];

    for (const [pattern, replacement] of replacements) {
      t = t.replace(pattern, replacement);
    }

    t = t.replace(/\s+/g, " ").trim();

    if (t) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }

    return t.substring(0, 150);
  }

  function getLineIds(line) {
    return [
      line?.id,
      line?.lineId,
      line?.line_id,
    ]
      .filter(Boolean)
      .map(String);
  }

  function extractImpactedObjects(disruption) {
    return [
      ...array(disruption?.impactedObjects),
      ...array(disruption?.impacted_objects),
      ...array(disruption?.ptObjects),
      ...array(disruption?.pt_objects),
    ];
  }

  function explicitCodesFromText(value = "") {
    const n = normalize(value);
    const codes = new Set();

    // Recherche uniquement les formulations explicites de ligne.
    const patterns = [
      /\btransilien\s*(?:ligne\s*)?([hj klnpruv])\b/gi,
      /\b(?:ligne|line|train)\s*[-:]?\s*([hj klnpruv])\b/gi,
      /\brer\s*[-:]?\s*([a-e])\b/gi,
      /\bmetro\s*(\d{1,2}(?:bis|b)?)\b/gi,
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(n)) !== null) {
        let code = match[1].replace(/\s/g, "").toUpperCase();
        code = code.replace(/BIS$/i, "B");

        if (ALL_CODES.includes(code)) {
          codes.add(code);
        }
      }
    }

    return [...codes];
  }

  try {
    const response = await fetch(
      "https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2",
      {
        headers: {
          apikey: apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const disruptions = Array.isArray(data)
      ? data
      : Array.isArray(data.disruptions)
        ? data.disruptions
        : [];

    const sourceLines = Array.isArray(data.lines)
      ? data.lines
      : [];

    // Associe l'identifiant technique IDFM au code affiché
    // dans le dashboard, par exemple line:IDFM:... -> J.
    const lineCodeById = new Map();

    for (const line of sourceLines) {
      const code = codeFromObject(line);

      if (!code) continue;

      for (const id of getLineIds(line)) {
        lineCodeById.set(id, code);
      }
    }

    function codesForDisruption(disruption) {
      const codes = new Set();

      const disruptionId = text(disruption?.id);

      // 1. Lignes directement présentes dans le message.
      for (const line of array(disruption?.lines)) {
        const code = codeFromObject(line);
        if (code) codes.add(code);
      }

      // 2. Objets impactés liés au message.
      const impacted = extractImpactedObjects(disruption);

      for (const obj of impacted) {
        if (!obj || typeof obj !== "object") {
          const code = findCode(text(obj));
          if (code) codes.add(code);
          continue;
        }

        const type = normalize(
          text(obj.type || obj.embedded_type || obj.embeddedType)
        );

        const id = text(obj.id);

        // On privilégie les objets de type ligne.
        const isLine =
          type === "line" ||
          type.includes("line") ||
          /^line:/i.test(id);

        if (type && !isLine) continue;

        let code = codeFromObject(obj);

        if (!code && id) {
          code = lineCodeById.get(id) || null;
        }

        if (code) {
          codes.add(code);
        }

        // Certaines réponses portent le lien dans disruptionIds.
        const linkedIds = array(
          obj.disruptionIds || obj.disruption_ids
        ).map(text);

        if (
          disruptionId &&
          linkedIds.includes(disruptionId) &&
          !code
        ) {
          const idCode = lineCodeById.get(id);
          if (idCode) codes.add(idCode);
        }
      }

      // 3. Certains flux rattachent les identifiants de messages
      // directement aux objets lignes de la réponse globale.
      for (const line of sourceLines) {
        const linkedIds = array(
          line.disruptionIds ||
          line.disruption_ids ||
          line.disruptions
        ).map((item) => {
          if (item && typeof item === "object") {
            return text(item.id);
          }

          return text(item);
        });

        if (
          disruptionId &&
          linkedIds.includes(disruptionId)
        ) {
          const code = codeFromObject(line);
          if (code) codes.add(code);
        }
      }

      // 4. Dernier recours : ligne explicitement nommée dans le titre
      // ou le message. On n'infère pas une ligne à partir d'un arrêt.
      if (codes.size === 0) {
        const fullText = [
          text(disruption?.title),
          text(disruption?.shortMessage),
          text(disruption?.message),
        ].join(" ");

        for (const code of explicitCodesFromText(fullText)) {
          codes.add(code);
        }
      }

      return [...codes];
    }

    // Diagnostic accessible avec /api/transport?debug=1
    if (req.query?.debug === "1") {
      const rootLineJ = sourceLines
        .filter((line) => codeFromObject(line) === "J")
        .map((line) => ({
          id: line.id,
          name: line.name,
          shortName: line.shortName,
          mode: line.mode,
          disruptionIds: line.disruptionIds,
        }));

      const lineJCandidates = disruptions
        .filter((disruption) =>
          codesForDisruption(disruption).includes("J")
        )
        .slice(0, 30)
        .map((disruption) => ({
          id: disruption.id,
          title: disruption.title,
          shortMessage: disruption.shortMessage,
          message: translate(
            disruption.shortMessage ||
            disruption.message ||
            disruption.title ||
            ""
          ),
          cause: disruption.cause,
          severity: disruption.severity,
          impactedObjects: extractImpactedObjects(disruption),
        }));

      return res.status(200).json({
        debug: true,
        total_disruptions: disruptions.length,
        total_lines: sourceLines.length,
        rootLineJ,
        lineJCandidates,
      });
    }

    const lineMap = {};

    for (const disruption of disruptions) {
      const cause = text(disruption?.cause).toUpperCase();
      const severity = text(disruption?.severity).toUpperCase();

      if (
        cause === "INFORMATION" ||
        cause === "NORMAL" ||
        severity === "INFORMATION" ||
        severity === "NORMAL"
      ) {
        continue;
      }

      const causeFR =
        CAUSE_FR[cause] ||
        CAUSE_FR[severity] ||
        "Perturbation";

      const rawMessage =
        text(disruption?.shortMessage) ||
        text(disruption?.message) ||
        text(disruption?.title) ||
        "";

      const message = translate(rawMessage) || causeFR;

      const codes = codesForDisruption(disruption);

      for (const code of codes) {
        if (!ALL_CODES.includes(code)) continue;

        if (!lineMap[code]) {
          lineMap[code] = [];
        }

        const alreadyExists = lineMap[code].some(
          (item) =>
            item.message === message &&
            item.severity === causeFR
        );

        if (!alreadyExists) {
          lineMap[code].push({
            severity: causeFR,
            message,
          });
        }
      }
    }

    const lines = ALL_CODES.map((code) => ({
      code,
      disruptions: lineMap[code] || [],
    }));

    return res.status(200).json({
      lines,
      updatedAt: text(data.lastUpdatedDate) ||
        new Date().toISOString(),
      total_disruptions: disruptions.length,
    });
  } catch (error) {
    return res.status(200).json({
      lines: [],
      error: error.message || "Erreur API transport",
    });
  }
}
