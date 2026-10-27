// Règles métier du CRM Klubik — portage fidèle de klubik-ai/crm/klubik_crm.py (validé sur le fichier réel).
// Fonctions pures : aucune lecture/écriture en base ici.

export interface CrmSettings {
  statuts: string[];
  canauxEnvoi: string[];
  reponses: string[];
  delaiRelance: number;
  objectifSemaine: number;
  seuils: number[]; // [A+, A, B]
}
export type ClubData = Record<string, unknown>;
export interface Club { id: number; data: ClubData; version: number }

export const STATUTS_FERMES = new Set(["Exclu", "Client", "Sans suite"]);
export const STATUTS_SUIVI_RELANCE = new Set(["Contacté", "Relancé"]);
export const CHAMPS_SUIVI = [
  "Statut", "Historique Klubik", "Action maintenant", "Notes", "Date 1er contact", "Canal utilisé",
  "Dernier contact", "Réponse reçue", "Prochain pas", "Contact (prénom nom)", "Rôle du contact",
];
export const CHAMPS_INFO = [
  "Instagram exact", "Facebook exact / nom page", "Email public", "Site", "Canal recommandé",
  "Contact (prénom nom)", "Rôle du contact",
];
export const TYPES_MAJ = [
  "premier-contact", "relance", "reponse", "rdv", "devis", "client", "sans-suite", "note", "prochain-pas", "statut", "info",
] as const;
export type TypeMaj = (typeof TYPES_MAJ)[number];
export const SENTIMENTS = ["positif", "neutre", "question", "refus-poli", "refus-definitif"] as const;

export class CrmError extends Error {}

// ─────────────────────────────── utilitaires ───────────────────────────────

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function normaliser(txt: unknown): string {
  return s(txt)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();
}

const MOTS_GENERIQUES = new Set([
  "handball", "hand", "ball", "hb", "hbc", "hbcl", "club", "de", "du", "des", "la", "le", "les", "l", "d", "et",
  "sport", "sports", "sportif", "sportive", "as", "us", "ac", "sc", "cs", "asso", "association", "amicale",
  "entente", "union", "olympique", "athletic",
]);

export function motsSignificatifs(txt: unknown): string[] {
  return normaliser(txt).split(" ").filter((m) => m && !MOTS_GENERIQUES.has(m));
}

/** Équivalent de difflib.SequenceMatcher(None, a, b).ratio() (Ratcliff/Obershelp). */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches = (a1: number, a2: number, b1: number, b2: number): number => {
    let best = 0, bi = a1, bj = b1;
    let prev = new Map<number, number>();
    for (let i = a1; i < a2; i++) {
      const cur = new Map<number, number>();
      for (let j = b1; j < b2; j++) {
        if (a[i] === b[j]) {
          const k = (prev.get(j - 1) ?? 0) + 1;
          cur.set(j, k);
          if (k > best) { best = k; bi = i - k + 1; bj = j - k + 1; }
        }
      }
      prev = cur;
    }
    if (!best) return 0;
    return best + matches(a1, bi, b1, bj) + matches(bi + best, a2, bj + best, b2);
  };
  return (2 * matches(0, a.length, 0, b.length)) / (a.length + b.length);
}

/** Date ISO (AAAA-MM-JJ) → objet Date UTC ; accepte aussi JJ/MM/AAAA. */
export function toDate(v: unknown): Date | null {
  const t = s(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

export function parseDateStrict(t: string): Date {
  const d = toDate(t);
  if (!d || Number.isNaN(d.getTime())) throw new CrmError(`Date illisible : « ${t} » (formats : JJ/MM/AAAA ou AAAA-MM-JJ).`);
  return d;
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const fr = (d: Date | null) =>
  d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "";
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export const todayUtc = (now = new Date()) => {
  // Date du jour en France (Europe/Paris), exprimée en minuit UTC.
  const p = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${p}T00:00:00Z`);
};

// ─────────────────────────────── valeurs dérivées (= formules du fichier) ───────────────────────────────

export function priorite(c: ClubData, st: CrmSettings): string {
  if (STATUTS_FERMES.has(s(c["Statut"]))) return "";
  const score = typeof c["Score /10"] === "number" ? (c["Score /10"] as number) : 0;
  const [ap, a, b] = st.seuils;
  return score >= ap ? "A+" : score >= a ? "A" : score >= b ? "B" : "C";
}

export function relanceDue(c: ClubData, st: CrmSettings): Date | null {
  if (!STATUTS_SUIVI_RELANCE.has(s(c["Statut"]))) return null;
  const base = toDate(c["Dernier contact"]) ?? toDate(c["Date 1er contact"]);
  return base ? addDays(base, st.delaiRelance) : null;
}

const reseauOk = (v: unknown) => {
  const t = s(v);
  return t !== "" && !t.toLowerCase().includes("introuvable") && t !== "À vérifier";
};

export const joignable = (c: ClubData) =>
  reseauOk(c["Instagram exact"]) || reseauOk(c["Facebook exact / nom page"]) || s(c["Email public"]).includes("@");

export function contactAUtiliser(c: ClubData): string {
  const email = s(c["Email public"]);
  if (c["Canal recommandé"] === "Email" && email.includes("@")) return `Email ${email}`;
  if (reseauOk(c["Instagram exact"])) return `IG ${s(c["Instagram exact"])}`;
  if (reseauOk(c["Facebook exact / nom page"])) return `FB ${s(c["Facebook exact / nom page"])}`;
  return email.includes("@") ? `Email ${email}` : "";
}

export function pretAEnvoyer(c: ClubData): boolean {
  const msg = s(c["Message prêt à copier"]);
  return c["Statut"] === "À contacter" && msg !== "" && !msg.includes("[Prénom]") && joignable(c);
}

export function alerte(c: ClubData): string {
  const st = s(c["Statut"]);
  const msg = s(c["Message prêt à copier"]);
  if (["Contacté", "Relancé", "En échange", "Devis envoyé"].includes(st) && !c["Date 1er contact"]) return "Date 1er contact manquante";
  if (STATUTS_SUIVI_RELANCE.has(st) && c["Réponse reçue"] === "Oui") return "Réponse reçue : statut à mettre à jour";
  if (st === "À contacter" && s(c["Type structure"]).toLowerCase().includes("entente")) return "Entente non qualifiée";
  if (st === "À contacter" && c["Canal recommandé"] === "Email" && !s(c["Email public"]).includes("@")) return "Canal Email sans adresse";
  if (st === "À contacter" && c["Canal recommandé"] === "Instagram" && !s(c["Instagram exact"]).includes("@")) return "Canal Instagram sans compte";
  if (st === "À contacter" && msg.includes("[Prénom]")) return "Prénom à compléter dans le message";
  return "";
}

export function prochainPasDate(c: ClubData): Date | null {
  const m = /^\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s(c["Prochain pas"]));
  return m ? toDate(m[1]) : null;
}

// ─────────────────────────────── synthèses ───────────────────────────────

export function stats(clubs: Club[], st: CrmSettings, today: Date) {
  const statuts: Record<string, number> = {};
  for (const c of clubs) statuts[s(c.data["Statut"])] = (statuts[s(c.data["Statut"])] ?? 0) + 1;
  const isClientContacte = (d: ClubData) => d["Statut"] === "Client" && !!d["Date 1er contact"];
  const lundi = addDays(today, -((today.getUTCDay() + 6) % 7));
  return {
    actifs: clubs.length - (statuts["Exclu"] ?? 0),
    joignables: clubs.filter((c) => joignable(c.data) && c.data["Statut"] !== "Exclu").length,
    contactes: clubs.filter((c) => ["Contacté", "Relancé", "En échange", "Devis envoyé", "Sans suite"].includes(s(c.data["Statut"])) || isClientContacte(c.data)).length,
    ontRepondu: clubs.filter((c) => ["En échange", "Devis envoyé"].includes(s(c.data["Statut"])) || isClientContacte(c.data) || c.data["Réponse reçue"] === "Oui").length,
    clients: statuts["Client"] ?? 0,
    relancesEnRetard: clubs.filter((c) => { const d = relanceDue(c.data, st); return d && d <= today; }).length,
    statuts: Object.fromEntries(Object.entries(statuts).sort((a, b) => b[1] - a[1])),
    premiersContactsSemaine: clubs.filter((c) => { const d = toDate(c.data["Date 1er contact"]); return d && d >= lundi && d <= today; }).length,
    objectifSemaine: st.objectifSemaine,
    lundi: iso(lundi),
    prets: clubs.filter((c) => pretAEnvoyer(c.data)).length,
  };
}

export function relances(clubs: Club[], st: CrmSettings, today: Date, horizonJours = 7) {
  const horizon = addDays(today, horizonJours);
  const retard: { due: string; joursRetard: number; club: Club }[] = [];
  const avenir: { due: string; club: Club }[] = [];
  const prochainsPas: { date: string; club: Club }[] = [];
  for (const c of clubs) {
    const d = relanceDue(c.data, st);
    if (d && d <= today) retard.push({ due: iso(d), joursRetard: Math.round((today.getTime() - d.getTime()) / 86400000), club: c });
    else if (d && d <= horizon) avenir.push({ due: iso(d), club: c });
    const p = prochainPasDate(c.data);
    if (p && p <= horizon && !["Exclu", "Sans suite"].includes(s(c.data["Statut"]))) prochainsPas.push({ date: iso(p), club: c });
  }
  const byDate = <T extends { club: Club }>(k: (x: T) => string) => (a: T, b: T) => k(a).localeCompare(k(b));
  return {
    horizon: iso(horizon),
    retard: retard.sort(byDate((x) => x.due)),
    avenir: avenir.sort(byDate((x) => x.due)),
    prochainsPas: prochainsPas.sort(byDate((x) => x.date)),
  };
}

export function chercher(clubs: Club[], requete: string, limite = 8): { score: number; club: Club }[] {
  const q = requete.trim();
  if (/^\d+$/.test(q)) {
    const hit = clubs.filter((c) => c.id === Number(q));
    if (hit.length) return hit.map((club) => ({ score: 100, club }));
  }
  const qn = normaliser(q);
  const qsig = motsSignificatifs(q);
  const res: { score: number; club: Club }[] = [];
  for (const c of clubs) {
    const nom = normaliser(c.data["Club"]);
    let score = 0;
    if (qn === nom) score = 100;
    else if (qn && nom.includes(qn)) score = 85;
    const ig = normaliser(c.data["Instagram exact"]);
    if (qn.startsWith("@") && ig.split(" ").includes(qn)) score = Math.max(score, 95);
    const sig = motsSignificatifs(c.data["Club"]);
    if (qsig.length && sig.length) {
      const communs = qsig.filter((m) => sig.some((x) => m === x || (m.length > 3 && x.startsWith(m)))).length;
      if (communs) score = Math.max(score, 50 + Math.trunc((40 * communs) / qsig.length) - 3 * Math.max(0, sig.length - communs));
      score = Math.max(score, Math.trunc(ratio(qsig.join(" "), sig.join(" ")) * 80));
    }
    if (score >= 45) res.push({ score, club: c });
  }
  res.sort((a, b) => b.score - a.score || s(a.club.data["Club"]).localeCompare(s(b.club.data["Club"])));
  return res.slice(0, limite);
}

export function estAmbigu(res: { score: number }[]): boolean {
  if (!res.length) return false;
  return (res.length > 1 && res[0].score - res[1].score < 10) || res[0].score < 70;
}

export function qualite(clubs: Club[], today: Date) {
  const groupes = (cle: (c: Club) => string | null) => {
    const g = new Map<string, Club[]>();
    for (const c of clubs) {
      const k = cle(c);
      if (k) g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.values()].filter((v) => v.length > 1);
  };
  const doublons = [
    ...groupes((c) => normaliser(c.data["Club"])).map((g) => ({ critere: "nom", clubs: g })),
    ...groupes((c) => (s(c.data["Instagram exact"]).includes("@") ? normaliser(c.data["Instagram exact"]) : null)).map((g) => ({ critere: "Instagram", clubs: g })),
    ...groupes((c) => (s(c.data["Email public"]).includes("@") ? s(c.data["Email public"]).toLowerCase() : null)).map((g) => ({ critere: "email", clubs: g })),
  ];
  const incoherences: { club: Club; problemes: string[] }[] = [];
  for (const c of clubs) {
    const d = c.data, pb: string[] = [];
    const st = s(d["Statut"]);
    if (["Contacté", "Relancé", "En échange", "Devis envoyé"].includes(st) && !d["Canal utilisé"]) pb.push("canal du contact non renseigné");
    const d1 = toDate(d["Date 1er contact"]), dl = toDate(d["Dernier contact"]);
    if (d1 && dl && dl < d1) pb.push("dernier contact antérieur au 1er contact");
    if ((d1 && d1 > today) || (dl && dl > today)) pb.push("date de contact dans le futur");
    if (st === "Relancé" && !dl) pb.push("statut Relancé sans date de dernier contact");
    if (["À contacter", "À qualifier"].includes(st) && d1) pb.push("date de 1er contact renseignée mais statut non contacté");
    const al = alerte(d);
    if (al === "Date 1er contact manquante" || al === "Réponse reçue : statut à mettre à jour") pb.push(al);
    if (pb.length) incoherences.push({ club: c, problemes: pb });
  }
  const aContacter = clubs.filter((c) => c.data["Statut"] === "À contacter");
  return {
    doublons,
    incoherences,
    manquants: {
      nonJoignables: aContacter.filter((c) => !joignable(c.data)).length,
      sansMessage: aContacter.filter((c) => !c.data["Message prêt à copier"]).length,
      prenomACompleter: aContacter.filter((c) => s(c.data["Message prêt à copier"]).includes("[Prénom]")).length,
      sansInterlocuteur: aContacter.filter((c) => !c.data["Contact (prénom nom)"]).length,
      canalAVerifier: aContacter.filter((c) => c.data["Canal recommandé"] === "À vérifier").length,
    },
  };
}

// ─────────────────────────────── planification d'une mise à jour ───────────────────────────────

export interface DemandeMaj {
  type: TypeMaj;
  date?: string;
  canal?: string;
  resume?: string;
  sentiment?: string;
  prochain_pas?: string;
  date_prochain_pas?: string;
  statut?: string;
  champ?: string;
  valeur?: string;
  source?: string;
  remplacer?: boolean;
  forcer?: boolean;
}

export const ajoutNote = (notes: unknown, date: Date, texte: string) => {
  const entree = `${fr(date)} : ${texte}`;
  const n = s(notes).trim();
  return n ? `${n} | ${entree}` : entree;
};

/**
 * Construit les modifications selon les règles de l'onglet Listes. Lève CrmError si interdit.
 * Retourne uniquement les champs réellement modifiés (dates en AAAA-MM-JJ).
 */
export function planifier(c: ClubData, dm: DemandeMaj, st: CrmSettings, today: Date): { changes: ClubData; avertissements: string[] } {
  const t = dm.type;
  const statut = s(c["Statut"]);
  const date = dm.date ? parseDateStrict(dm.date) : today;
  if (date > today && t !== "prochain-pas") {
    throw new CrmError(`La date ${fr(date)} est dans le futur : une interaction ne peut pas être enregistrée avant d'avoir eu lieu.`);
  }
  const resume = s(dm.resume).trim();
  const avert: string[] = [];
  const m: ClubData = {};

  const exigerCanal = () => {
    if (!dm.canal) throw new CrmError(`Canal obligatoire pour « ${t} » (valeurs : ${st.canauxEnvoi.join(", ")}).`);
    if (!st.canauxEnvoi.includes(dm.canal)) throw new CrmError(`Canal « ${dm.canal} » hors liste. Valeurs autorisées : ${st.canauxEnvoi.join(", ")}.`);
  };
  const prochainPas = () => {
    if (dm.prochain_pas || dm.date_prochain_pas) {
      const dp = dm.date_prochain_pas ? parseDateStrict(dm.date_prochain_pas) : null;
      const txt = s(dm.prochain_pas || "Recontacter").trim();
      m["Prochain pas"] = dp ? `${fr(dp)} – ${txt}` : txt;
      m["Action maintenant"] = m["Prochain pas"];
    }
  };

  if (statut === "Exclu" && !["note", "info", "statut"].includes(t)) {
    throw new CrmError(`${s(c["Club"])} est « Exclu » (règle Listes : jamais de message). Aucune interaction enregistrée.`);
  }

  switch (t) {
    case "premier-contact": {
      exigerCanal();
      if (statut === "Client") throw new CrmError("Club client : pas de premier contact de prospection (règle : suivi / upsell uniquement).");
      if (["Contacté", "Relancé", "En échange", "Devis envoyé", "Sans suite"].includes(statut))
        throw new CrmError(`Statut actuel « ${statut} » : ce club a déjà été contacté. Utiliser une relance ou une réponse.`);
      if (c["Date 1er contact"]) throw new CrmError("Date 1er contact déjà renseignée : refus d'écraser l'historique.");
      if (statut === "À qualifier") {
        if (!dm.forcer) throw new CrmError("Statut « À qualifier » (règle Listes : pas d'envoi tant que l'entité n'est pas confirmée). Confirmation explicite requise (forcer).");
        avert.push("Club « À qualifier » passé en Contacté sur demande explicite.");
      }
      Object.assign(m, {
        "Statut": "Contacté", "Date 1er contact": iso(date), "Canal utilisé": dm.canal, "Dernier contact": iso(date),
        "Action maintenant": `Attendre la réponse – relance prévue le ${fr(addDays(date, st.delaiRelance))}`,
      });
      const hist = s(c["Historique Klubik"]);
      if (hist.startsWith("Jamais contacté")) m["Historique Klubik"] = hist.replace("Jamais contacté", `Contacté le ${fr(date)} (${dm.canal})`);
      m["Notes"] = ajoutNote(c["Notes"], date, `premier contact ${dm.canal}${resume ? ` – ${resume}` : ""}`);
      break;
    }
    case "relance": {
      exigerCanal();
      if (!STATUTS_SUIVI_RELANCE.has(statut)) throw new CrmError(`Relance possible seulement depuis Contacté/Relancé (statut actuel : « ${statut} »).`);
      if (!c["Date 1er contact"]) avert.push("Date 1er contact manquante : à compléter.");
      if (!c["Canal utilisé"]) avert.push("Canal du 1er contact inconnu : non renseigné automatiquement (il pourrait différer de celui de la relance).");
      Object.assign(m, {
        "Statut": "Relancé", "Dernier contact": iso(date),
        "Action maintenant": `Attendre la réponse – prochaine relance possible le ${fr(addDays(date, st.delaiRelance))}`,
      });
      m["Notes"] = ajoutNote(c["Notes"], date, `relance ${dm.canal}${resume ? ` – ${resume}` : ""}`);
      break;
    }
    case "reponse": {
      if (!resume) throw new CrmError("Résumé obligatoire : reprendre fidèlement la réponse reçue.");
      if (!SENTIMENTS.includes(dm.sentiment as (typeof SENTIMENTS)[number])) throw new CrmError(`Sentiment obligatoire : ${SENTIMENTS.join(" | ")}.`);
      if (statut === "Client") avert.push("Club déjà client : statut conservé.");
      else if (dm.sentiment === "refus-definitif") {
        m["Statut"] = "Sans suite";
        m["Action maintenant"] = "Ne plus relancer (refus explicite)";
      } else {
        m["Statut"] = statut === "Devis envoyé" ? "Devis envoyé" : "En échange";
        if (dm.sentiment === "refus-poli" && !(dm.prochain_pas || dm.date_prochain_pas)) m["Action maintenant"] = "Ne pas relancer sans élément nouveau (refus poli)";
      }
      m["Réponse reçue"] = "Oui";
      m["Dernier contact"] = iso(date);
      if (dm.canal) exigerCanal();
      m["Notes"] = ajoutNote(c["Notes"], date, `réponse reçue (${dm.sentiment}${dm.canal ? `, ${dm.canal}` : ""}) – ${resume}`);
      prochainPas();
      if (["positif", "neutre", "question"].includes(s(dm.sentiment)) && !("Prochain pas" in m)) avert.push("Aucun prochain pas renseigné : en proposer un.");
      break;
    }
    case "rdv": case "devis": case "client": case "sans-suite": {
      const cible = { rdv: "En échange", devis: "Devis envoyé", client: "Client", "sans-suite": "Sans suite" }[t];
      if (statut === "À contacter" && t !== "sans-suite") avert.push("Le club n'avait aucun contact enregistré : vérifier l'historique.");
      m["Statut"] = cible;
      if (t !== "sans-suite") m["Dernier contact"] = iso(date);
      const lib = { rdv: "rendez-vous / échange", devis: "devis envoyé", client: "devient client", "sans-suite": "classé sans suite" }[t];
      m["Notes"] = ajoutNote(c["Notes"], date, lib + (resume ? ` – ${resume}` : ""));
      if (t === "client") m["Action maintenant"] = "Client Klubik – suivi / upsell uniquement";
      if (t === "sans-suite") m["Action maintenant"] = "Ne plus relancer (sans suite)";
      prochainPas();
      break;
    }
    case "note":
      if (!resume) throw new CrmError("Résumé obligatoire pour une note.");
      m["Notes"] = ajoutNote(c["Notes"], date, resume);
      break;
    case "prochain-pas":
      if (!(dm.prochain_pas || dm.date_prochain_pas)) throw new CrmError("Prochain pas et/ou date obligatoire.");
      prochainPas();
      break;
    case "statut":
      if (!st.statuts.includes(s(dm.statut))) throw new CrmError(`Statut « ${s(dm.statut)} » hors liste. Valeurs : ${st.statuts.join(", ")}.`);
      if (!resume) throw new CrmError("Motif obligatoire pour un changement de statut.");
      m["Statut"] = dm.statut;
      m["Notes"] = ajoutNote(c["Notes"], date, `statut ${statut} → ${dm.statut} – ${resume}`);
      break;
    case "info": {
      if (!CHAMPS_INFO.includes(s(dm.champ))) throw new CrmError(`Champ doit être l'un de : ${CHAMPS_INFO.join(", ")}.`);
      if (!dm.valeur) throw new CrmError("Valeur obligatoire.");
      const actuel = c[s(dm.champ)];
      if (actuel !== null && actuel !== undefined && actuel !== "" && actuel !== "À vérifier" && !dm.remplacer && !s(actuel).toLowerCase().includes("introuvable"))
        throw new CrmError(`« ${dm.champ} » contient déjà « ${s(actuel)} » : remplacement à confirmer explicitement.`);
      if (!dm.source) throw new CrmError("Source obligatoire (d'où vient l'information ?). On n'invente aucune donnée.");
      m[s(dm.champ)] = dm.valeur;
      m["Notes"] = ajoutNote(c["Notes"], date, `${dm.champ} = ${dm.valeur} (source : ${dm.source})`);
      break;
    }
    default:
      throw new CrmError(`Type inconnu : ${t}`);
  }
  if ("Statut" in m && !st.statuts.includes(s(m["Statut"]))) throw new CrmError(`Statut « ${s(m["Statut"])} » absent de l'onglet Listes.`);
  if ("Réponse reçue" in m && st.reponses.length && !st.reponses.includes(s(m["Réponse reçue"]))) throw new CrmError("Valeur de réponse hors liste.");
  const changes: ClubData = {};
  for (const [k, v] of Object.entries(m)) if (s(c[k]) !== s(v)) changes[k] = v;
  return { changes, avertissements: avert };
}
