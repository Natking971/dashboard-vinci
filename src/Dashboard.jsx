// BUILD 2026-08-25 - JASON GARE DE COMPIEGNE + RHAPSODY PLANNING 45S
// BUILD 2026-08-25 - RHAPSODY PLANNING 45 SECONDES
// BUILD FIX CHATEAUDUN 2026-08-20 - VERSION NOUVELLE
import { useState, useEffect, useRef } from "react";
import { getSiteConfig } from "./siteConfig";


// ─── CONFIGURATION ──────────────────────────────────────────────────────────

const SLIDE_DURATION = 30000;
const QUOTES_SLIDE_DURATION = 60000; // Plus long pour laisser défiler tous les devis
const PLANNING_SLIDE_DURATION = 45000; // Plus long quand le planning défile
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Configuration du site sélectionné via Vercel : VITE_SITE=lpdl ou chateaudun
const SITE = getSiteConfig();
const SHEET_URLS = SITE.sheets || {};

// Étapes pour la slide Devis (conservées pour compatibilité avec LPDL)
const QUOTE_STAGES = {
  chiffrage:   { label: "À chiffrer",       short: "EN COURS",  color: "#6B7280", bg: "#F3F4F6" },
  envoye:      { label: "Envoyé au client", short: "ENVOYÉ",    color: "#1D4ED8", bg: "#DBEAFE" },
  attente:     { label: "En attente client",short: "ATTENTE",   color: "#B45309", bg: "#FEF3C7" },
  valide:      { label: "Validé",           short: "VALIDÉ",    color: "#047857", bg: "#D1FAE5" },
  travaux:     { label: "Travaux planifiés",short: "PLANIFIÉ",  color: "#5B21B6", bg: "#EDE9FE" },
};

// Couleurs des techniciens. Les noms/IDs viennent de siteConfig.js.
const TECH_PALETTE = [
  { color: "#DC2626", light: "#FEE2E2", dot: "#EF4444" },
  { color: "#1D4ED8", light: "#DBEAFE", dot: "#3B82F6" },
  { color: "#047857", light: "#D1FAE5", dot: "#10B981" },
  { color: "#B45309", light: "#FEF3C7", dot: "#F59E0B" },
  { color: "#7C3AED", light: "#EDE9FE", dot: "#8B5CF6" },
];

function techColors(name, index) {
  const n = String(name || "").toLowerCase();
  // On conserve les couleurs historiques de LPDL.
  if (n === "jason" || n === "jayson") return { color: "#B45309", light: "#FEF3C7", dot: "#F59E0B" };
  if (n === "cédric" || n === "cedric") return { color: "#047857", light: "#D1FAE5", dot: "#10B981" };
  if (n === "ghulam") return { color: "#1D4ED8", light: "#DBEAFE", dot: "#3B82F6" };
  // 44 Châteaudun : Michael rouge, Kamal bleu.
  if (n === "michael") return { color: "#B91C1C", light: "#FEE2E2", dot: "#EF4444" };
  if (n === "kamal") return { color: "#1D4ED8", light: "#DBEAFE", dot: "#3B82F6" };
  return TECH_PALETTE[index % TECH_PALETTE.length];
}

const TECHNICIANS = (SITE.technicians || []).map((t, index) => ({
  ...t,
  ...techColors(t.name, index),
}));

function tenantIdFromName(name) {
  const n = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const known = {
    "parties communes": "communes",
    "communes": "communes",
    "voodoo": "voodoo",
    "la poste enseigne": "laposte",
    "laposte": "laposte",
    "logistique urbaine": "logistique",
    "logistique": "logistique",
    "louvre banque privee": "louvre",
    "louvre": "louvre",
    "iad": "iad",
    "paris match": "parismatch",
    "commerzbank": "commerzbank",
    "equativ": "equativ",
    "snowflake": "snowflake",
    "checkout": "checkout",
  };
  return known[n] || n.replace(/[^a-z0-9]+/g, "");
}

const TENANT_PALETTE = [
  { accent: "#475569", accentLight: "#F1F5F9" },
  { accent: "#7C3AED", accentLight: "#EDE9FE" },
  { accent: "#D97706", accentLight: "#FEF3C7" },
  { accent: "#059669", accentLight: "#D1FAE5" },
  { accent: "#7B2C3B", accentLight: "#FCE7F3" },
  { accent: "#0EA5E9", accentLight: "#E0F2FE" },
  { accent: "#DC2626", accentLight: "#FEE2E2" },
  { accent: "#0891B2", accentLight: "#CFFAFE" },
];

function tenantShort(name) {
  const special = {
    "Parties communes": "PC",
    "Voodoo": "VDO",
    "La Poste Enseigne": "LPE",
    "Logistique Urbaine": "LOG",
    "Louvre Banque Privée": "LBP",
    "IAD": "IAD",
    "Paris Match": "PM",
    "Commerzbank": "CB",
    "Equativ": "EQ",
    "Snowflake": "SF",
    "Checkout": "CO",
  };
  if (special[name]) return special[name];
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(x => x[0])
    .join("")
    .toUpperCase();
}

const TENANTS = (SITE.tenants || [])
  .filter(name => !(SITE.id === "lpdl" && name === "IAD"))
  .map((name, index) => {
    const base = TENANT_PALETTE[index % TENANT_PALETTE.length];
    return {
      id: tenantIdFromName(name),
      name,
      short: tenantShort(name),
      ...base,
    };
  });

const STAGES = {
  diagnostic: { label: "Diagnostic",          short: "DIAG",     color: "#6B7280", bg: "#F3F4F6", order: 1 },
  devis:      { label: "Devis en cours",      short: "DEVIS",    color: "#1D4ED8", bg: "#DBEAFE", order: 2 },
  validation: { label: "Attente validation",  short: "VALID",    color: "#B45309", bg: "#FEF3C7", order: 3 },
  valide:     { label: "Devis validé",        short: "VALIDÉ",   color: "#047857", bg: "#D1FAE5", order: 4 },
  travaux:    { label: "Travaux en cours",    short: "EN COURS", color: "#5B21B6", bg: "#EDE9FE", order: 5 },
  termine:    { label: "Terminé",             short: "FAIT",     color: "#374151", bg: "#E5E7EB", order: 6 },
};

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// Mapping des couleurs pour les événements / sous-traitants (cycle automatique)
const SUB_COLORS = [
  { color: "#1D4ED8", light: "#DBEAFE" },
  { color: "#0891B2", light: "#CFFAFE" },
  { color: "#B45309", light: "#FEF3C7" },
  { color: "#7C3AED", light: "#EDE9FE" },
  { color: "#DC2626", light: "#FEE2E2" },
  { color: "#059669", light: "#D1FAE5" },
];

// Mapping dynamique nom technicien → ID
const TECH_NAME_TO_ID = {};
TECHNICIANS.forEach(t => {
  const normalized = String(t.name || "").toLowerCase().trim();
  TECH_NAME_TO_ID[normalized] = t.id;
  if (normalized === "cédric") TECH_NAME_TO_ID["cedric"] = t.id;
  if (normalized === "jason") TECH_NAME_TO_ID["jayson"] = t.id;
});

// "Vinci" reste disponible dans les affaires LPDL si besoin.
if (SITE.id === "lpdl") TECH_NAME_TO_ID["vinci"] = 4;

// Liste des personnes utilisable dans les cartes Affaires
const ALL_PEOPLE = {};
TECHNICIANS.forEach(t => {
  ALL_PEOPLE[t.id] = { name: t.name, color: t.color, light: t.light };
});
if (SITE.id === "lpdl") {
  ALL_PEOPLE[4] = { name: "Vinci", color: "#DA291C", light: "#FEE2E2" };
}

// Mapping dynamique nom locataire → ID
const TENANT_NAME_TO_ID = {};
TENANTS.forEach(t => {
  TENANT_NAME_TO_ID[t.name.toLowerCase().trim()] = t.id;
  TENANT_NAME_TO_ID[
    t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  ] = t.id;
});
TENANT_NAME_TO_ID["communes"] = "communes";
TENANT_NAME_TO_ID["parties communes"] = "communes";

// Alias historiques LPDL
if (SITE.id === "lpdl") {
  Object.assign(TENANT_NAME_TO_ID, {
    "laposte": "laposte",
    "logistique": "logistique",
    "louvre": "louvre",
    "louvre banque privee": "louvre",
    "telmma": "communes",
    "thelma": "communes",
    "telma": "communes",
  });
}

// Devine automatiquement le locataire pour les éventuels devis LPDL.
function guessTenantForQuote(client, ref, title) {
  const clientLower = (client || "").toLowerCase().trim();
  const fullText = ((ref || "") + " " + (title || "")).toUpperCase();

  if (SITE.id === "lpdl" && (clientLower.includes("telm") || clientLower.includes("thelm"))) {
    if (fullText.includes("ELU")) return "logistique";
    return "communes";
  }

  if (TENANT_NAME_TO_ID[clientLower]) return TENANT_NAME_TO_ID[clientLower];

  const normalized = clientLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (TENANT_NAME_TO_ID[normalized]) return TENANT_NAME_TO_ID[normalized];

  return TENANTS[0]?.id || "communes";
}

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

function parseCSV(text, forceSep = null) {
  // Détection automatique du séparateur (virgule ou point-virgule)
  const sep = forceSep || (text.split("\n")[0]?.includes(";") ? ";" : ",");

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
    } else if (char === sep && !inQuotes) {
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

const FALLBACK_PLANNING = TECHNICIANS.map(t => ({
  techId: t.id,
  tasks: [{ day: 0, label: "—", client: "Aucune donnée" }],
}));
const FALLBACK_AFFAIRS = Object.fromEntries(TENANTS.map(t => [t.id, []]));
const FALLBACK_SUBCONTRACTORS = [];
const FALLBACK_QUOTES = [];
const FALLBACK_ONESITE = { pat: [], qhs: [] };

// SVG icons for golden rules (no emoji dependency)
const RuleIcon1 = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="2" width="6" height="28" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="5" y="2" width="6" height="28" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="5" y="8" width="22" height="3" rx="1.5" fill="white"/>
    <rect x="5" y="15" width="22" height="3" rx="1.5" fill="white"/>
    <rect x="5" y="22" width="22" height="3" rx="1.5" fill="white"/>
    <path d="M22 4 L28 10 L22 10 Z" fill="#FFD700"/>
    <circle cx="25" cy="6" r="3" fill="#FFD700" fillOpacity="0.7"/>
  </svg>
);
const RuleIcon2 = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="5" width="16" height="22" rx="3" fill="white" fillOpacity="0.9"/>
    <rect x="11" y="9" width="10" height="8" rx="1" fill="#1D4ED8"/>
    <circle cx="16" cy="22" r="2" fill="#1D4ED8"/>
    <line x1="4" y1="4" x2="28" y2="28" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);
const RuleIcon3 = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="7" r="4" fill="white" fillOpacity="0.9"/>
    <path d="M10 14 Q16 12 22 14 L20 26 H18 L16 20 L14 26 H12 Z" fill="white" fillOpacity="0.9"/>
    <path d="M6 18 L10 15" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M26 18 L22 15" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M4 22 L12 18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
  </svg>
);
const RuleIcon4 = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="12" cy="16" rx="7" ry="5" fill="white" fillOpacity="0.9"/>
    <ellipse cx="20" cy="16" rx="7" ry="5" fill="white" fillOpacity="0.9"/>
    <rect x="10" y="14" width="12" height="4" fill="white"/>
    <rect x="11" y="13" width="4" height="6" rx="1" fill="#1D4ED8"/>
    <rect x="17" y="13" width="4" height="6" rx="1" fill="#1D4ED8"/>
    <path d="M5 16 Q6 10 10 10" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <path d="M27 16 Q26 10 22 10" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
);
const RuleIcon5 = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 3 L10 17 H15 L14 29 L22 15 H17 Z" fill="#FFD700" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const GOLDEN_RULES = [
  { num: 1, Icon: RuleIcon1, text: "J'analyse obligatoirement les risques avant toute opération en hauteur" },
  { num: 2, Icon: RuleIcon2, text: "Je n'utilise pas le téléphone en me déplaçant" },
  { num: 3, Icon: RuleIcon3, text: "J'évite les déplacements précipités dans les zones techniques ou sur les terrasses et je respecte les chemins de circulation sécurisés" },
  { num: 4, Icon: RuleIcon4, text: "Je porte les EPI adaptés : gants résistants, lunettes, masques, vêtements spécifiques selon le produit" },
  { num: 5, Icon: RuleIcon5, text: "Je consigne systématiquement avant toute intervention électrique : mise hors tension, test d'absence de tension (VAT)" },
];

const SLIDES = [
  { id: "goldenRules", type: "goldenRules" },
  { id: "ehpg", type: "ehpg", label: "EHPG", image: "/ehpg-electrisation.png", alt: "EHPG — Électrisation lors d’un dépannage" },
  { id: "ehpg2", type: "ehpg", label: "EHPG 2", image: "/vat-regles-art.png", alt: "Faire une VAT dans les règles de l’art" },
  { id: "quote", type: "quote" },
  { id: "planning", type: "planning" },
  ...(SITE.id === "lpdl" ? [{ id: "regulatory", type: "regulatory", label: "Contrôle réglementaire" }] : []),
  ...TENANTS.map(t => ({ id: t.id, type: "tenant", tenantId: t.id })),
  { id: "subcontractorsCurrent", type: "subcontractors", week: "current" },
  { id: "subcontractorsNext", type: "subcontractors", week: "next" },
  { id: "planningNext", type: "planning", week: "next" },
  { id: "onesite", type: "onesite" },
  { id: "weather", type: "weather" },
  ...(["lpdl", "rhapsody"].includes(SITE.id) ? [{ id: "trajetPerso", type: "trajetPerso" }] : []),
  { id: "transport", type: "transport" },
];


// ─── MÉTÉO / TRANSPORT / CITATIONS ──────────────────────────────────────────

const WMO = {
  0: { fr: "Ciel dégagé" }, 1: { fr: "Principalement dégagé" },
  2: { fr: "Partiellement nuageux" }, 3: { fr: "Couvert" },
  45: { fr: "Brouillard" }, 48: { fr: "Brouillard givrant" },
  51: { fr: "Bruine légère" }, 53: { fr: "Bruine modérée" },
  55: { fr: "Bruine dense" }, 61: { fr: "Pluie légère" },
  63: { fr: "Pluie modérée" }, 65: { fr: "Pluie forte" },
  71: { fr: "Neige légère" }, 73: { fr: "Neige modérée" },
  75: { fr: "Neige forte" }, 80: { fr: "Averses légères" },
  81: { fr: "Averses modérées" }, 82: { fr: "Averses violentes" },
  95: { fr: "Orage" }, 96: { fr: "Orage avec grêle" },
  99: { fr: "Orage avec forte grêle" },
};
const DAYS_FR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

const METRO_CONFIG = [
  { code: "1",   color: "#F2A900", type: "M" }, { code: "2",   color: "#003CA6", type: "M" },
  { code: "3",   color: "#837902", type: "M" }, { code: "3B",  color: "#6EC4E8", type: "M" },
  { code: "4",   color: "#CF009E", type: "M" }, { code: "5",   color: "#FF7E2E", type: "M" },
  { code: "6",   color: "#6ECA97", type: "M" }, { code: "7",   color: "#FA9ABA", type: "M" },
  { code: "7B",  color: "#6ECA97", type: "M" }, { code: "8",   color: "#E19BDF", type: "M" },
  { code: "9",   color: "#B6BD00", type: "M" }, { code: "10",  color: "#C9910D", type: "M" },
  { code: "11",  color: "#704B1C", type: "M" }, { code: "12",  color: "#007852", type: "M" },
  { code: "13",  color: "#6EC4E8", type: "M" }, { code: "14",  color: "#62259D", type: "M" },
  { code: "A",   color: "#E2231A", type: "RER" }, { code: "B",  color: "#5190BF", type: "RER" },
  { code: "C",   color: "#FFCD00", type: "RER" }, { code: "D",  color: "#00814F", type: "RER" },
  { code: "E",   color: "#BD76A1", type: "RER" },
  { code: "H",  color: "#7B4F9E", type: "TER" }, { code: "J",  color: "#CC6600", type: "TER" },
  { code: "K",  color: "#6E6E00", type: "TER" }, { code: "L",  color: "#7B4F9E", type: "TER" },
  { code: "N",  color: "#009640", type: "TER" }, { code: "P",  color: "#F39200", type: "TER" },
  { code: "R",  color: "#E2001A", type: "TER" }, { code: "U",  color: "#CC0000", type: "TER" },
  { code: "V",  color: "#80C342", type: "TER" },
];

const FRENCH_QUOTES = [
  { text: "Le succès, c'est tomber sept fois et se relever huit.", author: "Proverbe japonais" },
  { text: "Seul on va plus vite, ensemble on va plus loin.", author: "Proverbe africain" },
  { text: "La qualité n'est jamais un accident. C'est toujours le résultat d'un effort intelligent.", author: "John Ruskin" },
  { text: "Ce n'est pas parce que les choses sont difficiles que nous n'osons pas. C'est parce que nous n'osons pas qu'elles sont difficiles.", author: "Sénèque" },
  { text: "Rien de grand ne s'est accompli dans le monde sans passion.", author: "Hegel" },
  { text: "Il faut viser la lune car même en cas d'échec, on atterrit dans les étoiles.", author: "Oscar Wilde" },
  { text: "Le génie, c'est 1% d'inspiration et 99% de transpiration.", author: "Thomas Edison" },
  { text: "Le succès n'est pas final, l'échec n'est pas fatal : c'est le courage de continuer qui compte.", author: "Winston Churchill" },
  { text: "Commencez par faire ce qui est nécessaire, puis ce qui est possible, et soudain vous ferez l'impossible.", author: "François d'Assise" },
  { text: "Le meilleur moment pour planter un arbre, c'était il y a 20 ans. Le deuxième meilleur moment, c'est maintenant.", author: "Proverbe chinois" },
  { text: "La réussite appartient à tout le monde. C'est au travail d'équipe qu'en revient le mérite.", author: "Franck Piccard" },
  { text: "Il n'y a pas de vent favorable pour celui qui ne sait pas où il va.", author: "Sénèque" },
  { text: "La simplicité est la sophistication suprême.", author: "Léonard de Vinci" },
  { text: "Un grand voyage commence par un seul pas.", author: "Lao-Tseu" },
  { text: "Soyez le changement que vous voulez voir dans le monde.", author: "Gandhi" },
  { text: "La persévérance, c'est ce qui rend l'impossible possible.", author: "Calvin Coolidge" },
  { text: "Si vous pensez que vous pouvez ou que vous ne pouvez pas, vous avez raison dans les deux cas.", author: "Henry Ford" },
  { text: "Choisissez un travail que vous aimez et vous n'aurez pas à travailler un seul jour de votre vie.", author: "Confucius" },
  { text: "L'union fait la force.", author: "Devise belge" },
  { text: "Chaque jour est une nouvelle opportunité de s'améliorer.", author: "Proverbe" },
  { text: "La différence entre l'impossible et le possible réside dans la détermination.", author: "Tommy Lasorda" },
  { text: "L'enthousiasme est à la base de tout progrès.", author: "Henry Ford" },
  { text: "Ne compte pas les jours, fais que les jours comptent.", author: "Muhammad Ali" },
  { text: "Ensemble nous réussissons mieux.", author: "Proverbe" },
  { text: "Le talent, c'est d'avoir envie de faire quelque chose.", author: "Anatole France" },
  { text: "L'imagination est plus importante que le savoir.", author: "Albert Einstein" },
  { text: "Votre temps est limité, ne le gâchez pas en vivant la vie de quelqu'un d'autre.", author: "Steve Jobs" },
  { text: "Le doute est l'origine de la sagesse.", author: "René Descartes" },
  { text: "Faites d'abord les choses difficiles. Les choses faciles s'arrangeront d'elles-mêmes.", author: "Dalai Lama" },
  { text: "Le travail éloigne de nous trois grands maux : l'ennui, le vice et le besoin.", author: "Voltaire" },
];

// ─── UTILITAIRES ────────────────────────────────────────────────────────────

// Répartition quotidienne des citations : 70 % équipe / 30 % Internet.
// Les citations de l'équipe deviennent disponibles 2 mois après leur date d'ajout.
function parseCitationDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Format français JJ/MM/AAAA
  const frMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (frMatch) {
    const [, day, month, year] = frMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Format ISO AAAA-MM-JJ
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDailySeed(date = new Date()) {
  return Number(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  );
}

function seededIndex(seed, length, salt = 0) {
  if (length <= 0) return 0;
  const value = Math.abs(Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453);
  return Math.floor((value - Math.floor(value)) * length);
}

function selectDailyQuote(teamQuotes, date = new Date()) {
  const seed = getDailySeed(date);

  // Valeur stable pour toute la journée : 0 à 99.
  const ratioValue = seededIndex(seed, 100, 1);
  const useTeamQuote = teamQuotes.length > 0 && ratioValue < 70;

  if (useTeamQuote) {
    return teamQuotes[seededIndex(seed, teamQuotes.length, 2)];
  }

  return FRENCH_QUOTES[seededIndex(seed, FRENCH_QUOTES.length, 3)];
}

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

// Lit une date provenant de Google Sheets.
// Formats acceptés : JJ/MM/AAAA, JJ-MM-AAAA, AAAA-MM-JJ
// et nombre de série Excel/Google Sheets.
function parseAffairDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Nombre de série Excel / Google Sheets
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    const serial = Number(raw.replace(",", "."));
    if (Number.isFinite(serial) && serial > 20000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const parsed = new Date(excelEpoch + Math.floor(serial) * 86400000);
      return new Date(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate()
      );
    }
  }

  // Format français : JJ/MM/AAAA ou JJ-MM-AAAA
  const frenchMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (frenchMatch) {
    let [, day, month, year] = frenchMatch;
    if (year.length === 2) year = `20${year}`;

    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );

    if (
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() === Number(month) - 1 &&
      parsed.getDate() === Number(day)
    ) {
      return parsed;
    }
  }

  // Format ISO : AAAA-MM-JJ
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );

    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;

  return new Date(
    fallback.getFullYear(),
    fallback.getMonth(),
    fallback.getDate()
  );
}

function getAffairDays(startDate) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    return null;
  }

  const today = new Date();

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const startUtc = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );

  return Math.floor((todayUtc - startUtc) / 86400000);
}

function getAffairAgeLabel(startDate) {
  const days = getAffairDays(startDate);

  if (days === null) return "Date absente";
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "J+1";
  if (days > 1) return `J+${days}`;
  if (days === -1) return "Demain";

  return `Dans ${Math.abs(days)} j`;
}

// ─── COMPOSANTS ─────────────────────────────────────────────────────────────

function AffairCard({ affair, index, total }) {
  const stage = STAGES[affair.stage];
  // Récupérer tous les techniciens (multi-tech)
  const techIds = affair.techIds && affair.techIds.length > 0 ? affair.techIds : [affair.tech];
  const techs = techIds
    .map(id => ALL_PEOPLE[id])
    .filter(Boolean);

  return (
    <div style={{
      backgroundColor: "white",
      border: affair.urgent ? "2px solid #FCA5A5" : "1px solid #E5E7EB",
      borderRadius: 14,
      padding: "20px 22px 18px 28px",
      display: "flex", flexDirection: "column", gap: 10,
      position: "relative",
      boxShadow: affair.urgent ? "0 4px 16px rgba(239,68,68,.15)" : "0 2px 6px rgba(0,0,0,.05)",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: 6, height: "100%",
        backgroundColor: affair.urgent ? "#EF4444" : stage.color,
      }} />

      {/* Numérotation en haut à droite */}
      {index !== undefined && total !== undefined && (
        <div style={{
          position: "absolute", top: 8, right: 12,
          fontSize: 10, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.05em",
          fontFamily: "'DM Mono', monospace",
        }}>
          {index + 1}/{total}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em" }}>
          {affair.ref}
          {affair.isQuote && affair.client && (
            <span style={{ marginLeft: 8, color: "#0E7490", fontSize: 11 }}>· {affair.client}</span>
          )}
        </span>
        {affair.urgent && (
          <span style={{ fontSize: 11, fontWeight: 800, color: "#EF4444", letterSpacing: "0.08em", marginRight: 36 }}>● URGENT</span>
        )}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", lineHeight: 1.3, minHeight: 44 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {techs.length === 0 ? (
            <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 600, fontStyle: "italic" }}>Non assigné</span>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center" }}>
                {techs.map((p, idx) => (
                  <div key={idx} style={{
                    width: 30, height: 30, borderRadius: "50%",
                    backgroundColor: p.light, color: p.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800,
                    marginLeft: idx === 0 ? 0 : -8,
                    border: "2px solid white",
                    zIndex: techs.length - idx,
                  }}>{p.name[0]}</div>
                ))}
              </div>
              <span style={{ fontSize: 13, color: "#374151", fontWeight: 700, marginLeft: 4 }}>
                {techs.map(p => p.name).join(" + ")}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {affair.validator && (
            <span style={{
              fontSize: 11, color: "#B45309", fontWeight: 700,
              backgroundColor: "#FEF3C7", padding: "3px 8px", borderRadius: 6,
            }}>→ {affair.validator}</span>
          )}
          <span
            title={
              affair.startDate
                ? `Date de départ : ${affair.startDate.toLocaleDateString("fr-FR")}`
                : "Aucune date renseignée"
            }
            style={{
              fontSize: 11,
              color: "#9CA3AF",
              fontWeight: 600,
            }}
          >
            {getAffairAgeLabel(affair.startDate)}
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

      {/* Affairs grid - 4 columns for 60" - avec scroll auto si beaucoup */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        maskImage: affairs.length > 8 ? "linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)" : "none",
        WebkitMaskImage: affairs.length > 8 ? "linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)" : "none",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          alignContent: "start",
          animation: affairs.length > 8 ? `scrollTenant ${affairs.length * 3}s linear infinite` : "none",
        }}>
          {sorted.map((affair, idx) => (
            <AffairCard key={affair.id} affair={affair} index={idx} total={sorted.length} />
          ))}

          {/* Espace de démarcation visible (4 colonnes vides) si beaucoup d'affaires */}
          {affairs.length > 8 && (
            <>
              <div style={{ gridColumn: "1 / -1", padding: "30px 0", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, height: 2, backgroundColor: "#D1D5DB", borderRadius: 1 }} />
                <div style={{
                  fontSize: 13, fontWeight: 800, color: "#9CA3AF",
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  padding: "8px 16px", backgroundColor: "#F3F4F6", borderRadius: 20,
                }}>
                  ↻ Reprise du défilement
                </div>
                <div style={{ flex: 1, height: 2, backgroundColor: "#D1D5DB", borderRadius: 1 }} />
              </div>

              {/* Duplication pour boucle infinie */}
              {sorted.map((affair, idx) => (
                <AffairCard key={`loop-${affair.id}`} affair={affair} index={idx} total={sorted.length} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanningSlide({ planning, week = "current" }) {
  const isNext = week === "next";
  // Pour la semaine prochaine, on calcule les dates de la semaine suivante
  const baseWeekDates = getWeekDates();
  const weekDates = isNext
    ? baseWeekDates.map(d => { const newD = new Date(d); newD.setDate(d.getDate() + 7); return newD; })
    : baseWeekDates;
  const todayIdx = isNext ? -1 : getTodayIndex(); // pas de "today" pour la semaine prochaine

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "32px 44px" }}>

      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isNext ? "#0E7490" : "#9CA3AF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            {isNext ? "À venir — Vue équipe" : "Vue équipe"}
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: "-1.5px", lineHeight: 1 }}>
            {isNext ? "Planning semaine prochaine" : "Planning techniciens"}
          </div>
          <div style={{ fontSize: 16, color: "#6B7280", marginTop: 10, fontWeight: 500 }}>
            Semaine du {fmt(weekDates[0])} au {fmt(weekDates[4])}
          </div>
        </div>
        {isNext && (
          <div style={{
            backgroundColor: "#CFFAFE",
            color: "#0E7490",
            padding: "12px 22px",
            borderRadius: 12,
            fontSize: 14, fontWeight: 800,
            letterSpacing: "0.08em",
            border: "2px dashed #0E7490",
          }}>
            🗓 SEMAINE À VENIR
          </div>
        )}
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
              fontWeight: 700, fontSize: 16,
            }}>
              <div>{day}</div>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.75, marginTop: 3 }}>{fmt(weekDates[i])}</div>
            </div>
          );
        })}
      </div>

      {/* Lignes techniciens - avec défilement automatique si déborde */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        maskImage: "linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          // Rhapsody : défilement automatique pour afficher les 6 techniciens sur la TV.
          // Les autres sites gardent le comportement existant.
          animation: ((SITE.id === "rhapsody" && planning.length > 3) || planning.reduce((sum, p) => sum + p.tasks.length, 0) > 12)
            ? `scrollPlanning ${SITE.id === "rhapsody" ? 22 : 40}s linear infinite`
            : "none",
        }}>
        {planning.map(({ techId, tasks }) => {
          const tech = TECHNICIANS.find(t => t.id === techId);
          return (
            <div key={techId} style={{
              display: "grid",
              gridTemplateColumns: "230px repeat(5, 1fr)",
              gap: 6,
              minHeight: 180,
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
                  width: 44, height: 44, borderRadius: "50%",
                  backgroundColor: tech.light, color: tech.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 800,
                }}>{tech.name[0]}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{tech.name}</div>
              </div>
              {DAY_NAMES.map((_, dayIdx) => {
                const dayTasks = tasks.filter(t => t.day === dayIdx);
                const isToday = dayIdx === todayIdx;
                const holiday = getHolidayForDate(weekDates[dayIdx]);
                if (holiday) {
                  return (
                    <div key={`dup-${dayIdx}`} style={{
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
                  <div key={`dup-${dayIdx}`} style={{
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

        {/* Duplication pour effet de boucle infinie - uniquement si on défile */}
        {(((SITE.id === "rhapsody" && planning.length > 3) || planning.reduce((sum, p) => sum + p.tasks.length, 0) > 12)) && planning.map(({ techId, tasks }) => {
          const tech = TECHNICIANS.find(t => t.id === techId);
          return (
            <div key={`loop-${techId}`} style={{
              display: "grid",
              gridTemplateColumns: "230px repeat(5, 1fr)",
              gap: 6,
              minHeight: 180,
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
                  width: 44, height: 44, borderRadius: "50%",
                  backgroundColor: tech.light, color: tech.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 800,
                }}>{tech.name[0]}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{tech.name}</div>
              </div>
              {DAY_NAMES.map((_, dayIdx) => {
                const dayTasks = tasks.filter(t => t.day === dayIdx);
                const isToday = dayIdx === todayIdx;
                const holiday = getHolidayForDate(weekDates[dayIdx]);
                if (holiday) {
                  return (
                    <div key={`loop-${dayIdx}`} style={{
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
                  <div key={`loop-${dayIdx}`} style={{
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
            color: "#9CA3AF", fontSize: 20, fontWeight: 500,
          }}>
            Aucun devis en cours actuellement
          </div>
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
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
                      fontSize: 16, fontWeight: 500, color: "#374151", lineHeight: 1.3,
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
                      <div style={{ fontSize: 16, color: "#111827", fontWeight: 700, marginTop: 3 }}>{quote.dateLabel}</div>
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
        }}>EV</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            Interventions externes
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: "-1.5px", lineHeight: 1 }}>
            Événements
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
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, letterSpacing: "0.08em" }}>ÉVÉNEMENTS</div>
        </div>
      </div>

      {/* Grille jours */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 10,
        flex: 1,
      }}>
        {DAY_NAMES.map((day, dayIdx) => {
          const daySubs = subcontractors.filter(s => s.day === dayIdx);
          const holiday = getHolidayForDate(weekDates[dayIdx]);
          return (
            <div key={day} style={{
              backgroundColor: holiday ? "#F3F4F6" : "white",
              border: holiday ? "1px solid #D1D5DB" : "1px solid #E5E7EB",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 2px 6px rgba(0,0,0,.05)",
              opacity: holiday ? 0.85 : 1,
            }}>
              {/* En-tête du jour */}
              <div style={{
                padding: "14px 12px",
                textAlign: "center",
                backgroundColor: holiday ? "#9CA3AF" : "#F9FAFB",
                borderBottom: "1px solid #E5E7EB",
                color: holiday ? "white" : "inherit",
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: holiday ? "white" : "#111827" }}>{day}</div>
                <div style={{ fontSize: 12, color: holiday ? "rgba(255,255,255,0.8)" : "#6B7280", marginTop: 3, fontWeight: 500 }}>{fmt(weekDates[dayIdx])}</div>
              </div>

              {/* Liste des sous-traitants du jour */}
              <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {holiday ? (
                  <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.12em" }}>FÉRIÉ</div>
                    <div style={{ fontSize: 12, color: "#6B7280", textAlign: "center", lineHeight: 1.3, padding: "0 8px" }}>
                      {holiday.name}
                    </div>
                  </div>
                ) : daySubs.length === 0 ? (
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

// ─── SLIDE ONESITE ───────────────────────────────────────────────────────────

const ONESITE_ACCENT = "#0EA5E9";
const ONESITE_TOTAL = 12; // objectif annuel

function PieChart({ done, total, color, size = 160, dark = false }) {
  const radius = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const pct = Math.min(done / total, 1);
  const angle = pct * 2 * Math.PI;
  // Arc SVG
  const x1 = cx + radius * Math.sin(0);
  const y1 = cy - radius * Math.cos(0);
  const x2 = cx + radius * Math.sin(angle);
  const y2 = cy - radius * Math.cos(angle);
  const largeArc = pct > 0.5 ? 1 : 0;
  const remaining = total - done;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Fond gris (non fait) */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#FEE2E2" strokeWidth={24} />
        {/* Arc vert (fait) */}
        {done > 0 && done < total && (
          <path
            d={`M ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={24}
            strokeLinecap="round"
          />
        )}
        {done >= total && (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={24} />
        )}
        {/* Texte centre */}
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize="32" fontWeight="800" fill={dark ? "white" : "#111827"}>{done}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="13" fontWeight="600" fill={dark ? "rgba(255,255,255,0.5)" : "#6B7280"}>/ {total}</text>
      </svg>
      {/* Légende */}
      <div style={{ display: "flex", gap: 16, fontSize: 12, fontWeight: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: color }} />
          <span style={{ color: dark ? "rgba(255,255,255,0.8)" : "#374151" }}>{done} réalisé{done > 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: dark ? "rgba(255,100,100,0.7)" : "#FCA5A5" }} />
          <span style={{ color: dark ? "rgba(255,255,255,0.5)" : "#6B7280" }}>{remaining} restant{remaining > 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

function AutoScrollList({ items, color, bgColor, borderColor }) {
  const ITEM_H = 62; // hauteur item + gap
  const VISIBLE = 3; // items visibles
  const needsScroll = items.length > VISIBLE;
  const doubled = needsScroll ? [...items, ...items] : items;
  const uid = color.replace(/[^a-z0-9]/gi, "");
  const duration = items.length * 2.5; // secondes

  return (
    <div style={{ flex: 1, overflow: "hidden", position: "relative", height: ITEM_H * VISIBLE }}>
      {needsScroll && (
        <style>{`
          @keyframes marquee_${uid} {
            0%   { transform: translateY(0px); }
            100% { transform: translateY(-${items.length * ITEM_H}px); }
          }
        `}</style>
      )}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        willChange: "transform",
        animation: needsScroll
          ? `marquee_${uid} ${duration}s linear infinite`
          : "none",
      }}>
        {doubled.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            backgroundColor: bgColor, borderRadius: 10,
            padding: "10px 14px", border: `1px solid ${borderColor}`,
            flexShrink: 0, minHeight: 54,
          }}>
            <div style={{
              minWidth: 22, height: 22, borderRadius: "50%",
              backgroundColor: color, color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800, flexShrink: 0,
            }}>{(i % items.length) + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "white", lineHeight: 1.3 }}>{item.titre}</div>
              {item.date && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{item.date}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OneSiteSlide({ onesite }) {
  const patDone = onesite.pat.length;
  const qhsDone = onesite.qhs.length;

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column", padding: "32px 44px",
      background: "linear-gradient(135deg, #0B1E3D 0%, #003C71 60%, #0B2E5E 100%)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Déco fond */}
      <div style={{
        position: "absolute", top: -80, right: -80, width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -60, left: -60, width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,160,145,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Titre */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexShrink: 0, position: "relative" }}>
        <div style={{
          backgroundColor: ONESITE_ACCENT, borderRadius: 14, padding: "10px 20px",
          fontSize: 13, fontWeight: 800, color: "white", letterSpacing: "0.16em",
        }}>ONESITE</div>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, color: "white", letterSpacing: "-1px", lineHeight: 1 }}>
            Suivi Sécurité Annuel
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 6, fontWeight: 500 }}>
            Objectif : {ONESITE_TOTAL} PAT · {ONESITE_TOTAL} quarts d'heure sécurité
          </div>
        </div>
      </div>

      {/* Contenu : 2 colonnes */}
      <div style={{ flex: 1, display: "flex", gap: 28, overflow: "hidden", position: "relative" }}>

        {/* Colonne PAT */}
        <div style={{
          flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)", padding: "24px 28px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 6, height: 38, borderRadius: 3, backgroundColor: "#10B981" }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "white" }}>Presque Accidents (PAT)</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{patDone} / {ONESITE_TOTAL} réalisés</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <PieChart done={patDone} total={ONESITE_TOTAL} color="#10B981" size={180} dark />
          </div>
          <AutoScrollList
            items={onesite.pat}
            color="#10B981"
            bgColor="rgba(16,185,129,0.15)"
            borderColor="rgba(16,185,129,0.35)"
          />
          {onesite.pat.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, paddingTop: 12 }}>Aucune PAT enregistrée</div>
          )}
        </div>

        {/* Colonne QHS */}
        <div style={{
          flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)", padding: "24px 28px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 6, height: 40, borderRadius: 3, backgroundColor: ONESITE_ACCENT }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "white" }}>Quarts d'heure Sécurité</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{qhsDone} / {ONESITE_TOTAL} réalisés</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <PieChart done={qhsDone} total={ONESITE_TOTAL} color={ONESITE_ACCENT} size={180} dark />
          </div>
          <AutoScrollList
            items={onesite.qhs}
            color={ONESITE_ACCENT}
            bgColor="rgba(14,165,233,0.15)"
            borderColor="rgba(14,165,233,0.35)"
          />
          {onesite.qhs.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, paddingTop: 12 }}>Aucun QHS enregistré</div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── SLIDE RÈGLES D'OR ───────────────────────────────────────────────────────


// ─── SLIDES EHPG + COMPTEUR AUTOMATIQUE ─────────────────────────────────────

const LAST_ACCIDENT_DATE = { year: 2025, month: 7, day: 23 };

function calculateDaysWithoutAccident() {
  const now = new Date();

  const todayUtc = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const accidentUtc = Date.UTC(
    LAST_ACCIDENT_DATE.year,
    LAST_ACCIDENT_DATE.month - 1,
    LAST_ACCIDENT_DATE.day
  );

  return Math.max(
    0,
    Math.floor((todayUtc - accidentUtc) / (1000 * 60 * 60 * 24))
  );
}

function EhpgSlide({ image, alt }) {
  const [daysWithoutAccident, setDaysWithoutAccident] = useState(
    calculateDaysWithoutAccident
  );

  useEffect(() => {
    const refreshCounter = () => {
      setDaysWithoutAccident(calculateDaysWithoutAccident());
    };

    refreshCounter();
    const timer = setInterval(refreshCounter, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#062B55",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <img
        src={image}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
        }}
      />

      <div style={{
        position: "absolute",
        right: "clamp(18px, 2.2vw, 42px)",
        bottom: "clamp(42px, 5vh, 72px)",
        minWidth: "clamp(190px, 14vw, 235px)",
        padding: "clamp(9px, 1vw, 13px) clamp(13px, 1.2vw, 18px)",
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(5,25,54,.96), rgba(8,54,94,.96))",
        border: "2px solid #10BFB2",
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        color: "white",
        textAlign: "center",
        backdropFilter: "blur(6px)",
        transform: "scale(0.9)",
        transformOrigin: "bottom right",
        zIndex: 5,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.16em",
          color: "#5EEAD4",
          marginBottom: 3,
        }}>
          GROUPE VINCI
        </div>

        <div style={{
          fontSize: "clamp(36px, 3.2vw, 48px)",
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: "'DM Mono', monospace",
          textShadow: "0 3px 12px rgba(0,0,0,.35)",
        }}>
          {daysWithoutAccident}
        </div>

        <div style={{
          fontSize: "clamp(10px, 0.9vw, 12px)",
          fontWeight: 800,
          letterSpacing: "0.09em",
          marginTop: 5,
        }}>
          JOURS SANS ACCIDENT
        </div>

        <div style={{
          fontSize: 10,
          color: "rgba(255,255,255,.65)",
          marginTop: 5,
        }}>
          Depuis le 23/07/2025
        </div>
      </div>
    </div>
  );
}

function GoldenRulesSlide() {
  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "32px 44px",
      background: "linear-gradient(135deg, #0B1E3D 0%, #003C71 60%, #0B2E5E 100%)",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -80, right: -80,
        width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,160,145,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -60, left: -60,
        width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(218,41,28,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32, flexShrink: 0 }}>
        <div style={{
          backgroundColor: "#00A091", borderRadius: 14, padding: "10px 20px",
          fontSize: 13, fontWeight: 800, color: "white", letterSpacing: "0.16em", textTransform: "uppercase",
        }}>Safety Excellence</div>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, color: "white", letterSpacing: "-1px", lineHeight: 1 }}>
            5 Règles d'Or <span style={{ color: "#00A091" }}>Sécurité</span>
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 6, fontWeight: 500 }}>
            Vinci Facilities POP · à respecter en toutes circonstances
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {GOLDEN_RULES.map((rule, idx) => (
          <div key={rule.num} style={{
            display: "flex", alignItems: "center", gap: 20,
            backgroundColor: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderLeft: `5px solid ${idx % 2 === 0 ? "#00A091" : "#3BB5E8"}`,
            borderRadius: "0 14px 14px 0",
            padding: "14px 20px 16px",
          }}>
            <div style={{
              minWidth: 52, height: 52, borderRadius: "50%",
              backgroundColor: idx % 2 === 0 ? "#00A091" : "#1D4ED8",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 900, color: "white", flexShrink: 0,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}>{rule.num}</div>
            <div style={{ width: 32, height: 32, flexShrink: 0 }}><rule.Icon /></div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.35, flex: 1 }}>
              {rule.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SLIDE MÉTÉO ─────────────────────────────────────────────────────────────
function getWeatherPhrase(code, hour) {
  const n = Number(code);
  if ([95,96,99].includes(n)) return "Restez à l'abri, orages prévus ⚡";
  if ([71,73,75,77,85,86].includes(n)) return "Attention à la neige sur les routes";
  if ([61,63,65,80,81,82].includes(n)) return "Prenez un parapluie en sortant";
  if ([51,53,55].includes(n)) return "Légère bruine, vêtement imperméable conseillé";
  if ([45,48].includes(n)) return "Brouillard ce matin, prudence sur la route";
  if (n <= 1) {
    if (hour < 10) return "Belle matinée ensoleillée, bonne journée !";
    if (hour < 18) return "Grand soleil aujourd'hui, pensez à vous hydrater";
    return "Soirée dégagée et agréable";
  }
  if (n === 2) return "Quelques nuages mais pas de pluie prévue";
  if (n === 3) return "Ciel couvert, mais le temps reste sec";
  return "Conditions météo acceptables aujourd'hui";
}

function getTimeGradient(hour) {
  if (hour >= 5 && hour < 8)   return "linear-gradient(160deg, #1a1035 0%, #3d2060 30%, #c2410c 70%, #f97316 100%)";
  if (hour >= 8 && hour < 12)  return "linear-gradient(160deg, #0c2a5e 0%, #1e40af 40%, #3b82f6 80%, #93c5fd 100%)";
  if (hour >= 12 && hour < 17) return "linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)";
  if (hour >= 17 && hour < 20) return "linear-gradient(160deg, #1e1b4b 0%, #7c3aed 30%, #dc2626 60%, #f97316 100%)";
  if (hour >= 20 && hour < 22) return "linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 40%, #4c1d95 100%)";
  return "linear-gradient(160deg, #050510 0%, #0f0a2e 50%, #1e1b4b 100%)";
}

function UVBadge({ uv }) {
  if (uv == null) return null;
  const level = uv <= 2 ? { label: "Faible", color: "#4ADE80" }
              : uv <= 5 ? { label: "Modéré", color: "#FACC15" }
              : uv <= 7 ? { label: "Élevé", color: "#F97316" }
              : uv <= 10 ? { label: "Très élevé", color: "#EF4444" }
              : { label: "Extrême", color: "#A855F7" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: level.color }}/>
      <span style={{ color: level.color, fontWeight: 700 }}>UV {Math.round(uv)} — {level.label}</span>
    </div>
  );
}

function getWeatherEmoji(code, isDay = true) {
  const n = Number(code);

  if ([95, 96, 99].includes(n)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(n)) return "❄️";
  if ([61, 63, 65, 80, 81, 82].includes(n)) return "🌧️";
  if ([51, 53, 55].includes(n)) return "🌦️";
  if ([45, 48].includes(n)) return "🌫️";
  if (n === 3) return "☁️";
  if (n === 2) return isDay ? "⛅" : "☁️";
  if (n <= 1) return isDay ? "☀️" : "🌙";

  return "🌤️";
}

function WeatherSlide({ weather }) {
  const now = new Date();
  const hour = now.getHours();

  if (!weather) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: getTimeGradient(hour),
          color: "white",
          fontSize: 20,
        }}
      >
        Chargement météo…
      </div>
    );
  }

  const { current, daily, hourly } = weather;
  const wmo = WMO[current.weather_code] || { fr: "—" };
  const phrase = getWeatherPhrase(current.weather_code, hour);

  const sunrise = daily.sunrise?.[0]
    ? new Date(daily.sunrise[0]).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const sunset = daily.sunset?.[0]
    ? new Date(daily.sunset[0]).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const uvToday = daily.uv_index_max?.[0];
  const maxToday = daily.temperature_2m_max?.[0];
  const minToday = daily.temperature_2m_min?.[0];
  const bg = getTimeGradient(hour);

  // On prend les 4 prochaines échéances espacées d'environ 3 heures.
  const hourlyTimes = Array.isArray(hourly?.time) ? hourly.time : [];
  const nextHourIndex = hourlyTimes.findIndex(
    (value) => new Date(value).getTime() >= now.getTime()
  );

  const baseIndex = nextHourIndex >= 0 ? nextHourIndex : 0;
  const hourlyIndexes = [0, 3, 6, 9]
    .map((offset) => baseIndex + offset)
    .filter((index) => index < hourlyTimes.length);

  return (
    <div
      style={{
        height: "100%",
        background: bg,
        color: "white",
        display: "flex",
        flexDirection: "column",
        padding: "20px 32px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.9)",
          }}
        >
          METEO
        </span>
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 18,
          }}
        >
          · Paris
        </span>

        <div style={{ marginLeft: "auto" }}>
          <UVBadge uv={uvToday} />
        </div>
      </div>

      {/* Météo actuelle + prévisions horaires */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(400px, 0.9fr) minmax(620px, 1.45fr)",
          gap: 22,
          alignItems: "stretch",
          marginBottom: 12,
        }}
      >
        {/* Température actuelle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 78, flexShrink: 0 }}>
            {getWeatherEmoji(current.weather_code, current.is_day !== 0)}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 82,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: "-2px",
              }}
            >
              {Math.round(current.temperature_2m)}°C
            </div>

            <div
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.65)",
                marginTop: 5,
              }}
            >
              Ressenti {Math.round(current.apparent_temperature)}°C
            </div>

            <div
              style={{
                fontSize: 23,
                fontWeight: 700,
                marginTop: 3,
              }}
            >
              {wmo.fr}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 9,
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              <span style={{ color: "#FCA5A5" }}>
                Max {maxToday != null ? Math.round(maxToday) : "—"}°C
              </span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.45)",
                }}
              />
              <span style={{ color: "#BFDBFE" }}>
                Min {minToday != null ? Math.round(minToday) : "—"}°C
              </span>
            </div>
          </div>
        </div>

        {/* Prévisions des prochaines heures */}
        <div
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 16,
            padding: "12px 15px 14px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.11em",
              color: "rgba(255,255,255,0.76)",
              marginBottom: 9,
            }}
          >
            HEURES À VENIR
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(hourlyIndexes.length, 1)}, 1fr)`,
              gap: 9,
            }}
          >
            {hourlyIndexes.map((index) => {
              const forecastDate = new Date(hourly.time[index]);
              const forecastCode = hourly.weather_code?.[index];
              const forecastTemp = hourly.temperature_2m?.[index];
              const forecastRain =
                hourly.precipitation_probability?.[index];
              const forecastWind = hourly.wind_speed_10m?.[index];
              const isDay = hourly.is_day?.[index] !== 0;

              return (
                <div
                  key={`${hourly.time[index]}-${index}`}
                  style={{
                    minWidth: 0,
                    background: "rgba(8,37,105,0.28)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: "9px 7px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "rgba(255,255,255,0.86)",
                    }}
                  >
                    {forecastDate.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  <div style={{ fontSize: 31, lineHeight: 1.15 }}>
                    {getWeatherEmoji(forecastCode, isDay)}
                  </div>

                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                    }}
                  >
                    {forecastTemp != null
                      ? Math.round(forecastTemp)
                      : "—"}
                    °
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      justifyContent: "center",
                      flexWrap: "wrap",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.62)",
                    }}
                  >
                    {forecastRain != null && (
                      <span>Pluie {Math.round(forecastRain)}%</span>
                    )}
                    {forecastWind != null && (
                      <span>Vent {Math.round(forecastWind)} km/h</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Phrase du jour */}
      <div
        style={{
          background: "rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: "9px 16px",
          marginBottom: 12,
          fontSize: 16,
          fontStyle: "italic",
          color: "rgba(255,255,255,0.9)",
          borderLeft: "3px solid rgba(255,255,255,0.4)",
        }}
      >
        {phrase}
      </div>

      {/* Détails */}
      <div
        style={{
          display: "flex",
          gap: 28,
          marginBottom: 14,
          fontSize: 15,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        <span>Hum. {current.relative_humidity_2m}%</span>
        <span>Vent {Math.round(current.wind_speed_10m)} km/h</span>
        <span>Lever {sunrise}</span>
        <span>Coucher {sunset}</span>
      </div>

      {/* Prévisions 3 jours */}
      <div style={{ display: "flex", gap: 10, flex: 1 }}>
        {(daily.time || []).slice(1, 4).map((date, i) => {
          const d = new Date(date);
          const code = daily.weather_code[i + 1];
          const dWmo = WMO[code] || { fr: "" };
          const wind = daily.wind_speed_10m_max?.[i + 1];
          const rain = daily.precipitation_probability_max?.[i + 1];
          const uv = daily.uv_index_max?.[i + 1];

          return (
            <div
              key={i}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(4px)",
                borderRadius: 16,
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: 700,
                }}
              >
                {DAYS_FR[d.getDay()]}
              </div>

              <div style={{ fontSize: 43 }}>
                {getWeatherEmoji(code, true)}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.65)",
                  textAlign: "center",
                }}
              >
                {dWmo.fr}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 21,
                  fontWeight: 800,
                }}
              >
                <span style={{ color: "#FCA5A5" }}>
                  {Math.round(daily.temperature_2m_max[i + 1])}°
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>
                  {Math.round(daily.temperature_2m_min[i + 1])}°
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.6)",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {rain != null && (
                  <span
                    style={{
                      color:
                        rain > 50
                          ? "#60A5FA"
                          : "rgba(255,255,255,0.55)",
                    }}
                  >
                    Pluie {rain}%
                  </span>
                )}
                {wind != null && (
                  <span>Vent {Math.round(wind)} km/h</span>
                )}
                {uv != null && (
                  <span
                    style={{
                      color:
                        uv > 5
                          ? "#FACC15"
                          : "rgba(255,255,255,0.55)",
                    }}
                  >
                    UV {Math.round(uv)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── SLIDE CITATION ──────────────────────────────────────────────────────────
function QuoteSlide({ quote }) {
  return (
    <div style={{ height: "100%", background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 60%, #0F3460 100%)", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 80px" }}>
      <div style={{ fontSize: 13, letterSpacing: "0.25em", color: "#90CAF9", marginBottom: 32, fontWeight: 700 }}>✦ CITATION DU JOUR ✦</div>
      <div style={{ fontSize: 100, color: "rgba(144,202,249,0.15)", lineHeight: 0.6, alignSelf: "flex-start", fontFamily: "Georgia, serif" }}>"</div>
      <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.6, textAlign: "center", fontStyle: "italic", maxWidth: 780, margin: "0 auto" }}>
        {quote?.text || "…"}
      </div>
      <div style={{ fontSize: 100, color: "rgba(144,202,249,0.15)", lineHeight: 0.6, alignSelf: "flex-end", fontFamily: "Georgia, serif" }}>"</div>
      <div style={{ marginTop: 32, fontSize: 20, color: "#90CAF9", fontWeight: 600 }}>— {quote?.author || ""}</div>
    </div>
  );
}

// ─── SLIDE TRANSPORT ─────────────────────────────────────────────────────────
function TransportSlide({ lines, lastUpdate }) {
  const grouped = { M: [], RER: [], TER: [] };

  // Détermine l'état d'une ligne :
  // - rouge = perturbation
  // - jaune = travaux
  // - vert = trafic normal
  // Lorsqu'une ligne a des travaux ET une perturbation, le rouge est prioritaire.
  function getTransportStatus(disruptions = []) {
    if (!Array.isArray(disruptions) || disruptions.length === 0) {
      return {
        status: "normal",
        label: "Normal",
        message: "",
      };
    }

    const normalized = disruptions.map(item => {
      const severity = String(item?.severity || "").toLowerCase();
      const message = String(item?.message || "").toLowerCase();
      const title = String(item?.title || item?.cause || "").toLowerCase();
      const fullText = `${severity} ${title} ${message}`;

      const isWorks =
        fullText.includes("travaux") ||
        fullText.includes("maintenance") ||
        fullText.includes("chantier") ||
        fullText.includes("modernisation") ||
        fullText.includes("renouvellement") ||
        fullText.includes("fermeture programmée") ||
        fullText.includes("fermeture programmee") ||
        fullText.includes("interruption programmée") ||
        fullText.includes("interruption programmee");

      const isPerturbation =
        fullText.includes("perturb") ||
        fullText.includes("incident") ||
        fullText.includes("retard") ||
        fullText.includes("ralenti") ||
        fullText.includes("interrompu") ||
        fullText.includes("interruption") ||
        fullText.includes("accident") ||
        fullText.includes("panne") ||
        fullText.includes("malaise") ||
        fullText.includes("signalisation") ||
        fullText.includes("bagage") ||
        fullText.includes("voyageur") ||
        fullText.includes("trafic") ||
        fullText.includes("manifestation") ||
        fullText.includes("grève") ||
        fullText.includes("greve");

      return {
        ...item,
        isWorks,
        isPerturbation: isPerturbation && !isWorks,
      };
    });

    // Priorité absolue au rouge.
    const perturbation = normalized.find(item => item.isPerturbation);
    if (perturbation) {
      return {
        status: "perturbation",
        label: perturbation.severity || "Perturbation",
        message: perturbation.message || "",
      };
    }

    const works = normalized.find(item => item.isWorks);
    if (works) {
      return {
        status: "works",
        label: "Travaux",
        message: works.message || "",
      };
    }

    // Si l'API signale une anomalie non reconnue, on la traite en rouge.
    const first = normalized[0];
    return {
      status: "perturbation",
      label: first?.severity || "Perturbation",
      message: first?.message || "",
    };
  }

  METRO_CONFIG.forEach(cfg => {
    const data = (lines || []).find(l => l.code === cfg.code);
    const transportStatus = getTransportStatus(data?.disruptions || []);

    const lineData = {
      ...cfg,
      ...transportStatus,
    };

    if (cfg.type === "M") grouped.M.push(lineData);
    else if (cfg.type === "RER") grouped.RER.push(lineData);
    else grouped.TER.push(lineData);
  });

  const LineCard = ({ code, color, status, label, message }) => {
    const isPerturbation = status === "perturbation";
    const isWorks = status === "works";

    const cardBackground = isPerturbation
      ? "rgba(239,83,80,0.18)"
      : isWorks
      ? "rgba(245,158,11,0.18)"
      : "rgba(255,255,255,0.05)";

    const cardBorder = isPerturbation
      ? "#EF5350"
      : isWorks
      ? "#F59E0B"
      : "rgba(255,255,255,0.10)";

    const statusColor = isPerturbation
      ? "#F87171"
      : isWorks
      ? "#FBBF24"
      : "#4ADE80";

    return (
      <div style={{
        background: cardBackground,
        border: `1.5px solid ${cardBorder}`,
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        minHeight: 52,
        boxShadow: isPerturbation
          ? "0 0 0 1px rgba(239,83,80,0.10)"
          : isWorks
          ? "0 0 0 1px rgba(245,158,11,0.10)"
          : "none",
      }}>
        <div style={{
          width: 36, height: 36, flexShrink: 0,
          borderRadius: "50%",
          background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: code.length > 2 ? 10 : 13,
          color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}>{code}</div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 12,
            color: statusColor,
            fontWeight: 800,
            marginBottom: 2,
          }}>
            {status === "normal" ? "Normal" : label}
          </div>

          {status !== "normal" && message && (
            <div style={{
              fontSize: 11,
              color: "#D1D5DB",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  };

  const updStr = lastUpdate ? new Date(lastUpdate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;

  const Section = ({ label, items, cols }) => (
    <div style={{ marginBottom: 10, flexShrink: 0 }}>
      <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, letterSpacing: "0.14em", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
        {items.map(l => <LineCard key={l.code} {...l} />)}
      </div>
    </div>
  );

  const allSections = (
    <div>
      <Section label="METRO" items={grouped.M} cols={4}/>
      <Section label="RER" items={grouped.RER} cols={5}/>
      <Section label="TRANSILIEN" items={grouped.TER} cols={5}/>
    </div>
  );

  return (
    <div style={{ height: "100%", background: "linear-gradient(135deg, #111827 0%, #1F2937 100%)", color: "white", display: "flex", flexDirection: "column", padding: "18px 28px", overflow: "hidden", position: "relative" }}>

      {/* Fond carte Île-de-France */}
      <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.12, pointerEvents: "none" }} viewBox="0 0 680 400" preserveAspectRatio="xMidYMid slice">
        <path d="M200,60 L240,45 L290,50 L340,38 L400,55 L445,48 L480,70 L495,110 L510,150 L500,190 L490,230 L470,260 L450,290 L420,315 L390,330 L360,340 L320,345 L280,340 L250,325 L220,305 L195,280 L175,250 L165,215 L160,180 L165,145 L175,110 L185,80 Z" fill="#1E40AF" stroke="#3B82F6" strokeWidth="1.5"/>
        <line x1="160" y1="195" x2="505" y2="195" stroke="#E2231A" strokeWidth="3"/>
        <line x1="335" y1="40" x2="335" y2="345" stroke="#5190BF" strokeWidth="3"/>
        <path d="M175,290 Q280,230 390,150" stroke="#FFCD00" strokeWidth="2" fill="none"/>
        <path d="M310,40 Q340,195 360,345" stroke="#00814F" strokeWidth="2" fill="none"/>
        <line x1="195" y1="165" x2="460" y2="165" stroke="#F2A900" strokeWidth="1.5"/>
        <line x1="200" y1="220" x2="470" y2="220" stroke="#003CA6" strokeWidth="1.5"/>
        <path d="M220,140 Q335,160 450,140" stroke="#CF009E" strokeWidth="1.5" fill="none"/>
        <path d="M210,250 Q335,235 460,250" stroke="#FF7E2E" strokeWidth="1.5" fill="none"/>
        <circle cx="335" cy="195" r="6" fill="white"/>
        <circle cx="280" cy="195" r="3.5" fill="white"/>
        <circle cx="390" cy="195" r="3.5" fill="white"/>
        <circle cx="335" cy="165" r="3.5" fill="white"/>
        <circle cx="335" cy="220" r="3.5" fill="white"/>
        <circle cx="250" cy="165" r="3" fill="white" opacity="0.7"/>
        <circle cx="420" cy="220" r="3" fill="white" opacity="0.7"/>
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.05em" }}>TRANSPORTS</span>
        <span style={{ color: "#6B7280", fontSize: 14 }}>· Ile-de-France</span>
        {updStr && <span style={{ marginLeft: "auto", fontSize: 11, color: "#4B5563" }}>Mis a jour {updStr}</span>}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {allSections}
      </div>
      {(!lines || lines.length === 0) && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4B5563", fontSize: 14 }}>
          Donnees indisponibles — verifiez la cle API IDFM dans Vercel
        </div>
      )}
    </div>
  );
}



// ─── SLIDE TRAJETS PERSONNELS ────────────────────────────────────────────────

// Temps de trajet habituels servant de référence pour calculer le retard.
const TRAJET_HABITUEL = SITE.id === "rhapsody"
  ? {
      nicodeme: 60,
      alvaro: 35,
      camara: 20,
      bazil: 55,
      bongo: 35,
      picart: 45,
      royer: 60,
    }
  : {
      ghulam: 40,
      nathan: 24,
      michael: 12,
      jason: 36,
      cedric: 81, // Gare de Longueville : référence 1 h 21 min selon l’itinéraire fourni
      liazide: 41,
      rachid: 41,
      toufik: 41,
    };

const TRAJETS_CONFIG = SITE.id === "rhapsody"
  ? [
      { key: "nicodeme", nom: "Avril Nicodeme", dest: "Bornel" },
      { key: "alvaro", nom: "Alvaro Martinez", dest: "Ermont" },
      { key: "camara", nom: "Mamadou Camara", dest: "Clichy" },
      { key: "bazil", nom: "Jean Yvener Bazil", dest: "Longperrier" },
      { key: "bongo", nom: "Preston Bongo", dest: "Montmorency" },
      { key: "picart", nom: "Yoann Picart", dest: "Viroflay" },
      { key: "royer", nom: "Geoffroy Royer", dest: "Fublaines" },
    ]
  : [
      { key: "ghulam", nom: "Ghulam", dest: "Lagny" },
      { key: "nathan", nom: "Nathan", dest: "Jean Moulin" },
      { key: "michael", nom: "Michael", dest: "Nanterre" },
      { key: "jason", nom: "Jason", dest: "Gare de Compiègne" },
      { key: "cedric", nom: "Cedric", dest: "Gare de Longueville" },
      { key: "liazide", nom: "Liazide", dest: "Pierrelaye" },
      { key: "rachid", nom: "Rachid", dest: "Poissy" },
      { key: "toufik", nom: "Toufik", dest: "Poissy" },
    ];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex) {
  const cleanHex = hex.replace("#", "");

  return {
    r: parseInt(cleanHex.slice(0, 2), 16),
    g: parseInt(cleanHex.slice(2, 4), 16),
    b: parseInt(cleanHex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = value =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColors(startColor, endColor, ratio) {
  const start = hexToRgb(startColor);
  const end = hexToRgb(endColor);
  const safeRatio = clamp(ratio, 0, 1);

  return rgbToHex({
    r: start.r + (end.r - start.r) * safeRatio,
    g: start.g + (end.g - start.g) * safeRatio,
    b: start.b + (end.b - start.b) * safeRatio,
  });
}

/*
 * Dégradé selon l'écart par rapport au trajet habituel :
 * - jusqu'à +4 min : vert
 * - de +5 à +14 min : dégradé vert → orange
 * - à partir de +15 min : dégradé orange → rouge
 */
function getTrajetStatus(temps, habituel) {
  if (!Number.isFinite(temps)) {
    return {
      color: "#64748B",
      delta: null,
      label: "Indisponible",
    };
  }

  const delta = Math.round(temps - habituel);

  if (delta <= 0) {
    return {
      color: "#22C55E",
      delta,
      label: delta === 0 ? "Habituel" : `${delta} min`,
    };
  }

  if (delta <= 4) {
    return {
      color: "#22C55E",
      delta,
      label: `+${delta} min`,
    };
  }

  if (delta <= 14) {
    return {
      color: mixColors("#22C55E", "#F59E0B", (delta - 4) / 10),
      delta,
      label: `+${delta} min`,
    };
  }

  return {
    color: mixColors("#F59E0B", "#EF4444", (delta - 14) / 16),
    delta,
    label: `+${delta} min`,
  };
}

function formatTrajetDuration(minutes) {
  if (!Number.isFinite(minutes)) return "—";

  const total = Math.max(0, Math.round(minutes));

  if (total < 60) {
    return `${total} min`;
  }

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  return mins === 0
    ? `${hours} h`
    : `${hours} h ${mins} min`;
}

function TrajetPersoSlide({ trajetTimes }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const maxDisplayedMinutes = 120;

  return (
    <div
      style={{
        height: "100%",
        background: "linear-gradient(135deg, #0f2027, #2c5364)",
        color: "white",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: "bold",
          marginBottom: 10,
        }}
      >
        TRAJETS
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
          gap: 10,
          overflow: "hidden",
        }}
      >
        {TRAJETS_CONFIG.map((personne, index) => {
          const tempsBrut = trajetTimes?.[personne.key];
          const temps =
            tempsBrut !== null &&
            tempsBrut !== undefined &&
            tempsBrut !== "" &&
            Number.isFinite(Number(tempsBrut))
              ? Number(tempsBrut)
              : null;

          const habituel = TRAJET_HABITUEL[personne.key];
          const status = getTrajetStatus(temps, habituel);
          const progress =
            temps === null
              ? 0
              : clamp(temps / maxDisplayedMinutes, 0, 1);

          const dashLength = progress * circumference;

          return (
            <div
              key={personne.key}
              style={{
                textAlign: "center",
                padding: 12,
                background: "rgba(0, 0, 0, 0.2)",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 0,
                boxSizing: "border-box",

                // Rhapsody : 7 cartes = 4 en haut + 3 centrées en bas.
                gridColumn:
                  SITE.id === "rhapsody" &&
                  TRAJETS_CONFIG.length === 7 &&
                  index === 4
                    ? "2"
                    : undefined,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 150,
                  height: 150,
                  margin: "0 auto 8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  viewBox="0 0 120 120"
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: "rotate(-90deg)",
                  }}
                  aria-hidden="true"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="8"
                  />

                  {temps !== null && (
                    <circle
                      cx="60"
                      cy="60"
                      r={radius}
                      fill="none"
                      stroke={status.color}
                      strokeWidth="8"
                      strokeDasharray={`${dashLength} ${circumference}`}
                      strokeLinecap="round"
                      style={{
                        transition:
                          "stroke 0.5s ease, stroke-dasharray 0.5s ease",
                      }}
                    />
                  )}
                </svg>

                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      minHeight: 17,
                      marginBottom: 1,
                      fontSize: 11,
                      lineHeight: 1.1,
                      fontWeight: 800,
                      color: status.color,
                    }}
                  >
                    {temps === null ? "Indisponible" : status.label}
                  </div>

                  <div
                    style={{
                      fontSize: 28,
                      lineHeight: 1,
                      fontWeight: "bold",
                      color: status.color,
                    }}
                  >
                    {formatTrajetDuration(temps)}
                  </div>

                  
                </div>
              </div>

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {personne.nom}
              </div>

              <div
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                  marginTop: 4,
                  lineHeight: 1.2,
                }}
              >
                {personne.dest}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function normalizeRegulatoryKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function regulatoryField(row, ...aliases) {
  const normalizedAliases = aliases.map(normalizeRegulatoryKey);
  for (const [key, value] of Object.entries(row || {})) {
    if (normalizedAliases.includes(normalizeRegulatoryKey(key))) return String(value || "").trim();
  }
  // Repli sur une correspondance partielle pour les exports BV Link qui ajoutent des précisions aux intitulés.
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeRegulatoryKey(key);
    if (normalizedAliases.some(alias => alias && normalizedKey.includes(alias))) return String(value || "").trim();
  }
  return "";
}

function parseRegulatoryDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (fr) {
    const year = fr[3].length === 2 ? Number(`20${fr[3]}`) : Number(fr[3]);
    const date = new Date(year, Number(fr[2]) - 1, Number(fr[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    const serial = Number(raw.replace(",", "."));
    if (serial > 20000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function RegulatorySlide({ rows }) {
  const tableScrollRef = useRef(null);
  const [yearFilter, setYearFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [criticalityFilter, setCriticalityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Les corrections manuelles sont conservées sur l'écran qui affiche le dashboard.
  const [manualCategories, setManualCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lpdl-regulatory-manual-categories") || "{}"); }
    catch { return {}; }
  });

  const classifyRegulatoryCategory = (raw) => {
    // Analyse uniquement Équipement/Sujet, Détails et Commentaire.
    const commentText = normalizeRegulatoryKey(regulatoryField(raw, "commentaire", "commentaires"));
    const description = normalizeRegulatoryKey([
      regulatoryField(raw, "équipement / sujet", "equipement / sujet", "équipement", "equipement"),
      regulatoryField(raw, "sujet", "titre"),
      regulatoryField(raw, "détails", "details", "observation", "constat"),
      regulatoryField(raw, "commentaire", "commentaires"),
    ].filter(Boolean).join(" "));
    const privateKeywords = ["commerce", "boutique", "locataire", "people baby", "local commercial", "espace de vente", "restaurant", "local privatif", "privatif", "hotel"];
    // Une mention explicite dans le commentaire prime sur les indices communs.
    if (commentText.includes("privatif") || commentText.includes("hotel")) return "Parties privatives";
    const commonKeywords = ["hall", "circulation", "parking", "ascenseur", "cta", "gtb", "tgbt", "local technique", "ssi", "toiture", "facade", "portail", "barriere", "installation generale"];
    // Une mention explicite d'un espace privatif prévaut sur les mots-clés communs.
    if (privateKeywords.some(word => description.includes(normalizeRegulatoryKey(word)))) return "Parties privatives";
    if (commonKeywords.some(word => {
      const key = normalizeRegulatoryKey(word);
      if (["cta", "gtb", "ssi"].includes(key)) return new RegExp(`(^| )${key}( |$)`).test(description);
      return description.includes(key);
    })) return "Parties communes";
    return "À classifier";
  };

  const updateManualCategory = (key, value) => {
    setManualCategories(previous => {
      const next = { ...previous };
      if (value === "auto") delete next[key];
      else next[key] = value;
      try { localStorage.setItem("lpdl-regulatory-manual-categories", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const prepared = (rows || []).map((row, index) => {
    const dateText = regulatoryField(row, "date", "date observation", "date de constat");
    const date = parseRegulatoryDate(dateText);
    const treatment = regulatoryField(row, "traitement", "statut", "état", "etat") || "Non renseigné";
    const normalizedTreatment = normalizeRegulatoryKey(treatment);
    const status = normalizedTreatment === "traite" || normalizedTreatment.includes("traitee") || normalizedTreatment.includes("levee")
      ? "Traitées"
      : (normalizedTreatment.includes("devis") && normalizedTreatment.includes("travaux")) || normalizedTreatment.includes("attente") || normalizedTreatment.includes("validation")
      ? "En attente"
      : normalizedTreatment.includes("cours") || normalizedTreatment.includes("a traiter") || normalizedTreatment.includes("a chiffrer")
      ? "En cours"
      : "Autres statuts";
    const manualKey = `${regulatoryField(row, "observation id", "id technique", "identifiant") || "sans-id"}-${index}`;
    const automaticCategory = classifyRegulatoryCategory(row);
    return {
      id: regulatoryField(row, "observation id", "id technique", "identifiant") || `reg-${index}`,
      manualKey, automaticCategory,
      date, dateText,
      year: date ? String(date.getFullYear()) : "Date inconnue",
      domain: regulatoryField(row, "domaine") || "Non renseigné",
      treatment, status,
      category: manualCategories[manualKey] || automaticCategory,
      criticality: regulatoryField(row, "criticité", "criticite", "niveau de criticité") || "Non renseignée",
      details: regulatoryField(row, "détails", "details", "observation", "constat"),
      subject: regulatoryField(row, "sujet", "titre"),
      equipment: regulatoryField(row, "équipement", "equipement"),
      identifier: regulatoryField(row, "identifiant", "numéro", "numero", "n° intervention"),
      comment: regulatoryField(row, "commentaire", "commentaires"),
      dueDate: regulatoryField(row, "date échéance", "date d'échéance", "échéance"),
      raw: row,
    };
  }).filter(row => row.year === "2025" || row.year === "2026");

  const domains = [...new Set(prepared.map(row => row.domain))].sort((a, b) => a.localeCompare(b, "fr"));
  const statuses = [...new Set(prepared.map(row => row.status))].sort((a, b) => a.localeCompare(b, "fr"));
  const criticalities = [...new Set(prepared.map(row => row.criticality))].sort((a, b) => a.localeCompare(b, "fr"));
  const filtered = prepared.filter(row =>
    (yearFilter === "all" || row.year === yearFilter) &&
    (domainFilter === "all" || row.domain === domainFilter) &&
    (statusFilter === "all" || row.status === statusFilter) &&
    (criticalityFilter === "all" || row.criticality === criticalityFilter) &&
    (categoryFilter === "all" || row.category === categoryFilter)
  );

  // Défilement automatique du tableau sur l'écran TV.
  useEffect(() => {
    const element = tableScrollRef.current;
    if (!element) return;
    element.scrollTop = 0;
    let pauseTicks = 0;
    const timer = setInterval(() => {
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (maxScroll <= 2) return;
      if (element.scrollTop >= maxScroll - 2) {
        if (pauseTicks < 20) { pauseTicks += 1; return; }
        element.scrollTop = 0;
        pauseTicks = 0;
      } else {
        element.scrollTop = Math.min(maxScroll, element.scrollTop + 0.8);
        pauseTicks = 0;
      }
    }, 30);
    return () => clearInterval(timer);
  }, [filtered.length, yearFilter, domainFilter, statusFilter, criticalityFilter, categoryFilter]);

  const stats = (list) => {
    const total = list.length;
    const treated = list.filter(row => row.status === "Traitées").length;
    const inProgress = list.filter(row => row.status === "En cours").length;
    const pending = list.filter(row => row.status === "En attente").length;
    const notTreated = total - treated;
    return { total, reserves: total, treated, notTreated, inProgress, pending, rate: total ? Math.round(treated / total * 100) : 0 };
  };
  const globalStats = stats(filtered);
  const commonStats = stats(filtered.filter(row => row.category === "Parties communes"));
  const privateStats = stats(filtered.filter(row => row.category === "Parties privatives"));
  const unclassifiedCount = filtered.filter(row => row.category === "À classer").length;
  const treatmentCounts = [
    { label: "Traitées", value: globalStats.treated, color: "#10B981" },
    { label: "En cours", value: globalStats.inProgress, color: "#F59E0B" },
    { label: "En attente", value: globalStats.pending, color: "#8B5CF6" },
  ];
  const domainCounts = [...new Set(filtered.map(row => row.domain))].map(domain => ({
    domain,
    common: filtered.filter(row => row.domain === domain && row.category === "Parties communes").length,
    privates: filtered.filter(row => row.domain === domain && row.category === "Parties privatives").length,
  })).sort((a, b) => (b.common + b.privates) - (a.common + a.privates)).slice(0, 6);
  const maxDomainCount = Math.max(1, ...domainCounts.map(item => item.common + item.privates));
  const fmtDate = date => date ? date.toLocaleDateString("fr-FR") : "—";
  const selectStyle = { border: "1px solid #D1D5DB", borderRadius: 9, padding: "8px 10px", background: "white", color: "#111827", fontSize: 12, fontWeight: 600, minWidth: 130 };
  const cardStyle = { background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", minWidth: 0, boxShadow: "0 2px 5px rgba(0,0,0,.03)" };
  const donut = (s, title, color) => {
    const treated = s.total ? s.treated / s.total * 100 : 0;
    const inProgress = s.total ? s.inProgress / s.total * 100 : 0;
    const pending = s.total ? s.pending / s.total * 100 : 0;
    return <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 76, height: 76, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(#10B981 0 ${treated}%, #F59E0B ${treated}% ${treated + inProgress}%, #8B5CF6 ${treated + inProgress}% ${treated + inProgress + pending}%, #E5E7EB ${treated + inProgress + pending}% 100%)`, display: "grid", placeItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "white", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800 }}>{s.rate}%</div>
      </div>
      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, color, fontSize: 12, marginBottom: 4 }}>{title}</div><div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7 }}>Réserves levées : {s.treated}<br/>Réserves non levées : {s.notTreated}<br/>En cours : {s.inProgress}<br/>En attente : {s.pending}</div></div>
    </div>;
  };
  const statCard = (title, s, color, bg, icon) => <div style={{ ...cardStyle, background: bg, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
    <div style={{ minWidth: 0 }}><div style={{ color, fontWeight: 800, fontSize: 12, marginBottom: 7 }}>{icon} {title}</div><div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div><div style={{ fontSize: 25, fontWeight: 900, color }}>{s.total}</div><div style={{ fontSize: 10, color: "#64748B" }}>Observations</div></div>
      <div><div style={{ fontSize: 22, fontWeight: 800 }}>{s.reserves}</div><div style={{ fontSize: 10, color: "#64748B" }}>Réserves</div></div>
      <div><div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>{s.treated}</div><div style={{ fontSize: 10, color: "#64748B" }}>Levées</div></div>
      <div><div style={{ fontSize: 22, fontWeight: 800, color: "#B45309" }}>{s.notTreated}</div><div style={{ fontSize: 10, color: "#64748B" }}>Non levées</div></div>
    </div></div>{donut(s, "Taux de levée", color)}</div>;

  const sortedRows = [...filtered].sort((a, b) => {
    const priority = status => status === "En cours" ? 0 : status === "En attente" ? 1 : status === "Traitées" ? 2 : 3;
    return priority(a.status) - priority(b.status) || (b.date?.getTime() || 0) - (a.date?.getTime() || 0);
  });

  return (
    <div style={{ height: "100%", overflow: "hidden", padding: "12px 24px 14px", color: "#111827", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, marginBottom: 10, flexShrink: 0 }}>
        <div><div style={{ fontSize: 11, fontWeight: 800, color: "#64748B", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 4 }}>Suivi BV Link · 2025–2026</div><div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-1px" }}>Contrôle réglementaire</div><div style={{ color: "#6B7280", fontSize: 12, marginTop: 4 }}>{filtered.length} observations affichées · données actualisées automatiquement</div></div>
        <div style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: 10, padding: "9px 12px", fontSize: 11, fontWeight: 800 }}>LA POSTE DU LOUVRE</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8, background: "#E9EDF2", borderRadius: 12, marginBottom: 9, flexShrink: 0 }}>
        <select aria-label="Filtrer par année" value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={selectStyle}><option value="all">Toutes les années</option><option value="2025">2025</option><option value="2026">2026</option></select>
        <select aria-label="Filtrer par domaine" value={domainFilter} onChange={e => setDomainFilter(e.target.value)} style={selectStyle}><option value="all">Tous les domaines</option>{domains.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Filtrer par traitement" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}><option value="all">Tous les traitements</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Filtrer par criticité" value={criticalityFilter} onChange={e => setCriticalityFilter(e.target.value)} style={selectStyle}><option value="all">Toutes les criticités</option>{criticalities.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Filtrer par catégorie" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}><option value="all">Toutes les catégories</option><option value="Parties communes">Parties communes</option><option value="Parties privatives">Parties privatives</option><option value="À classifier">À classifier</option></select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 9, marginBottom: 9, flexShrink: 0 }}>
        {statCard("TOTAL SITE (GLOBAL)", globalStats, "#1D4ED8", "#EFF6FF", "▦")}
        {statCard("PARTIES COMMUNES", commonStats, "#047857", "#ECFDF5", "⌂")}
        {statCard("PARTIES PRIVATIVES", privateStats, "#C2410C", "#FFF7ED", "▤")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr 1fr", gap: 9, marginBottom: 9, flexShrink: 0, minHeight: 138 }}>
        <div style={cardStyle}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 9 }}>Réserves par domaine</div><div style={{ display: "flex", gap: 12, fontSize: 10, marginBottom: 8 }}><span style={{ color: "#2563EB" }}>● Parties communes</span><span style={{ color: "#F97316" }}>● Parties privatives</span></div>{domainCounts.map(item => <div key={item.domain} style={{ marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}><b>{item.domain}</b><span>{item.common} / {item.privates}</span></div><div style={{ height: 8, background: "#E5E7EB", borderRadius: 8, overflow: "hidden", display: "flex" }}><div style={{ width: `${item.common / maxDomainCount * 100}%`, background: "#3B82F6" }}/><div style={{ width: `${item.privates / maxDomainCount * 100}%`, background: "#F97316" }}/></div></div>)}</div>
        <div style={cardStyle}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Répartition des traitements</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{donut(commonStats, "Communes", "#047857")}{donut(privateStats, "Privatives", "#C2410C")}</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, marginTop: 8 }}><span style={{ color: "#059669" }}>● Traitées</span><span style={{ color: "#D97706" }}>● En cours</span><span style={{ color: "#7C3AED" }}>● En attente</span></div></div>
        <div style={cardStyle}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Évolution des réserves par année</div>{["2025", "2026"].map(year => { const c = filtered.filter(row => row.year === year && row.category === "Parties communes").length; const p = filtered.filter(row => row.year === year && row.category === "Parties privatives").length; const max = Math.max(1, ...filtered.map(row => row.year === year ? 1 : 0), c, p); return <div key={year} style={{ marginBottom: 12 }}><div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{year}</div><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 54, fontSize: 10, color: "#2563EB" }}>Communes</span><div style={{ flex: 1, height: 8, background: "#EFF6FF", borderRadius: 6 }}><div style={{ width: `${c / Math.max(1, ...filtered.map(r => r.year === year ? (r.category === "Parties communes" ? filtered.filter(x => x.year === year && x.category === "Parties communes").length : 0) : 0), c, p) * 100}%`, height: "100%", background: "#3B82F6", borderRadius: 6 }}/></div><b style={{ fontSize: 10 }}>{c}</b></div><div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}><span style={{ width: 54, fontSize: 10, color: "#EA580C" }}>Privatives</span><div style={{ flex: 1, height: 8, background: "#FFF7ED", borderRadius: 6 }}><div style={{ width: `${p / Math.max(1, c, p) * 100}%`, height: "100%", background: "#F97316", borderRadius: 6 }}/></div><b style={{ fontSize: 10 }}>{p}</b></div></div>; })}</div>
      </div>
      {unclassifiedCount > 0 && <div style={{ fontSize: 10, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "5px 9px", marginBottom: 7, flexShrink: 0 }}>{unclassifiedCount} observation(s) restent « À classifier » : aucun mot-clé fiable n’a été trouvé. Tu peux modifier leur catégorie directement dans le tableau.</div>}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 12px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}><div style={{ fontSize: 13, fontWeight: 800 }}>Détail des observations</div><div style={{ fontSize: 10, color: "#6B7280" }}>En cours → En attente → Traitées → autres · date décroissante · {filtered.length} ligne(s)</div></div>
        <div ref={tableScrollRef} style={{ overflow: "hidden", flex: 1, minHeight: 0 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 1000 }}><thead style={{ position: "sticky", top: 0, background: "#F8FAFC", zIndex: 1 }}><tr>{["Date", "Catégorie (modifiable)", "Domaine", "Équipement / sujet", "Détails", "Traitement", "Criticité", "Échéance", "Commentaire"].map(label => <th key={label} style={{ textAlign: "left", padding: "7px 8px", color: "#64748B", fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid #E5E7EB" }}>{label}</th>)}</tr></thead><tbody>{sortedRows.map((row, index) => <tr key={`${row.id}-${index}`} style={{ background: index % 2 ? "#FAFAFA" : "white" }}><td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{row.date ? fmtDate(row.date) : row.dateText || "—"}</td><td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}><select aria-label={`Catégorie de ${row.id}`} value={manualCategories[row.manualKey] || "auto"} onChange={e => updateManualCategory(row.manualKey, e.target.value)} title={`Classement automatique : ${row.automaticCategory}`} style={{ maxWidth: 145, border: "1px solid #E2E8F0", borderRadius: 8, padding: "4px 6px", fontSize: 10, fontWeight: 800, background: row.category === "Parties communes" ? "#DBEAFE" : row.category === "Parties privatives" ? "#FFEDD5" : "#FEF3C7", color: row.category === "Parties communes" ? "#1D4ED8" : row.category === "Parties privatives" ? "#C2410C" : "#92400E" }}><option value="auto">Auto : {row.automaticCategory}</option><option value="Parties communes">Parties communes</option><option value="Parties privatives">Parties privatives</option><option value="À classifier">À classifier</option></select></td><td style={{ padding: "6px 8px", fontWeight: 700 }}>{row.domain}</td><td style={{ padding: "6px 8px", maxWidth: 150 }}>{row.equipment || row.subject || row.identifier || "—"}</td><td style={{ padding: "6px 8px", maxWidth: 250 }}>{row.details || row.subject || "—"}</td><td style={{ padding: "6px 8px" }}><span style={{ padding: "3px 7px", borderRadius: 10, background: row.status === "Traitées" ? "#D1FAE5" : row.status === "En cours" ? "#FEF3C7" : row.status === "En attente" ? "#EDE9FE" : "#E5E7EB", color: row.status === "Traitées" ? "#047857" : row.status === "En cours" ? "#92400E" : row.status === "En attente" ? "#6D28D9" : "#475569", fontWeight: 800, whiteSpace: "nowrap" }}>{row.treatment}</span></td><td style={{ padding: "6px 8px" }}>{row.criticality}</td><td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{row.dueDate || "—"}</td><td style={{ padding: "6px 8px", maxWidth: 190 }}>{row.comment || "—"}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 24, color: "#9CA3AF" }}>Aucune observation trouvée pour les filtres sélectionnés.</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
export default function Dashboard() {
  const [time, setTime] = useState(new Date());
  const [slideIdx, setSlideIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [planning, setPlanning] = useState(FALLBACK_PLANNING);
  const [planningNext, setPlanningNext] = useState(FALLBACK_PLANNING);
  const [affairs, setAffairs] = useState(FALLBACK_AFFAIRS);
  const [subcontractorsCurrent, setSubcontractorsCurrent] = useState(FALLBACK_SUBCONTRACTORS);
  const [subcontractorsNext, setSubcontractorsNext] = useState(FALLBACK_SUBCONTRACTORS);
  const [quotes, setQuotes] = useState(FALLBACK_QUOTES);
  const [onesite, setOnesite] = useState(FALLBACK_ONESITE);
  const [regulatoryRows, setRegulatoryRows] = useState([]);
  const [dataStatus, setDataStatus] = useState("loading"); // "loading" | "ok" | "error"
  const [lastUpdate, setLastUpdate] = useState(null);
  const [weather, setWeather] = useState(null);
  const [transportLines, setTransportLines] = useState([]);
  const [trajetTimes, setTrajetTimes] = useState(
    SITE.id === "rhapsody"
      ? {
          nicodeme: null,
          alvaro: null,
          camara: null,
          bazil: null,
          bongo: null,
          picart: null,
          royer: null,
        }
      : {
          ghulam: 44,
          nathan: 27,
          michael: 12,
          jason: 77,
          cedric: 81,
          liazide: 35,
          rachid: 30,
          toufik: 30,
        }
  );
  const [transportLastUpdate, setTransportLastUpdate] = useState(null);
  const [quote, setQuote] = useState(() => selectDailyQuote([]));

  // Charger les données depuis Google Sheets
  useEffect(() => {
    let cancelled = false;

    async function fetchAllData() {
      try {
        const [planningRes, affairsRes, subsRes, onesiteRes, citationsRes, regulatoryRes] = await Promise.all([
          fetch(SHEET_URLS.planning).then(r => r.text()),
          fetch(SHEET_URLS.affaires).then(r => r.text()),
          fetch(SHEET_URLS.evenement || SHEET_URLS.soustraitants).then(r => r.text()),
          fetch(SHEET_URLS.onesite).then(r => r.text()).catch(() => ""),
          fetch(SHEET_URLS.citations).then(r => r.text()).catch(() => ""),
          SITE.id === "lpdl" && SHEET_URLS.regulatory
            ? fetch(SHEET_URLS.regulatory).then(r => r.ok ? r.text() : "").catch(() => "")
            : Promise.resolve(""),
        ]);

        if (cancelled) return;

        // Contrôles réglementaires : import brut BV Link, réservé à LPDL pour le moment.
        const newRegulatoryRows = regulatoryRes ? parseCSV(regulatoryRes) : [];
        if (SITE.id === "lpdl") setRegulatoryRows(newRegulatoryRows);

        // Parser Planning : technicien, jour, tache, client, semaine
        // La colonne "semaine" peut être "actuelle" ou "prochaine" (vide = actuelle par défaut)
        const planningRows = parseCSV(planningRes);
        const planningByTechCurrent = {};
        const planningByTechNext = {};
        planningRows.forEach(row => {
          const techId = TECH_NAME_TO_ID[(row.technicien || "").toLowerCase()];
          const dayIdx = DAY_NAME_TO_INDEX[(row.jour || "").toLowerCase()];
          if (techId === undefined || dayIdx === undefined) return;
          const task = {
            day: dayIdx,
            label: row.tache || "",
            client: row.client || "",
          };
          // Détermination de la semaine
          // IMPORTANT : une ligne de planning doit obligatoirement
          // contenir "actuelle" ou "prochaine" pour être affichée.
          // Une cellule vide (ou une valeur inconnue) est ignorée.
          const semaine = (row.semaine || "").toLowerCase().trim();

          let target = null;

          if (semaine === "actuelle") {
            target = planningByTechCurrent;
          } else if (semaine === "prochaine") {
            target = planningByTechNext;
          } else {
            return;
          }

          if (!target[techId]) target[techId] = [];
          target[techId].push(task);
        });
        // Reconstruire dans l'ordre Jason, Cédric, Ghulam (techniciens uniquement, pas Vinci dans le planning)
        const newPlanning = TECHNICIANS.map(t => ({
          techId: t.id,
          tasks: planningByTechCurrent[t.id] || [],
        }));
        const newPlanningNext = TECHNICIANS.map(t => ({
          techId: t.id,
          tasks: planningByTechNext[t.id] || [],
        }));

        // Parser Affaires : locataire, reference, titre, etape, technicien,
        // validateur, date, urgent.
        // La date sert à calculer automatiquement l'ancienneté de l'affaire.
        // Le champ technicien peut contenir plusieurs noms séparés par virgule
        const affairsRows = parseCSV(affairsRes);
        const newAffairs = Object.fromEntries(TENANTS.map(t => [t.id, []]));
        affairsRows.forEach((row, idx) => {
          const rawTenant = (row.locataire || "").toLowerCase().trim();
          const normalizedTenant = rawTenant.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const tenantId = TENANT_NAME_TO_ID[rawTenant] || TENANT_NAME_TO_ID[normalizedTenant];
          const stage = (row.etape || "").toLowerCase().trim();
          if (!tenantId || !STAGES[stage]) return;
          // Multi-techniciens : split par virgule, slash, ou "et"
          const techNames = (row.technicien || "")
            .split(/[,\/]|\set\s/i)
            .map(n => n.trim())
            .filter(Boolean);
          const techIds = techNames
            .map(n => TECH_NAME_TO_ID[n.toLowerCase()])
            .filter(id => id !== undefined);
          newAffairs[tenantId].push({
            id: `aff-${idx}`,
            ref: row.reference || "",
            title: row.titre || "",
            stage: stage,
            tech: techIds[0] || TECHNICIANS[0]?.id,
            techIds: techIds.length > 0 ? techIds : (TECHNICIANS[0] ? [TECHNICIANS[0].id] : []),
            validator: row.validateur || undefined,
            startDate: parseAffairDate(
              row.date ||
              row.date_creation ||
              row["date création"] ||
              row.date_debut ||
              row["date début"] ||
              row.jours ||
              ""
            ),
            urgent: ["oui", "yes", "true", "1"].includes((row.urgent || "").toLowerCase()),
            isQuote: false,
          });
        });

        // Parser Événements : jour, entreprise, domaine, lieu, semaine
        const subsRows = parseCSV(subsRes);
        const newSubsCurrent = [];
        const newSubsNext = [];
        // Map entreprise → couleur (pour cohérence entre jours/semaines)
        const companyColorMap = {};
        let nextColorIdx = 0;
        subsRows.forEach(row => {
          const company = (row.entreprise || "").trim();
          if (company && companyColorMap[company.toLowerCase()] === undefined) {
            companyColorMap[company.toLowerCase()] = nextColorIdx % SUB_COLORS.length;
            nextColorIdx++;
          }
        });
        subsRows.forEach(row => {
          const dayIdx = DAY_NAME_TO_INDEX[(row.jour || "").toLowerCase()];
          if (dayIdx === undefined) return;
          const company = (row.entreprise || "").trim();
          const colorIdx = companyColorMap[company.toLowerCase()] ?? 0;
          const sub = {
            day: dayIdx,
            company: company,
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

        setPlanning(newPlanning);
        setPlanningNext(newPlanningNext);
        setAffairs(newAffairs);
        setSubcontractorsCurrent(newSubsCurrent);
        setSubcontractorsNext(newSubsNext);

        // Parser ONESITE : type (PAT ou QHS), titre, date
        // Conversion date Excel (nombre de jours depuis 01/01/1900)
        function excelDateToStr(val) {
          if (!val) return "";
          const trimmed = String(val).trim();
          if (!trimmed) return "";

          // Déjà au bon format JJ/MM/AA ou JJ/MM/AAAA
          if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
            const parts = trimmed.split("/");
            const y = parts[2].length === 2 ? parts[2] : parts[2].slice(-2);
            return `${parts[0].padStart(2,"0")}/${parts[1].padStart(2,"0")}/${y}`;
          }

          // Format AAAA-MM-JJ (ISO)
          if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
            const d = new Date(trimmed);
            if (!isNaN(d)) {
              return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
            }
          }

          // Nombre Excel (serial date)
          const num = parseFloat(trimmed);
          if (!isNaN(num) && num > 1000) {
            const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
            if (!isNaN(d.getTime())) {
              return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCFullYear()).slice(-2)}`;
            }
          }

          return trimmed;
        }

        const onesiteRows = onesiteRes ? parseCSV(onesiteRes) : [];
        console.log("📋 ONESITE raw rows:", onesiteRows);
        const newPat = [];
        const newQhs = [];
        onesiteRows.forEach(row => {
          // Cherche la colonne type (insensible à la casse, espaces, accents)
          const keys = Object.keys(row);
          const typeKey = keys.find(k => k.toLowerCase().includes("type")) || "type";
          const titreKey = keys.find(k => k.toLowerCase().includes("titre") || k.toLowerCase().includes("title")) || "titre";
          const dateKey = keys.find(k => k.toLowerCase().includes("date")) || "date";

          const type = (row[typeKey] || "").toLowerCase().trim();
          const titre = (row[titreKey] || "").trim();
          if (!titre) return;
          const item = { titre, date: excelDateToStr(row[dateKey] || "") };
          if (type === "pat") newPat.push(item);
          else if (type === "qhs" || type.includes("quart") || type.includes("1/4") || type.includes("heur")) newQhs.push(item);
        });
        console.log("✅ PAT:", newPat.length, "QHS:", newQhs.length);
        setOnesite({ pat: newPat, qhs: newQhs });

        // Parser les citations de l'équipe.
        // Colonnes attendues dans Google Sheets : citation, auteur, date_ajout.
        const citationRows = citationsRes ? parseCSV(citationsRes) : [];
        const today = new Date();
        const eligibleTeamQuotes = citationRows
          .map(row => {
            const text = row.citation || row.texte || row.text || "";
            const author = row.auteur || row.author || "Équipe VINCI";
            const addedAt = parseCitationDate(
              row.date_ajout || row.dateajout || row.date || ""
            );

            return { text, author, addedAt };
          })
          .filter(item => {
            if (!item.text || !item.addedAt) return false;

            const availableAt = new Date(item.addedAt);
            availableAt.setMonth(availableAt.getMonth() + 2);

            return availableAt <= today;
          });

        setQuote(selectDailyQuote(eligibleTeamQuotes, today));

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

  // Le chargement Sheets est relancé toutes les 5 minutes.
  // La citation reste donc stable pendant la journée et change automatiquement le lendemain.


  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522" +
          "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day" +
          "&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day" +
          "&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,wind_speed_10m_max,uv_index_max,precipitation_probability_max" +
          "&timezone=Europe/Paris&forecast_days=4"
        );
        const data = await res.json();
        setWeather(data);
      } catch {}
    }
    fetchWeather();
    const t = setInterval(fetchWeather, 30 * 60 * 1000); // toutes les 30 min
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function fetchTransport() {
      try {
        const res = await fetch("/api/transport");
        const data = await res.json();
        setTransportLines(data.lines || []);
        setTransportLastUpdate(data.updatedAt || new Date().toISOString());
      } catch {}
    }
    fetchTransport();
    const t = setInterval(fetchTransport, 5 * 60 * 1000); // toutes les 5 min
    return () => clearInterval(t);
  }, []);



  // Navigation clavier : espace / flèche droite = suivant, flèche gauche = précédent
  useEffect(() => {
    function handleKey(e) {
      if (e.code === "Space" || e.code === "ArrowRight") {
        e.preventDefault();
        setSlideIdx(i => (i + 1) % SLIDES.length);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setSlideIdx(i => (i - 1 + SLIDES.length) % SLIDES.length);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Détecte si la slide actuelle n'a aucune donnée à afficher
  function isSlideEmpty(slide) {
    if (slide.type === "tenant") {
      return (affairs[slide.tenantId] || []).length === 0;
    }
    if (slide.type === "planning") {
      const p = slide.week === "next" ? planningNext : planning;
      return p.reduce((sum, t) => sum + t.tasks.length, 0) === 0;
    }
    if (slide.type === "subcontractors") {
      const subs = slide.week === "current" ? subcontractorsCurrent : subcontractorsNext;
      return subs.length === 0;
    }
    if (slide.type === "quotes") {
      return quotes.length === 0;
    }
    return false;
  }

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    // Slide vide : on passe très vite à la suivante (3s) au lieu d'attendre la durée complète
    const empty = isSlideEmpty(SLIDES[slideIdx]);
    let slideDuration = SLIDE_DURATION;
    if (empty) slideDuration = 3000;
    else if (SLIDES[slideIdx].type === "quotes") slideDuration = QUOTES_SLIDE_DURATION;
    else if (SLIDES[slideIdx].type === "regulatory") slideDuration = 150000; // 2 min 30 pour lire le tableau en défilement automatique
    else if (
      SLIDES[slideIdx].type === "planning" &&
      (
        SITE.id === "rhapsody" ||
        planning.reduce((sum, p) => sum + p.tasks.length, 0) > 12
      )
    ) {
      // Rhapsody : les slides Planning restent 45 secondes pour laisser le temps
      // de voir les 6 techniciens et le défilement automatique.
      slideDuration = PLANNING_SLIDE_DURATION;
    }
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / slideDuration) * 100));
    }, 100);
    const advance = setTimeout(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length);
    }, slideDuration);
    return () => { clearInterval(tick); clearTimeout(advance); };
  }, [slideIdx, planning, planningNext, affairs, subcontractorsCurrent, subcontractorsNext, quotes]);

  useEffect(() => {
    if (!["lpdl", "rhapsody"].includes(SITE.id)) return;

    let cancelled = false;

    async function fetchTrajetTimes() {
      try {
        const response = await fetch("/api/trajets");

        if (!response.ok) {
          throw new Error(`Erreur API trajets : ${response.status}`);
        }

        const data = await response.json();

        if (!cancelled) {
          setTrajetTimes(data.times || {});
        }
      } catch (error) {
        console.error("Erreur actualisation trajets :", error);
      }
    }

    fetchTrajetTimes();

    // Actualisation automatique toutes les 5 minutes
    const interval = setInterval(fetchTrajetTimes, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const timeStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const currentSlide = SLIDES[slideIdx];
  const currentTenant = currentSlide.type === "tenant" ? TENANTS.find(t => t.id === currentSlide.tenantId) : null;
  const isSubcontractors = currentSlide.type === "subcontractors";
  const isQuotes = currentSlide.type === "quotes";
  const headerAccent = currentSlide.type === "goldenRules"
    ? "#00A091"
    : currentSlide.type === "ehpg"
    ? "#10BFB2"
    : currentSlide.type === "onesite"
    ? ONESITE_ACCENT
    : currentTenant
    ? currentTenant.accent
    : isSubcontractors ? SUBCONTRACTORS_ACCENT
    : isQuotes ? QUOTES_ACCENT
    : currentSlide.type === "weather" ? "#0EA5E9"
    : currentSlide.type === "quote" ? "#8B5CF6"
    : currentSlide.type === "transport" ? "#10B981"
    : currentSlide.type === "regulatory" ? "#0F766E"
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
        @keyframes scrollPlanning { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes scrollTenant { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes scrollStandings { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes scrollTransport { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,-50%,0); } }
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
              {SITE.name} · Slide {slideIdx + 1} / {SLIDES.length} · rotation auto {SITE.id === "rhapsody" && currentSlide.type === "planning" ? "45s" : "30s"}
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
              fontSize: 20,
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
          if (s.type === "goldenRules") {
            label = "RÈGLES D'OR";
            accentColor = "#00A091";
          } else if (s.type === "ehpg") {
            label = s.label;
            accentColor = "#10BFB2";
          } else if (s.type === "onesite") {
            label = "ONESITE";
            accentColor = ONESITE_ACCENT;
          } else if (s.type === "planning") {
            label = s.week === "next" ? "PLAN. PROCH." : "ÉQUIPE";
            accentColor = s.week === "next" ? "#0E7490" : "#3B82F6";
          } else if (s.type === "subcontractors") {
            label = s.week === "current" ? "ÉVÉN. CETTE SEM." : "ÉVÉN. SEM. PROCH.";
            accentColor = SUBCONTRACTORS_ACCENT;
          } else if (s.type === "weather") {
            label = "MÉTÉO";
            accentColor = "#0EA5E9";
          } else if (s.type === "quote") {
            label = "CITATION";
            accentColor = "#8B5CF6";
          } else if (s.type === "trajetPerso") {
            label = "TRAJETS";
            accentColor = "#00BCD4";
          } else if (s.type === "transport") {
            label = "TRANSPORT";
            accentColor = "#10B981";
          } else if (s.type === "regulatory") {
            label = "CONTRÔLE RÉGLEMENTAIRE";
            accentColor = "#0F766E";
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
        {currentSlide.type === "goldenRules" && <GoldenRulesSlide />}
        {currentSlide.type === "ehpg" && (
          <EhpgSlide image={currentSlide.image} alt={currentSlide.alt} />
        )}
        {currentSlide.type === "weather" && <WeatherSlide weather={weather} />}
        {currentSlide.type === "quote" && <QuoteSlide quote={quote} />}
        {currentSlide.type === "trajetPerso" && <TrajetPersoSlide trajetTimes={trajetTimes} />}
        {currentSlide.type === "transport" && <TransportSlide lines={transportLines} lastUpdate={transportLastUpdate} />}
        {currentSlide.type === "onesite" && <OneSiteSlide onesite={onesite} />}
        {currentSlide.type === "regulatory" && <RegulatorySlide rows={regulatoryRows} />}
        {currentSlide.type === "planning" && (
          <PlanningSlide
            planning={currentSlide.week === "next" ? planningNext : planning}
            week={currentSlide.week || "current"}
          />
        )}
        {currentSlide.type === "tenant" && <TenantSlide tenant={currentTenant} affairs={affairs[currentTenant.id] || []} />}
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
