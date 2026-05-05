import { useState, useEffect } from "react";


// ─── CONFIGURATION ──────────────────────────────────────────────────────────

const SLIDE_DURATION = 30000;
const QUOTES_SLIDE_DURATION = 60000; // Plus long pour laisser défiler tous les devis
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// URLs Google Sheets publiées en CSV
const SHEET_URLS = {
  planning: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRpE027LVSx_f7HmnWQ3KbGXSYpp4dwuOqAcQMK-OLMn2zBxLH02mg7ckJFco6pr2rhYBbELNhCi9X8/pub?gid=0&single=true&output=csv",
  affaires: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRpE027LVSx_f7HmnWQ3KbGXSYpp4dwuOqAcQMK-OLMn2zBxLH02mg7ckJFco6pr2rhYBbELNhCi9X8/pub?gid=584135097&single=true&output=csv",
  soustraitants: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRpE027LVSx_f7HmnWQ3KbGXSYpp4dwuOqAcQMK-OLMn2zBxLH02mg7ckJFco6pr2rhYBbELNhCi9X8/pub?gid=1074854777&single=true&output=csv",
  // À remplacer par la vraie URL une fois l'onglet Devis créé et publié
  devis: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRpE027LVSx_f7HmnWQ3KbGXSYpp4dwuOqAcQMK-OLMn2zBxLH02mg7ckJFco6pr2rhYBbELNhCi9X8/pub?gid=49286593&single=true&output=csv",
};

// Étapes pour la slide Devis (différentes des affaires, plus orientées client)
const QUOTE_STAGES = {
  chiffrage:   { label: "À chiffrer",       short: "EN COURS",  color: "#6B7280", bg: "#F3F4F6" },
  envoye:      { label: "Envoyé au client", short: "ENVOYÉ",    color: "#1D4ED8", bg: "#DBEAFE" },
  attente:     { label: "En attente client",short: "ATTENTE",   color: "#B45309", bg: "#FEF3C7" },
  valide:      { label: "Validé",           short: "VALIDÉ",    color: "#047857", bg: "#D1FAE5" },
  travaux:     { label: "Travaux planifiés",short: "PLANIFIÉ",  color: "#5B21B6", bg: "#EDE9FE" },
};

// Ordre d'affichage : Jason, Cédric, Ghulam (Ghulam est alternant, en dernier)
const TECHNICIANS = [
  { id: 3, name: "Jason",  color: "#B45309", light: "#FEF3C7", dot: "#F59E0B" },
  { id: 2, name: "Cédric", color: "#047857", light: "#D1FAE5", dot: "#10B981" },
  { id: 1, name: "Ghulam", color: "#1D4ED8", light: "#DBEAFE", dot: "#3B82F6" },
];

const TENANTS = [
  { id: "voodoo",     name: "Voodoo",                short: "VDO", accent: "#7C3AED", accentLight: "#EDE9FE" },
  { id: "laposte",    name: "La Poste Enseigne",     short: "PE", accent: "#D97706", accentLight: "#FEF3C7" },
  { id: "logistique", name: "Logistique Urbaine",    short: "ELU", accent: "#059669", accentLight: "#D1FAE5" },
  { id: "louvre",     name: "Louvre Banque Privée",  short: "LBP", accent: "#1E40AF", accentLight: "#DBEAFE" },
  { id: "communes",   name: "Parties communes",      short: "PC",  accent: "#475569", accentLight: "#F1F5F9" },
];

const STAGES = {
  diagnostic: { label: "Diagnostic",          short: "DIAG",     color: "#6B7280", bg: "#F3F4F6", order: 1 },
  devis:      { label: "Chiffrage devis",     short: "DEVIS",    color: "#1D4ED8", bg: "#DBEAFE", order: 2 },
  validation: { label: "Attente validation",  short: "VALID",    color: "#B45309", bg: "#FEF3C7", order: 3 },
  valide:     { label: "Devis validé",        short: "OK",       color: "#047857", bg: "#D1FAE5", order: 4 },
  travaux:    { label: "Travaux en cours",    short: "EN COURS", color: "#5B21B6", bg: "#EDE9FE", order: 5 },
  termine:    { label: "Terminé",             short: "FAIT",     color: "#374151", bg: "#E5E7EB", order: 6 },
};

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// Mapping des couleurs pour les sous-traitants (cycle automatique)
const SUB_COLORS = [
  { color: "#1D4ED8", light: "#DBEAFE" },
  { color: "#0891B2", light: "#CFFAFE" },
  { color: "#B45309", light: "#FEF3C7" },
  { color: "#7C3AED", light: "#EDE9FE" },
  { color: "#DC2626", light: "#FEE2E2" },
  { color: "#059669", light: "#D1FAE5" },
];

// Mapping nom technicien → ID
const TECH_NAME_TO_ID = {
  "ghulam": 1,
  "cédric": 2, "cedric": 2,
  "jason": 3, "jayson": 3,
};

// Mapping nom locataire → ID
const TENANT_NAME_TO_ID = {
  "voodoo": "voodoo",
  "la poste enseigne": "laposte", "laposte": "laposte",
  "logistique urbaine": "logistique", "logistique": "logistique",
  "louvre banque privée": "louvre", "louvre banque privee": "louvre", "louvre": "louvre",
  "parties communes": "communes", "communes": "communes",
};

// Mapping jour → index
const DAY_NAME_TO_INDEX = {
  "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4,
};

// ─── JOURS FÉRIÉS FRANÇAIS ──────────────────────────────────────────────────

function getEasterDate(year) {
  // Algorithme de Butcher pour calculer Pâques
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getFrenchHolidays(year) {
  const easter = getEasterDate(year);
  const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
  const ascension = new Date(easter); ascension.setDate(easter.getDate() + 39);
  const pentecost = new Date(easter); pentecost.setDate(easter.getDate() + 50);

  return [
    { date: new Date(year, 0, 1),  name: "Jour de l'an" },
    { date: easterMonday,          name: "Lundi de Pâques" },
    { date: new Date(year, 4, 1),  name: "Fête du Travail" },
    { date: new Date(year, 4, 8),  name: "Victoire 1945" },
    { date: ascension,             name: "Ascension" },
    { date: pentecost,             name: "Lundi de Pentecôte" },
    { date: new Date(year, 6, 14), name: "Fête nationale" },
    { date: new Date(year, 7, 15), name: "Assomption" },
    { date: new Date(year, 10, 1), name: "Toussaint" },
    { date: new Date(year, 10, 11),name: "Armistice 1918" },
    { date: new Date(year, 11, 25),name: "Noël" },
  ];
}

function getHolidayForDate(date) {
  const holidays = getFrenchHolidays(date.getFullYear());
  return holidays.find(h =>
    h.date.getFullYear() === date.getFullYear() &&
    h.date.getMonth() === date.getMonth() &&
    h.date.getDate() === date.getDate()
  );
}

// ─── PARSING CSV ────────────────────────────────────────────────────────────

function parseCSV(text) {
  // Parser CSV simple avec gestion des guillemets
  const lines = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') { field += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === "," && !inQuotes) {
      current.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      current.push(field); field = "";
      if (current.some(c => c.trim() !== "")) lines.push(current);
      current = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || current.length > 0) {
    current.push(field);
    if (current.some(c => c.trim() !== "")) lines.push(current);
  }

  if (lines.length === 0) return [];
  const headers = lines[0].map(h => h.trim().toLowerCase());
  return lines.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (row[idx] || "").trim(); });
    return obj;
  });
}

// ─── FALLBACK (données de secours si Sheets indisponible) ───────────────────

const FALLBACK_PLANNING = [
  { techId: 3, tasks: [{ day: 0, label: "—", client: "Aucune donnée" }] },
  { techId: 2, tasks: [{ day: 0, label: "—", client: "Aucune donnée" }] },
  { techId: 1, tasks: [{ day: 0, label: "—", client: "Aucune donnée" }] },
];
const FALLBACK_AFFAIRS = { voodoo: [], laposte: [], logistique: [], louvre: [], communes: [] };
const FALLBACK_SUBCONTRACTORS = [];
const FALLBACK_QUOTES = [];

const SLIDES = [
  { id: "planning", type: "planning" },
  ...TENANTS.map(t => ({ id: t.id, type: "tenant", tenantId: t.id })),
  { id: "quotes", type: "quotes" },
  { id: "subcontractorsCurrent", type: "subcontractors", week: "current" },
  { id: "subcontractorsNext", type: "subcontractors", week: "next" },
];

// ─── UTILITAIRES ────────────────────────────────────────────────────────────

function getWeekDates() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  return DAY_NAMES.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const fmt = d => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const getTodayIndex = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

// ─── COMPOSANTS ─────────────────────────────────────────────────────────────

function AffairCard({ affair }) {
  const stage = STAGES[affair.stage];
  const tech = TECHNICIANS.find(t => t.id === affair.tech);
  return (
    <div style={{
      backgroundColor: "white",
      border: affair.urgent ? "2px solid #FCA5A5" : "1px solid #E5E7EB",
      borderRadius: 14,
      padding: "20px 22px 18px 28px",
      display: "flex", flexDirection: "column", gap: 12,
      position: "relative",
      boxShadow: affair.urgent ? "0 4px 16px rgba(239,68,68,.15)" : "0 2px 6px rgba(0,0,0,.05)",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: 6, height: "100%",
        backgroundColor: affair.urgent ? "#EF4444" : stage.color,
      }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em" }}>{affair.ref}</span>
        {affair.urgent && (
          <span style={{ fontSize: 11, fontWeight: 800, color: "#EF4444", letterSpacing: "0.08em" }}>● URGENT</span>
        )}
      </div>

      <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.3, minHeight: 44 }}>
        {affair.title}
      </div>

      <div>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 800,
          backgroundColor: stage.bg, color: stage.color,
          padding: "5px 12px",
          borderRadius: 20,
          letterSpacing: "0.07em",
        }}>{stage.label.toUpperCase()}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingTop: 12, borderTop: "1px solid #F3F4F6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            backgroundColor: tech.light, color: tech.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800,
          }}>{tech.name[0]}</div>
          <span style={{ fontSize: 13, color: "#374151", fontWeight: 700 }}>{tech.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {affair.validator && (
            <span style={{
              fontSize: 11, color: "#B45309", fontWeight: 700,
              backgroundColor: "#FEF3C7", padding: "3px 8px", borderRadius: 6,
            }}>→ {affair.validator}</span>
          )}
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>
            {affair.days === 0 ? "Aujourd'hui" : `J+${affair.days}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function TenantSlide({ tenant, affairs }) {
  const sorted = [...affairs].sort((a, b) => {
    if (a.urgent && !b.urgent) return -1;
    if (!a.urgent && b.urgent) return 1;
    return STAGES[a.stage].order - STAGES[b.stage].order;
  });

  const stats = {};
  affairs.forEach(a => { stats[a.stage] = (stats[a.stage] || 0) + 1; });
  const urgentCount = affairs.filter(a => a.urgent).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "32px 44px" }}>

      {/* Tenant header */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28 }}>
        <div style={{
          width: 96, height: 96, borderRadius: 18,
          backgroundColor: tenant.accentLight, color: tenant.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px",
          border: `3px solid ${tenant.accent}`,
          flexShrink: 0,
        }}>{tenant.short}</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            Locataire
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: "-1.5px", lineHeight: 1 }}>{tenant.name}</div>
          <div style={{ fontSize: 16, color: "#6B7280", marginTop: 10, fontWeight: 500 }}>
            {affairs.length} affaire{affairs.length > 1 ? "s" : ""} en cours
            {urgentCount > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}> · {urgentCount} urgent{urgentCount > 1 ? "s" : ""}</span>}
          </div>
        </div>

        {/* Stats by stage */}
        <div style={{ display: "flex", gap: 10 }}>
          {Object.entries(stats)
            .sort(([a], [b]) => STAGES[a].order - STAGES[b].order)
            .map(([key, count]) => {
              const s = STAGES[key];
              return (
                <div key={key} style={{
                  backgroundColor: s.bg, color: s.color,
                  padding: "12px 16px",
                  borderRadius: 12,
                  textAlign: "center",
                  minWidth: 76,
                }}>
                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, marginTop: 5, letterSpacing: "0.08em" }}>{s.short}</div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Affairs grid - 4 columns for 60" */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        alignContent: "start",
        overflow: "hidden",
      }}>
        {sorted.map(affair => <AffairCard key={affair.id} affair={affair} />)}
      </div>
    </div>
  );
}

function PlanningSlide({ planning }) {
  const weekDates = getWeekDates();
  const todayIdx = getTodayIndex();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "32px 44px" }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          Vue équipe
        </div>
        <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: "-1.5px", lineHeight: 1 }}>
          Planning techniciens
        </div>
        <div style={{ fontSize: 16, color: "#6B7280", marginTop: 10, fontWeight: 500 }}>
          Semaine du {fmt(weekDates[0])} au {fmt(weekDates[4])}
        </div>
      </div>

      {/* Header jours */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "230px repeat(5, 1fr)",
        gap: 6,
        marginBottom: 6,
      }}>
        <div />
        {DAY_NAMES.map((day, i) => {
          const isToday = i === todayIdx;
          const holiday = getHolidayForDate(weekDates[i]);
          return (
            <div key={day} style={{
              padding: "16px 10px",
              textAlign: "center",
              borderRadius: "12px 12px 0 0",
              backgroundColor: holiday ? "#9CA3AF" : (isToday ? "#1D4ED8" : "#E5E7EB"),
              color: (holiday || isToday) ? "white" : "#6B7280",
              fontWeight: 700, fontSize: 17,
            }}>
              <div>{day}</div>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.75, marginTop: 3 }}>{fmt(weekDates[i])}</div>
            </div>
          );
        })}
      </div>

      {/* Lignes techniciens */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {planning.map(({ techId, tasks }) => {
          const tech = TECHNICIANS.find(t => t.id === techId);
          return (
            <div key={techId} style={{
              display: "grid",
              gridTemplateColumns: "230px repeat(5, 1fr)",
              gap: 6,
              flex: 1,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "20px 20px",
                backgroundColor: "white",
                borderRadius: "12px 0 0 12px",
                borderLeft: `6px solid ${tech.dot}`,
                boxShadow: "0 2px 6px rgba(0,0,0,.05)",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  backgroundColor: tech.light, color: tech.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 800, flexShrink: 0,
                }}>{tech.name[0]}</div>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{tech.name}</span>
              </div>

              {DAY_NAMES.map((_, dayIdx) => {
                const dayTasks = tasks.filter(t => t.day === dayIdx);
                const isToday = dayIdx === todayIdx;
                const holiday = getHolidayForDate(weekDates[dayIdx]);
                if (holiday) {
                  return (
                    <div key={dayIdx} style={{
                      backgroundColor: "#F3F4F6",
                      border: "1px solid #E5E7EB",
                      borderRadius: 8,
                      padding: "12px 11px",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.1em" }}>FÉRIÉ</div>
                      <div style={{ fontSize: 12, color: "#6B7280", textAlign: "center", lineHeight: 1.2 }}>{holiday.name}</div>
                    </div>
                  );
                }
                return (
                  <div key={dayIdx} style={{
                    backgroundColor: isToday ? "#F0F4FF" : "#FAFAFA",
                    border: `1px solid ${isToday ? "#BFDBFE" : "#EFEFEF"}`,
                    borderRadius: 8,
                    padding: "12px 11px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {dayTasks.length === 0 ? (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 28, height: 1.5, backgroundColor: "#D1D5DB" }} />
                      </div>
                    ) : dayTasks.map((task, i) => (
                      <div key={i} style={{
                        backgroundColor: tech.light,
                        borderLeft: `4px solid ${tech.dot}`,
                        borderRadius: "0 8px 8px 0",
                        padding: "10px 13px",
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: tech.color, lineHeight: 1.3 }}>{task.label}</div>
                        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{task.client}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SLIDE DEVIS EN COURS ────────────────────────────────────────────────────

const QUOTES_ACCENT = "#0E7490";
const QUOTES_ACCENT_LIGHT = "#CFFAFE";

function QuotesSlide({ quotes }) {
  // Tri : urgents d'abord, puis par ancienneté (date la plus ancienne en premier)
  const sorted = [...quotes].sort((a, b) => {
    if (a.urgent && !b.urgent) return -1;
    if (!a.urgent && b.urgent) return 1;
    // Trier par date d'envoi (les plus anciennes en haut)
    return (a.dateValue || 0) - (b.dateValue || 0);
  });

  const totalUrgent = quotes.filter(q => q.urgent).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "32px 44px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }}>
        <div style={{
          width: 96, height: 96, borderRadius: 18,
          backgroundColor: QUOTES_ACCENT_LIGHT, color: QUOTES_ACCENT,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px",
          border: `3px solid ${QUOTES_ACCENT}`,
          flexShrink: 0,
        }}>€</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            Suivi des devis
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: "-1.5px", lineHeight: 1 }}>
            Devis en cours
          </div>
          <div style={{ fontSize: 16, color: "#6B7280", marginTop: 10, fontWeight: 500 }}>
            {quotes.length === 0
              ? "Aucun devis en cours"
              : `${quotes.length} devis en cours${totalUrgent > 0 ? ` — ${totalUrgent} urgent${totalUrgent > 1 ? "s" : ""}` : ""}`
            }
          </div>
        </div>

        {/* Compteurs à droite */}
        <div style={{ display: "flex", gap: 12 }}>
          {totalUrgent > 0 && (
            <div style={{
              backgroundColor: "#FEE2E2", color: "#991B1B",
              padding: "16px 20px",
              borderRadius: 12,
              textAlign: "center",
              minWidth: 90,
            }}>
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{totalUrgent}</div>
              <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, letterSpacing: "0.08em" }}>URGENTS</div>
            </div>
          )}
          <div style={{
            backgroundColor: QUOTES_ACCENT_LIGHT, color: QUOTES_ACCENT,
            padding: "16px 20px",
            borderRadius: 12,
            textAlign: "center",
            minWidth: 90,
          }}>
            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{quotes.length}</div>
            <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, letterSpacing: "0.08em" }}>EN COURS</div>
          </div>
        </div>
      </div>

      {/* Liste des devis avec défilement automatique */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        maskImage: "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
      }}>
        {sorted.length === 0 ? (
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#9CA3AF", fontSize: 22, fontWeight: 500,
          }}>
            Aucun devis en cours actuellement
          </div>
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            // Animation : défile en boucle infinie. Vitesse adaptée au nombre de devis.
            // 5s par devis = pour 17 devis, boucle complète en ~85s (la slide dure 60s, donc on voit ~70% de la liste)
            animation: sorted.length > 5 ? `scrollQuotes ${sorted.length * 5}s linear infinite` : "none",
          }}>
            {/* Liste dupliquée 2x pour boucle infinie fluide */}
            {[...sorted, ...sorted].map((quote, i) => {
              const stage = QUOTE_STAGES[quote.stage] || QUOTE_STAGES.envoye;
              return (
                <div key={i} style={{
                  backgroundColor: "white",
                  border: quote.urgent ? "3px solid #DC2626" : "1px solid #E5E7EB",
                  borderRadius: 12,
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  boxShadow: "0 2px 6px rgba(0,0,0,.04)",
                  flexShrink: 0,
                }}>
                  {/* Badge URGENT à gauche si urgent */}
                  {quote.urgent && (
                    <div style={{
                      backgroundColor: "#DC2626", color: "white",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 14, fontWeight: 800, letterSpacing: "0.08em",
                      flexShrink: 0,
                    }}>URGENT</div>
                  )}

                  {/* Référence */}
                  <div style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 20, fontWeight: 700, color: "#111827",
                    minWidth: 130, flexShrink: 0,
                  }}>{quote.ref || "—"}</div>

                  {/* Client + Titre — CLIENT EN GROS */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 26, fontWeight: 800, color: QUOTES_ACCENT,
                      letterSpacing: "-0.5px", marginBottom: 6, lineHeight: 1,
                    }}>
                      {quote.client}
                    </div>
                    <div style={{
                      fontSize: 17, fontWeight: 500, color: "#374151", lineHeight: 1.3,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {quote.title}
                    </div>
                  </div>

                  {/* Date d'envoi */}
                  {quote.dateLabel && (
                    <div style={{
                      fontSize: 14, color: "#6B7280", fontWeight: 500,
                      textAlign: "right", flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase" }}>Envoyé</div>
                      <div style={{ fontSize: 17, color: "#111827", fontWeight: 700, marginTop: 3 }}>{quote.dateLabel}</div>
                    </div>
                  )}

                  {/* Étape */}
                  <div style={{
                    backgroundColor: stage.bg, color: stage.color,
                    padding: "10px 16px",
                    borderRadius: 8,
                    fontSize: 13, fontWeight: 800, letterSpacing: "0.05em",
                    textAlign: "center",
                    minWidth: 120, flexShrink: 0,
                  }}>{stage.short}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SLIDE SOUS-TRAITANTS ────────────────────────────────────────────────────

const SUBCONTRACTORS_ACCENT = "#0F766E";
const SUBCONTRACTORS_ACCENT_LIGHT = "#CCFBF1";

function getCurrentWeekDates() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  return DAY_NAMES.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getNextWeekDates() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff + 7); // semaine prochaine
  return DAY_NAMES.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function SubcontractorsSlide({ subcontractors, week = "next" }) {
  const isCurrent = week === "current";
  const weekDates = isCurrent ? getCurrentWeekDates() : getNextWeekDates();
  const subtitle = isCurrent
    ? `Cette semaine — du ${fmt(weekDates[0])} au ${fmt(weekDates[4])}`
    : `Semaine prochaine — du ${fmt(weekDates[0])} au ${fmt(weekDates[4])}`;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "32px 44px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28 }}>
        <div style={{
          width: 96, height: 96, borderRadius: 18,
          backgroundColor: SUBCONTRACTORS_ACCENT_LIGHT, color: SUBCONTRACTORS_ACCENT,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px",
          border: `3px solid ${SUBCONTRACTORS_ACCENT}`,
          flexShrink: 0,
        }}>ST</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            Interventions externes
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: "-1.5px", lineHeight: 1 }}>
            Sous-traitants
          </div>
          <div style={{ fontSize: 16, color: "#6B7280", marginTop: 10, fontWeight: 500 }}>
            {subtitle}
          </div>
        </div>

        {/* Compteur total */}
        <div style={{
          backgroundColor: SUBCONTRACTORS_ACCENT_LIGHT, color: SUBCONTRACTORS_ACCENT,
          padding: "16px 24px",
          borderRadius: 12,
          textAlign: "center",
          minWidth: 100,
        }}>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{subcontractors.length}</div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, letterSpacing: "0.08em" }}>INTERVENTIONS</div>
        </div>
      </div>

      {/* Grille jours */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 12,
        flex: 1,
      }}>
        {DAY_NAMES.map((day, dayIdx) => {
          const daySubs = subcontractors.filter(s => s.day === dayIdx);
          return (
            <div key={day} style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 2px 6px rgba(0,0,0,.05)",
            }}>
              {/* En-tête du jour */}
              <div style={{
                padding: "14px 12px",
                textAlign: "center",
                backgroundColor: "#F9FAFB",
                borderBottom: "1px solid #E5E7EB",
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{day}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, fontWeight: 500 }}>{fmt(weekDates[dayIdx])}</div>
              </div>

              {/* Liste des sous-traitants du jour */}
              <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {daySubs.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 28, height: 1.5, backgroundColor: "#D1D5DB" }} />
                  </div>
                ) : daySubs.map((sub, i) => (
                  <div key={i} style={{
                    backgroundColor: sub.light,
                    borderLeft: `4px solid ${sub.color}`,
                    borderRadius: "0 8px 8px 0",
                    padding: "12px 13px",
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: sub.color, lineHeight: 1.2 }}>{sub.company}</div>
                    <div style={{ fontSize: 12, color: "#374151", marginTop: 4, fontWeight: 600 }}>{sub.domain}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4, fontStyle: "italic" }}>→ {sub.location}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [time, setTime] = useState(new Date());
  const [slideIdx, setSlideIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [planning, setPlanning] = useState(FALLBACK_PLANNING);
  const [affairs, setAffairs] = useState(FALLBACK_AFFAIRS);
  const [subcontractorsCurrent, setSubcontractorsCurrent] = useState(FALLBACK_SUBCONTRACTORS);
  const [subcontractorsNext, setSubcontractorsNext] = useState(FALLBACK_SUBCONTRACTORS);
  const [quotes, setQuotes] = useState(FALLBACK_QUOTES);
  const [dataStatus, setDataStatus] = useState("loading"); // "loading" | "ok" | "error"
  const [lastUpdate, setLastUpdate] = useState(null);

  // Charger les données depuis Google Sheets
  useEffect(() => {
    let cancelled = false;

    async function fetchAllData() {
      try {
        const fetchDevis = SHEET_URLS.devis && SHEET_URLS.devis !== "DEVIS_URL_TO_REPLACE"
          ? fetch(SHEET_URLS.devis).then(r => r.text()).catch(() => "")
          : Promise.resolve("");

        const [planningRes, affairsRes, subsRes, quotesRes] = await Promise.all([
          fetch(SHEET_URLS.planning).then(r => r.text()),
          fetch(SHEET_URLS.affaires).then(r => r.text()),
          fetch(SHEET_URLS.soustraitants).then(r => r.text()),
          fetchDevis,
        ]);

        if (cancelled) return;

        // Parser Planning : technicien, jour, tache, client
        const planningRows = parseCSV(planningRes);
        const planningByTech = {};
        planningRows.forEach(row => {
          const techId = TECH_NAME_TO_ID[(row.technicien || "").toLowerCase()];
          const dayIdx = DAY_NAME_TO_INDEX[(row.jour || "").toLowerCase()];
          if (techId === undefined || dayIdx === undefined) return;
          if (!planningByTech[techId]) planningByTech[techId] = [];
          planningByTech[techId].push({
            day: dayIdx,
            label: row.tache || "",
            client: row.client || "",
          });
        });
        // Reconstruire dans l'ordre Jason, Cédric, Ghulam
        const newPlanning = TECHNICIANS.map(t => ({
          techId: t.id,
          tasks: planningByTech[t.id] || [],
        }));

        // Parser Affaires : locataire, reference, titre, etape, technicien, validateur, jours, urgent
        const affairsRows = parseCSV(affairsRes);
        const newAffairs = { voodoo: [], laposte: [], logistique: [], louvre: [], communes: [] };
        affairsRows.forEach((row, idx) => {
          const tenantId = TENANT_NAME_TO_ID[(row.locataire || "").toLowerCase()];
          const techId = TECH_NAME_TO_ID[(row.technicien || "").toLowerCase()];
          const stage = (row.etape || "").toLowerCase();
          if (!tenantId || !STAGES[stage]) return;
          newAffairs[tenantId].push({
            id: idx + 1,
            ref: row.reference || "",
            title: row.titre || "",
            stage: stage,
            tech: techId || 1,
            validator: row.validateur || undefined,
            days: parseInt(row.jours, 10) || 0,
            urgent: ["oui", "yes", "true", "1"].includes((row.urgent || "").toLowerCase()),
          });
        });

        // Parser SousTraitants : jour, entreprise, domaine, lieu, semaine
        const subsRows = parseCSV(subsRes);
        const newSubsCurrent = [];
        const newSubsNext = [];
        subsRows.forEach((row, idx) => {
          const dayIdx = DAY_NAME_TO_INDEX[(row.jour || "").toLowerCase()];
          if (dayIdx === undefined) return;
          const colorIdx = idx % SUB_COLORS.length;
          const sub = {
            day: dayIdx,
            company: row.entreprise || "",
            domain: row.domaine || "",
            location: row.lieu || "",
            color: SUB_COLORS[colorIdx].color,
            light: SUB_COLORS[colorIdx].light,
          };
          // Tri par colonne "semaine" : actuelle / prochaine
          // Si la colonne est vide ou non reconnue, on met dans "prochaine" (compatibilité ascendante)
          const semaine = (row.semaine || "").toLowerCase().trim();
          if (semaine === "actuelle" || semaine === "current" || semaine === "cette") {
            newSubsCurrent.push(sub);
          } else {
            newSubsNext.push(sub);
          }
        });

        // Parser Devis : client, reference, titre, date_envoi, etape, urgent
        const quotesRows = quotesRes ? parseCSV(quotesRes) : [];
        const newQuotes = quotesRows
          .map(row => {
            const stage = (row.etape || "envoye").toLowerCase().trim();
            // Parser date au format JJ/MM ou JJ/MM/AAAA
            let dateValue = 0;
            let dateLabel = "";
            const rawDate = (row.date_envoi || row.date || "").trim();
            if (rawDate) {
              const parts = rawDate.split(/[\/\-\.]/);
              if (parts.length >= 2) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
                const fullYear = year < 100 ? 2000 + year : year;
                const d = new Date(fullYear, month - 1, day);
                if (!isNaN(d.getTime())) {
                  dateValue = d.getTime();
                  dateLabel = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
                }
              }
            }
            return {
              client: row.client || "",
              ref: row.reference || "",
              title: row.titre || "",
              dateLabel,
              dateValue,
              stage: QUOTE_STAGES[stage] ? stage : "envoye",
              urgent: ["oui", "yes", "true", "1"].includes((row.urgent || "").toLowerCase()),
            };
          })
          .filter(q => q.client || q.ref || q.title);

        setPlanning(newPlanning);
        setAffairs(newAffairs);
        setSubcontractorsCurrent(newSubsCurrent);
        setSubcontractorsNext(newSubsNext);
        setQuotes(newQuotes);
        setDataStatus("ok");
        setLastUpdate(new Date());
      } catch (err) {
        if (!cancelled) {
          console.error("Erreur chargement Sheets:", err);
          setDataStatus("error");
        }
      }
    }

    fetchAllData();
    const interval = setInterval(fetchAllData, REFRESH_INTERVAL);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    // Slide Devis : durée plus longue pour laisser le temps au défilement
    const slideDuration = SLIDES[slideIdx].type === "quotes" ? QUOTES_SLIDE_DURATION : SLIDE_DURATION;
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / slideDuration) * 100));
    }, 100);
    const advance = setTimeout(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length);
    }, slideDuration);
    return () => { clearInterval(tick); clearTimeout(advance); };
  }, [slideIdx]);

  const timeStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const currentSlide = SLIDES[slideIdx];
  const currentTenant = currentSlide.type === "tenant" ? TENANTS.find(t => t.id === currentSlide.tenantId) : null;
  const isSubcontractors = currentSlide.type === "subcontractors";
  const isQuotes = currentSlide.type === "quotes";
  const headerAccent = currentTenant
    ? currentTenant.accent
    : isSubcontractors ? SUBCONTRACTORS_ACCENT
    : isQuotes ? QUOTES_ACCENT
    : "#1D4ED8";
  const totalUrgent = Object.values(affairs).flat().filter(a => a.urgent).length;

  return (
    <div style={{
      height: "100vh",
      backgroundColor: "#F4F4F2",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scrollQuotes { from { transform: translateY(0); } to { transform: translateY(-50%); } }
      `}</style>

      {/* HEADER */}
      <div style={{
        backgroundColor: "#111827",
        color: "white",
        padding: "18px 44px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        borderBottom: `4px solid ${headerAccent}`,
        transition: "border-color 0.5s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{
            width: 8, height: 56,
            backgroundColor: headerAccent,
            borderRadius: 4,
            transition: "background-color 0.5s ease",
          }} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>TABLEAU DE BORD</div>
            <div style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500, marginTop: 3 }}>
              Slide {slideIdx + 1} / {SLIDES.length} · rotation auto 30s
            </div>
          </div>
          <div style={{
            marginLeft: 16,
            padding: "8px 16px",
            backgroundColor: "white",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            lineHeight: 1,
          }}>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#003C71",
              letterSpacing: "0.05em",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>VINCI</div>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#DA291C",
              letterSpacing: "0.18em",
              marginTop: 2,
              textTransform: "uppercase",
            }}>Facilities</div>
          </div>
          {totalUrgent > 0 && (
            <div style={{
              marginLeft: 18,
              backgroundColor: "#7F1D1D",
              border: "1.5px solid #EF4444",
              borderRadius: 10,
              padding: "8px 14px",
              display: "flex", alignItems: "center", gap: 9,
            }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: "#EF4444", animation: "pulse 1.5s infinite" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#FCA5A5" }}>
                {totalUrgent} urgent{totalUrgent > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 44, fontWeight: 500, fontFamily: "'DM Mono', monospace", letterSpacing: "-1.5px", lineHeight: 1 }}>{timeStr}</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6, textTransform: "capitalize" }}>{dateStr}</div>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div style={{ height: 4, backgroundColor: "#E5E7EB", flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: headerAccent,
          transition: "width 0.1s linear, background-color 0.5s ease",
        }} />
      </div>

      {/* DOTS NAVIGATION */}
      <div style={{
        backgroundColor: "white",
        padding: "14px 44px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        borderBottom: "1px solid #EFEFEF",
      }}>
        {SLIDES.map((s, i) => {
          const isActive = i === slideIdx;
          const tenant = s.type === "tenant" ? TENANTS.find(t => t.id === s.tenantId) : null;
          let label, accentColor;
          if (s.type === "planning") {
            label = "ÉQUIPE";
            accentColor = "#3B82F6";
          } else if (s.type === "subcontractors") {
            label = s.week === "current" ? "ST CETTE SEM." : "ST SEM. PROCH.";
            accentColor = SUBCONTRACTORS_ACCENT;
          } else if (s.type === "quotes") {
            label = "DEVIS";
            accentColor = QUOTES_ACCENT;
          } else {
            label = tenant.name.toUpperCase();
            accentColor = tenant.accent;
          }
          return (
            <div key={s.id} style={{
              padding: isActive ? "8px 18px" : "8px 14px",
              borderRadius: 22,
              backgroundColor: isActive ? accentColor : "#F3F4F6",
              color: isActive ? "white" : "#6B7280",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.05em",
              transition: "all 0.3s ease",
            }}>{label}</div>
          );
        })}
      </div>

      {/* SLIDE CONTENT */}
      <div key={slideIdx} style={{
        flex: 1,
        overflow: "hidden",
        animation: "fadeIn 0.5s ease",
      }}>
        {currentSlide.type === "planning" && <PlanningSlide planning={planning} />}
        {currentSlide.type === "tenant" && <TenantSlide tenant={currentTenant} affairs={affairs[currentTenant.id] || []} />}
        {currentSlide.type === "quotes" && <QuotesSlide quotes={quotes} />}
        {currentSlide.type === "subcontractors" && (
          <SubcontractorsSlide
            subcontractors={currentSlide.week === "current" ? subcontractorsCurrent : subcontractorsNext}
            week={currentSlide.week}
          />
        )}
      </div>
    </div>
  );
}
