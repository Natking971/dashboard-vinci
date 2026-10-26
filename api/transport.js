
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const apiKey = process.env.IDFM_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      lines: [],
      error: "IDFM_API_KEY non configuree dans Vercel",
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
    PERTURBEE: "Perturbation",
    BLOQUANTE: "Perturbation",
    BLOQUEE: "Bloqué",
    REDUITE: "Trafic réduit",
    GREVE: "Grève",
    ACCIDENT: "Accident",
    PANNE: "Panne",
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
        value.short_name ||
        value.code ||
        ""
      );
    }

    return "";
  }

  function array(value) {
    if (Array.isArray(value)) return value;
    return value == null ? [] : [value];
  }

  function clean(value = "") {
    return String(value)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&#[0-9]+;/g, " ")
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

    const direct = n.toUpperCase();

    if (ALL_CODES.includes(direct)) {
      return direct;
    }

    const rer = n.match(/\brer\s*[-:]?\s*([a-e])\b/i);

    if (rer) {
      return rer[1].toUpperCase();
    }

    const transilien = n.match(
      /\btransilien\s*(?:ligne\s*)?([hjklnpruv])\b/i
    );

    if (transilien) {
      return transilien[1].toUpperCase();
    }

    const line = n.match(
      /\b(?:ligne|line|train)\s*[-:]?\s*([a-e]|\d{1,2}(?:bis|b)?)\b/i
    );

    if (line) {
      const code = line[1]
        .replace(/bis$/i, "B")
        .toUpperCase();

      if (ALL_CODES.includes(code)) {
        return code;
      }
    }

    const metro = n.match(
      /\bmetro\s*(\d{1,2}(?:bis|b)?)\b/i
    );

    if (metro) {
      const code = metro[1]
        .replace(/bis$/i, "B")
        .toUpperCase();

      if (ALL_CODES.includes(code)) {
        return code;
      }
    }

    return null;
  }

  function codeFromObject(obj) {
    if (typeof obj === "string") {
      return findCode(obj);
    }

    if (!obj || typeof obj !== "object") {
      return null;
    }

    for (const candidate of [
      obj.shortName,
      obj.short_name,
      obj.code,
      obj.name,
      obj.label,
      obj.lineName,
      obj.line_name,
      obj.line,
    ]) {
      const code = findCode(text(candidate));

      if (code) return code;
    }

    return null;
  }

  function normalizeLineId(value) {
    return String(value || "")
      .trim()
      .replace(/^line:/i, "");
  }

  function translate(value = "") {
    let t = clean(value);

    const replacements = [
      [/traffic is interrupted between (.+?) and (.+?)(?:\.|,|$)/gi, "Trafic interrompu entre $1 et $2"],
      [/traffic is interrupted on (.+?)(?:\.|$)/gi, "Trafic interrompu sur $1"],
      [/traffic is interrupted|traffic interrupted/gi, "Trafic interrompu"],
      [/traffic is disrupted|traffic disrupted/gi, "Trafic perturbé"],
      [/traffic is running normally/gi, "Trafic normal"],
      [/train parked/gi, "Train en stationnement"],
      [/train stalled/gi, "Train en panne"],
      [/stop[s]? not served/gi, "Arrêt(s) non desservi(s)"],
      [/station[s]? not served/gi, "Station(s) non desservie(s)"],
      [/will not be served/gi, "ne sera pas desservi"],
      [/departures? (?:are )?cancelled/gi, "Départs supprimés"],
      [/cancelled/gi, "supprimé(s)"],
      [/replacement bus service is provided/gi, "Bus de remplacement mis en place"],
      [/replacement bus/gi, "bus de remplacement"],
      [/due to construction|due to works?/gi, "en raison de travaux"],
      [/due to engineering works?/gi, "en raison de travaux techniques"],
      [/due to a breakdown/gi, "en raison d'une panne"],
      [/due to an incident/gi, "en raison d'un incident"],
      [/due to a strike/gi, "en raison d'une grève"],
      [/until further notice/gi, "jusqu'à nouvel ordre"],
      [/in both directions?/gi, "dans les deux sens"],
      [/the line will be diverted|will be diverted|diverted/gi, "ligne déviée"],
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

  // Récupère les objets impactés et les lignes dans impactedSections.
  function extractImpactedObjects(disruption) {
    const objects = [
      ...array(disruption?.impactedObjects),
      ...array(disruption?.impacted_objects),
      ...array(disruption?.ptObjects),
      ...array(disruption?.pt_objects),
    ];

    const sections = [
      ...array(disruption?.impactedSections),
      ...array(disruption?.impacted_sections),
    ];

    for (const section of sections) {
      if (!section || typeof section !== "object") continue;

      const lineObject = section.line;

      const lineId = text(
        section.lineId ||
        section.line_id ||
        (
          lineObject && typeof lineObject === "object"
            ? lineObject.id ||
              lineObject.lineId ||
              lineObject.line_id
            : ""
        )
      );

      const lineCode = codeFromObject(lineObject);

      const lineName = text(
        section.lineName ||
        section.line_name ||
        lineObject
      );

      if (lineId) {
        objects.push({
          type: "line",
          id: lineId,
          name: lineName,
          shortName: lineCode || "",
        });
      } else if (lineCode) {
        objects.push({
          type: "line",
          name: lineName,
          shortName: lineCode,
        });
      }
    }

    return objects;
  }

  function explicitCodesFromText(value = "") {
    const n = normalize(value);
    const codes = new Set();

    const patterns = [
      /\btransilien\s*(?:ligne\s*)?([hjklnpruv])\b/gi,
      /\b(?:ligne|line|train)\s*[-:]?\s*([hjklnpruv])\b/gi,
      /\brer\s*[-:]?\s*([a-e])\b/gi,
      /\bmetro\s*(\d{1,2}(?:bis|b)?)\b/gi,
      /\b(?:ligne|line)\s*(\d{1,2}(?:bis|b)?)\b/gi,
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(n)) !== null) {
        const code = match[1]
          .replace(/bis$/i, "B")
          .toUpperCase();

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
      throw new Error(`IDFM HTTP ${response.status}`);
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

    // Associe les identifiants techniques aux codes des lignes.
    const lineCodeById = new Map();

    function registerLineId(id, code) {
      if (!id || !code) return;

      const originalId = String(id).trim();

      lineCodeById.set(originalId, code);
      lineCodeById.set(normalizeLineId(originalId), code);
    }

    for (const line of sourceLines) {
      const code = codeFromObject(line);

      if (!code) continue;

      for (const id of getLineIds(line)) {
        registerLineId(id, code);
      }
    }

    function findCodeByLineId(id) {
      if (!id) return null;

      const originalId = String(id).trim();

      return (
        lineCodeById.get(originalId) ||
        lineCodeById.get(normalizeLineId(originalId)) ||
        null
      );
    }

    function codesForDisruption(disruption) {
      const codes = new Set();
      const disruptionId = text(disruption?.id);

      // 1. Lignes directement présentes dans le message.
      for (const line of array(disruption?.lines)) {
        const directCode = codeFromObject(line);

        if (directCode) {
          codes.add(directCode);
        }

        if (line && typeof line === "object") {
          const id = text(
            line.id || line.lineId || line.line_id
          );

          const mapped = findCodeByLineId(id);

          if (mapped) {
            codes.add(mapped);
          }
        }
      }

      // 2. Objets impactés, dont impactedSections[].lineId.
      for (const obj of extractImpactedObjects(disruption)) {
        if (!obj || typeof obj !== "object") {
          const code = findCode(text(obj));

          if (code) codes.add(code);
          continue;
        }

        const type = normalize(
          text(obj.type || obj.embedded_type || obj.embeddedType)
        );

        const id = text(
          obj.id || obj.lineId || obj.line_id
        );

        const isLine =
          type === "line" ||
          type.includes("line") ||
          /^line:/i.test(id);

        // Ne pas attribuer une perturbation à partir du seul nom d'un arrêt.
        if (type && !isLine) continue;

        let code = codeFromObject(obj);

        if (!code && id) {
          code = findCodeByLineId(id);
        }

        if (code) {
          codes.add(code);
        }

        const linkedIds = array(
          obj.disruptionIds || obj.disruption_ids
        ).map((item) =>
          item && typeof item === "object"
            ? text(item.id)
            : text(item)
        );

        if (
          disruptionId &&
          linkedIds.includes(disruptionId) &&
          !code
        ) {
          const mapped = findCodeByLineId(id);

          if (mapped) {
            codes.add(mapped);
          }
        }
      }

      // 3. Liens définis directement dans les objets lignes.
      for (const line of sourceLines) {
        const linkedIds = array(
          line.disruptionIds ||
          line.disruption_ids ||
          line.disruptions
        ).map((item) =>
          item && typeof item === "object"
            ? text(item.id)
            : text(item)
        );

        if (
          disruptionId &&
          linkedIds.includes(disruptionId)
        ) {
          const code = codeFromObject(line);

          if (code) {
            codes.add(code);
          }
        }
      }

      // 4. Dernier recours : ligne explicitement nommée dans le texte.
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

      const lineJMappings = [...lineCodeById.entries()]
        .filter(([, code]) => code === "J")
        .map(([id, code]) => ({ id, code }));

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
        lineJMappings,
        lineJCandidates,
      });
    }

    const lineMap = {};

    for (const disruption of disruptions) {
      const cause = text(disruption?.cause).toUpperCase();
      const severity = text(disruption?.severity).toUpperCase();

      // Ignore les messages purement informatifs ou normaux.
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

        const duplicate = lineMap[code].some(
          (item) =>
            item.message === message &&
            item.severity === causeFR
        );

        if (!duplicate) {
          lineMap[code].push({
            severity: causeFR,
            message,
          });
        }
      }
    }

    // Renvoie toutes les lignes attendues par le dashboard.
    const lines = ALL_CODES.map((code) => ({
      code,
      disruptions: lineMap[code] || [],
    }));

    return res.status(200).json({
      lines,
      updatedAt:
        text(data.lastUpdatedDate) || new Date().toISOString(),
      total_disruptions: disruptions.length,
    });
  } catch (error) {
    return res.status(200).json({
      lines: [],
      error: error instanceof Error
        ? error.message
        : "Erreur API transport",
    });
  }
}
