import { useState, useEffect } from "react";

// ─── CONFIGURATION ──────────────────────────────────────────────────────────

const SLIDE_DURATION = 30000;

const TECHNICIANS = [
  { id: 1, name: "Ghulam", color: "#1D4ED8", light: "#DBEAFE", dot: "#3B82F6" },
  { id: 2, name: "Cédric", color: "#047857", light: "#D1FAE5", dot: "#10B981" },
  { id: 3, name: "Jayson", color: "#B45309", light: "#FEF3C7", dot: "#F59E0B" },
];

const TENANTS = [
  { id: "voodoo",     name: "Voodoo",                short: "VDO", accent: "#7C3AED", accentLight: "#EDE9FE" },
  { id: "laposte",    name: "La Poste Enseigne",     short: "LPE", accent: "#D97706", accentLight: "#FEF3C7" },
  { id: "logistique", name: "Logistique Urbaine",    short: "LOG", accent: "#059669", accentLight: "#D1FAE5" },
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

const PLANNING = [
  { techId: 1, tasks: [
    { day: 0, label: "Maintenance Voodoo",      client: "Voodoo" },
    { day: 1, label: "Diagnostic chauffage",    client: "La Poste Enseigne" },
    { day: 3, label: "Vidéosurveillance",       client: "Logistique Urbaine" },
  ]},
  { techId: 2, tasks: [
    { day: 0, label: "Audit système accès",     client: "Louvre Banque Privée" },
    { day: 2, label: "Hall — peinture",         client: "Parties communes" },
    { day: 4, label: "SAV imprimante",          client: "Voodoo" },
  ]},
  { techId: 3, tasks: [
    { day: 1, label: "Mise aux normes incendie", client: "La Poste Enseigne" },
    { day: 2, label: "Sécurisation coffre",      client: "Louvre Banque Privée" },
    { day: 3, label: "Portail automatique",      client: "Logistique Urbaine" },
  ]},
];

const AFFAIRS = {
  voodoo: [
    { id: 1, ref: "VDO-187", title: "Réfection sols open space", stage: "validation", tech: 1, validator: "Telma", days: 3, urgent: true },
    { id: 2, ref: "VDO-186", title: "Remplacement éclairage LED",  stage: "travaux", tech: 2, days: 8 },
    { id: 3, ref: "VDO-185", title: "Audit électrique annuel",     stage: "diagnostic", tech: 3, days: 1 },
    { id: 4, ref: "VDO-184", title: "Climatisation salle B",       stage: "devis", tech: 1, days: 2 },
    { id: 5, ref: "VDO-183", title: "SAV imprimante 2e étage",     stage: "termine", tech: 2, days: 12 },
  ],
  laposte: [
    { id: 6, ref: "LPE-215", title: "Mise aux normes incendie",     stage: "validation", tech: 3, validator: "Philippe", days: 5, urgent: true },
    { id: 7, ref: "LPE-214", title: "Alarme zone livraison",        stage: "travaux", tech: 1, days: 4 },
    { id: 8, ref: "LPE-213", title: "Câblage RJ45 bureau",          stage: "valide", tech: 2, days: 1 },
    { id: 9, ref: "LPE-212", title: "Diagnostic chauffage",         stage: "diagnostic", tech: 3, days: 0 },
    { id: 10, ref: "LPE-211", title: "Maintenance climatisation",   stage: "devis", tech: 1, days: 6 },
    { id: 11, ref: "LPE-210", title: "Peinture couloir étage 3",    stage: "termine", tech: 2, days: 15 },
  ],
  logistique: [
    { id: 12, ref: "LOG-088", title: "Vidéosurveillance entrepôt",  stage: "validation", tech: 1, validator: "Telma", days: 2 },
    { id: 13, ref: "LOG-087", title: "Portail automatique",         stage: "travaux", tech: 3, days: 3 },
    { id: 14, ref: "LOG-086", title: "Diagnostic ventilation",      stage: "diagnostic", tech: 2, days: 1 },
    { id: 15, ref: "LOG-085", title: "Quais de chargement",         stage: "devis", tech: 1, days: 7 },
  ],
  louvre: [
    { id: 16, ref: "LBP-094", title: "Sécurisation salle coffre",   stage: "validation", tech: 3, validator: "Philippe", days: 4, urgent: true },
    { id: 17, ref: "LBP-093", title: "Climatisation accueil",       stage: "valide", tech: 2, days: 2 },
    { id: 18, ref: "LBP-092", title: "Audit système d'accès",       stage: "diagnostic", tech: 1, days: 0 },
    { id: 19, ref: "LBP-091", title: "Moquette bureau direction",   stage: "termine", tech: 3, days: 20 },
  ],
  communes: [
    { id: 20, ref: "PC-322", title: "Hall d'entrée — peinture",     stage: "travaux", tech: 2, days: 5 },
    { id: 21, ref: "PC-321", title: "Ascenseur — maintenance",      stage: "validation", tech: 1, validator: "Telma", days: 6 },
    { id: 22, ref: "PC-320", title: "Éclairage parking sous-sol",   stage: "devis", tech: 3, days: 4 },
    { id: 23, ref: "PC-319", title: "Nettoyage façade extérieure",  stage: "diagnostic", tech: 2, days: 2 },
    { id: 24, ref: "PC-318", title: "Boîtes aux lettres",           stage: "termine", tech: 1, days: 18 },
  ],
};

const SLIDES = [
  { id: "planning", type: "planning" },
  ...TENANTS.map(t => ({ id: t.id, type: "tenant", tenantId: t.id })),
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

function TenantSlide({ tenant }) {
  const affairs = AFFAIRS[tenant.id] || [];
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

function PlanningSlide() {
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
          return (
            <div key={day} style={{
              padding: "16px 10px",
              textAlign: "center",
              borderRadius: "12px 12px 0 0",
              backgroundColor: isToday ? "#1D4ED8" : "#E5E7EB",
              color: isToday ? "white" : "#6B7280",
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
        {PLANNING.map(({ techId, tasks }) => {
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

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [time, setTime] = useState(new Date());
  const [slideIdx, setSlideIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / SLIDE_DURATION) * 100));
    }, 100);
    const advance = setTimeout(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length);
    }, SLIDE_DURATION);
    return () => { clearInterval(tick); clearTimeout(advance); };
  }, [slideIdx]);

  const timeStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const currentSlide = SLIDES[slideIdx];
  const currentTenant = currentSlide.type === "tenant" ? TENANTS.find(t => t.id === currentSlide.tenantId) : null;
  const totalUrgent = Object.values(AFFAIRS).flat().filter(a => a.urgent).length;

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
        borderBottom: `4px solid ${currentTenant ? currentTenant.accent : "#1D4ED8"}`,
        transition: "border-color 0.5s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{
            width: 8, height: 56,
            backgroundColor: currentTenant ? currentTenant.accent : "#3B82F6",
            borderRadius: 4,
            transition: "background-color 0.5s ease",
          }} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>TABLEAU DE BORD</div>
            <div style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500, marginTop: 3 }}>
              Slide {slideIdx + 1} / {SLIDES.length} · rotation auto 30s
            </div>
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
          backgroundColor: currentTenant ? currentTenant.accent : "#3B82F6",
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
          const label = s.type === "planning" ? "ÉQUIPE" : tenant.name.toUpperCase();
          const accentColor = tenant ? tenant.accent : "#3B82F6";
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
        {currentSlide.type === "planning" && <PlanningSlide />}
        {currentSlide.type === "tenant" && <TenantSlide tenant={currentTenant} />}
      </div>
    </div>
  );
}
