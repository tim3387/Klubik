// Outils des agents (exécutés côté serveur). Lecture du CRM, propositions de mise à jour,
// dossiers de renseignement, brouillons. Aucun outil n'écrit directement dans le CRM :
// les modifications deviennent des « actions à valider » par Timothé.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tx } from "../db";
import * as R from "../crm/rules";
import { clubJournal, getClub, loadClubs, loadSettings } from "../crm/repo";
import { fraicheur, validerDossier } from "../intel";
import type { AgentId } from "./definitions";

export interface ToolContext {
  tx: Tx;
  today: Date;
  taskId: string;
  rootId: string;
  agentId: AgentId;
  conversationId: string | null;
}

type Def = { description: string; schema: z.ZodType; json: Record<string, unknown>; run: (input: any, ctx: ToolContext) => Promise<string> };

const ligne = (st: R.CrmSettings, c: R.Club, extra = "") => {
  const p = R.priorite(c.data, st);
  return `[ID ${c.id}] ${c.data["Club"]} — ${c.data["Statut"]}${p ? ` · prio ${p}` : ""} · score ${c.data["Score /10"] ?? "?"} · ${c.data["Niveau"] ?? ""} ${c.data["Divisions"] ?? ""}${extra}`;
};

const suivi = (c: R.Club) =>
  ` · 1er contact ${R.fr(R.toDate(c.data["Date 1er contact"])) || "?"} · dernier ${R.fr(R.toDate(c.data["Dernier contact"])) || "—"} · canal ${c.data["Canal utilisé"] ?? "INCONNU"} · contact : ${R.contactAUtiliser(c.data) || "—"}`;

async function statutIntel(tx: Tx, clubId: number, today: Date): Promise<string> {
  const [r] = await tx<{ verifie_le: string }[]>`select to_char(verifie_le, 'YYYY-MM-DD') as verifie_le from intel_dossiers where club_id = ${clubId} order by verifie_le desc, id desc limit 1`;
  if (!r) return "pas de dossier de renseignement";
  const f = fraicheur(r.verifie_le, today);
  return `dossier de renseignement ${f.label} (${f.jours} j)`;
}

const CHAMPS_FICHE = [
  "Niveau", "Divisions", "Poule(s)", "Type structure", "Statut", "Score /10", "Historique Klubik", "Canal recommandé",
  "Instagram exact", "Confiance IG", "Facebook exact / nom page", "Email public", "Site", "Contact (prénom nom)",
  "Rôle du contact", "Signal récent / transformation", "Diagnostic / pain point", "Angle commercial dominant",
  "Action maintenant", "Date 1er contact", "Canal utilisé", "Dernier contact", "Réponse reçue", "Prochain pas",
  "Confiance analyse", "Notes", "Message prêt à copier", "Message v1 (archive)", "Variante test",
];

export const TOOLS: Record<string, Def> = {
  crm_point: {
    description: "Synthèse chiffrée de la prospection (calculée sur le CRM réel) : compteurs, statuts, objectif hebdomadaire, relances en retard et à venir, alertes.",
    schema: z.object({ horizon_jours: z.number().int().min(1).max(60).optional() }),
    json: { type: "object", properties: { horizon_jours: { type: "integer", description: "Horizon des relances à venir (défaut 7)" } }, additionalProperties: false },
    async run(i, ctx) {
      const [st, clubs] = await Promise.all([loadSettings(ctx.tx), loadClubs(ctx.tx)]);
      const s = R.stats(clubs, st, ctx.today);
      const r = R.relances(clubs, st, ctx.today, i.horizon_jours ?? 7);
      const alertes: Record<string, number> = {};
      for (const c of clubs) { const a = R.alerte(c.data); if (a) alertes[a] = (alertes[a] ?? 0) + 1; }
      return [
        `Date de référence : ${R.fr(ctx.today)} — source : CRM Klubik (base officielle)`,
        `Clubs actifs ${s.actifs} · joignables ${s.joignables} · contactés ${s.contactes} · ont répondu ${s.ontRepondu} · clients ${s.clients} · relances en retard ${s.relancesEnRetard}`,
        `Statuts : ${Object.entries(s.statuts).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
        `Premiers contacts depuis le lundi ${R.fr(R.toDate(s.lundi))} : ${s.premiersContactsSemaine} / objectif ${s.objectifSemaine}`,
        `« À contacter » avec message prêt (sans [Prénom]) : ${s.prets}`,
        `RELANCES EN RETARD (${r.retard.length}) :`, ...r.retard.map((x) => `- dues le ${R.fr(R.toDate(x.due))} (${x.joursRetard} j) · ${ligne(st, x.club, suivi(x.club))}`),
        `RELANCES À VENIR d'ici le ${R.fr(R.toDate(r.horizon))} (${r.avenir.length}) :`, ...r.avenir.map((x) => `- le ${R.fr(R.toDate(x.due))} · ${ligne(st, x.club, suivi(x.club))}`),
        `PROCHAINS PAS DATÉS (${r.prochainsPas.length}) :`, ...r.prochainsPas.map((x) => `- le ${R.fr(R.toDate(x.date))} · ${ligne(st, x.club, ` · ${x.club.data["Prochain pas"]}`)}`),
        `ALERTES : ${Object.entries(alertes).map(([k, v]) => `${k} ${v}`).join(" · ") || "aucune"}`,
      ].join("\n");
    },
  },
  crm_relances: {
    description: "Relances en retard, relances à venir et prochains pas datés.",
    schema: z.object({ horizon_jours: z.number().int().min(1).max(90).optional() }),
    json: { type: "object", properties: { horizon_jours: { type: "integer" } }, additionalProperties: false },
    async run(i, ctx) {
      const [st, clubs] = await Promise.all([loadSettings(ctx.tx), loadClubs(ctx.tx)]);
      const r = R.relances(clubs, st, ctx.today, i.horizon_jours ?? 7);
      return [
        `RELANCES EN RETARD (${r.retard.length}) :`, ...r.retard.map((x) => `- dues le ${R.fr(R.toDate(x.due))} (${x.joursRetard} j) · ${ligne(st, x.club, suivi(x.club))}`),
        `RELANCES À VENIR d'ici le ${R.fr(R.toDate(r.horizon))} (${r.avenir.length}) :`, ...r.avenir.map((x) => `- le ${R.fr(R.toDate(x.due))} · ${ligne(st, x.club, suivi(x.club))}`),
        `PROCHAINS PAS DATÉS (${r.prochainsPas.length}) :`, ...r.prochainsPas.map((x) => `- le ${R.fr(R.toDate(x.date))} · ${ligne(st, x.club, ` · ${x.club.data["Prochain pas"]}`)}`),
      ].join("\n");
    },
  },
  crm_prioritaires: {
    description: "Clubs « À contacter » triés par score, avec canal, alerte et état du renseignement.",
    schema: z.object({ n: z.number().int().min(1).max(30).optional(), niveau: z.string().optional(), division: z.string().optional(), prets_seulement: z.boolean().optional() }),
    json: { type: "object", properties: { n: { type: "integer", description: "Nombre de clubs (défaut 10, max 30)" }, niveau: { type: "string" }, division: { type: "string" }, prets_seulement: { type: "boolean" } }, additionalProperties: false },
    async run(i, ctx) {
      const [st, clubs] = await Promise.all([loadSettings(ctx.tx), loadClubs(ctx.tx)]);
      let c = clubs.filter((x) => x.data["Statut"] === "À contacter");
      if (i.niveau) c = c.filter((x) => R.normaliser(x.data["Niveau"]).includes(R.normaliser(i.niveau)));
      if (i.division) c = c.filter((x) => R.normaliser(x.data["Divisions"]).includes(R.normaliser(i.division)));
      if (i.prets_seulement) c = c.filter((x) => R.pretAEnvoyer(x.data));
      c.sort((a, b) => (Number(b.data["Score /10"]) || 0) - (Number(a.data["Score /10"]) || 0) || a.id - b.id);
      const top = c.slice(0, i.n ?? 10);
      const lignes = [];
      for (const x of top) {
        const al = R.alerte(x.data);
        lignes.push(`- ${ligne(st, x, ` · ${R.contactAUtiliser(x.data) || "NON JOIGNABLE"} · ${await statutIntel(ctx.tx, x.id, ctx.today)}${al ? ` · ⚠ ${al}` : ""}`)}\n    angle : ${x.data["Angle commercial dominant"] ?? "—"}`);
      }
      return [`À CONTACTER — ${c.length} clubs correspondent ; top ${top.length} par score :`, ...lignes].join("\n");
    },
  },
  crm_chercher: {
    description: "Retrouver un club par nom approximatif, @instagram ou ID. Signale les résultats ambigus.",
    schema: z.object({ texte: z.string().min(1) }),
    json: { type: "object", properties: { texte: { type: "string" } }, required: ["texte"], additionalProperties: false },
    async run(i, ctx) {
      const [st, clubs] = await Promise.all([loadSettings(ctx.tx), loadClubs(ctx.tx)]);
      const res = R.chercher(clubs, i.texte, 8);
      if (!res.length) return `Aucun club ne correspond à « ${i.texte} ».`;
      const out = res.map((r) => `${String(r.score).padStart(3)} %  ${ligne(st, r.club, ` · ${r.club.data["Instagram exact"] ?? ""}`)}`);
      out.push(R.estAmbigu(res) ? "⚠ AMBIGU : plusieurs correspondances proches ou correspondance faible. Faire confirmer l'ID avant toute action." : `Meilleure correspondance : ID ${res[0].club.id} (${res[0].club.data["Club"]}).`);
      return out.join("\n");
    },
  },
  crm_fiche: {
    description: "Fiche complète d'un club : données, historique, notes datées, valeurs calculées, état du renseignement, journal des modifications.",
    schema: z.object({ club_id: z.number().int() }),
    json: { type: "object", properties: { club_id: { type: "integer" } }, required: ["club_id"], additionalProperties: false },
    async run(i, ctx) {
      const st = await loadSettings(ctx.tx);
      const c = await getClub(ctx.tx, i.club_id);
      if (!c) return `Aucun club avec l'ID ${i.club_id}.`;
      const out = [`FICHE — [ID ${c.id}] ${c.data["Club"]}`];
      for (const k of CHAMPS_FICHE) {
        let v = c.data[k];
        if (["Date 1er contact", "Dernier contact"].includes(k)) v = R.fr(R.toDate(v));
        if (v !== null && v !== undefined && v !== "") out.push(`- ${k} : ${v}`);
      }
      const due = R.relanceDue(c.data, st);
      out.push(`Calculé : priorité ${R.priorite(c.data, st) || "—"} · joignable ${R.joignable(c.data) ? "oui" : "non"} · contact à utiliser ${R.contactAUtiliser(c.data) || "—"} · prêt à envoyer ${R.pretAEnvoyer(c.data) ? "oui" : "non"}`);
      if (due) out.push(`Relance due le ${R.fr(due)}${due <= ctx.today ? " (EN RETARD)" : ""}`);
      const al = R.alerte(c.data);
      if (al) out.push(`Alerte : ${al}`);
      out.push(`Renseignement : ${await statutIntel(ctx.tx, c.id, ctx.today)}`);
      const j = await clubJournal(ctx.tx, c.id, 10);
      if (j.length) out.push("Journal des modifications validées :", ...j.map((e) => `- ${e.created_at.toISOString().slice(0, 10)} · ${e.kind} · ${e.summary ?? ""}`));
      return out.join("\n");
    },
  },
  crm_qualite: {
    description: "Doublons possibles, incohérences de suivi et informations manquantes.",
    schema: z.object({}),
    json: { type: "object", properties: {}, additionalProperties: false },
    async run(_i, ctx) {
      const clubs = await loadClubs(ctx.tx);
      const q = R.qualite(clubs, ctx.today);
      const m = q.manquants;
      return [
        "DOUBLONS POSSIBLES (à vérifier, rien n'est fusionné automatiquement) :",
        ...(q.doublons.length ? q.doublons.map((d) => `- même ${d.critere} : ${d.clubs.map((c) => `ID ${c.id} ${c.data["Club"]} (${c.data["Statut"]})`).join(" | ")}`) : ["- aucun"]),
        "INCOHÉRENCES DE SUIVI :",
        ...(q.incoherences.length ? q.incoherences.map((x) => `- ID ${x.club.id} ${x.club.data["Club"]} (${x.club.data["Statut"]}) : ${x.problemes.join(" ; ")}`) : ["- aucune"]),
        `INFORMATIONS MANQUANTES (« À contacter ») : non joignables ${m.nonJoignables} · sans message ${m.sansMessage} · [Prénom] à compléter ${m.prenomACompleter} · sans interlocuteur ${m.sansInterlocuteur} · canal « À vérifier » ${m.canalAVerifier}`,
      ].join("\n");
    },
  },
  crm_proposer_mise_a_jour: {
    description:
      "Prépare une mise à jour du CRM (premier contact, relance, réponse reçue, rdv, devis, client, sans suite, note, prochain pas, statut, info). Les règles de l'onglet Listes sont appliquées. RIEN n'est écrit : la proposition apparaît dans « Actions à valider » et n'est appliquée que si Timothé la valide.",
    schema: z.object({
      club_id: z.number().int(), nom_attendu: z.string().min(2), type: z.enum(R.TYPES_MAJ),
      date: z.string().optional(), canal: z.string().optional(), resume: z.string().optional(), sentiment: z.string().optional(),
      prochain_pas: z.string().optional(), date_prochain_pas: z.string().optional(), statut: z.string().optional(),
      champ: z.string().optional(), valeur: z.string().optional(), source: z.string().optional(),
      remplacer: z.boolean().optional(), forcer: z.boolean().optional(),
    }),
    json: {
      type: "object",
      properties: {
        club_id: { type: "integer", description: "ID du club (colonne ID)" },
        nom_attendu: { type: "string", description: "Fragment du nom du club (contrôle d'identité)" },
        type: { type: "string", enum: [...R.TYPES_MAJ] },
        date: { type: "string", description: "Date de l'interaction JJ/MM/AAAA (défaut : aujourd'hui)" },
        canal: { type: "string", description: "Instagram, Facebook, Email, Téléphone ou Autre" },
        resume: { type: "string", description: "Uniquement les mots de Timothé ou le texte exact reçu" },
        sentiment: { type: "string", enum: [...R.SENTIMENTS] },
        prochain_pas: { type: "string" }, date_prochain_pas: { type: "string", description: "JJ/MM/AAAA" },
        statut: { type: "string", description: "Pour type=statut : valeur de l'onglet Listes" },
        champ: { type: "string", description: `Pour type=info : ${R.CHAMPS_INFO.join(", ")}` },
        valeur: { type: "string" }, source: { type: "string", description: "Origine de l'information (obligatoire pour type=info)" },
        remplacer: { type: "boolean", description: "Écraser une valeur existante (type=info), uniquement sur demande explicite de Timothé" },
        forcer: { type: "boolean", description: "Club « À qualifier » réellement contacté, uniquement sur confirmation explicite de Timothé" },
      },
      required: ["club_id", "nom_attendu", "type"],
      additionalProperties: false,
    },
    async run(i, ctx) {
      const st = await loadSettings(ctx.tx);
      const c = await getClub(ctx.tx, i.club_id);
      if (!c) return `ÉCHEC : aucun club avec l'ID ${i.club_id}.`;
      const nom = R.normaliser(i.nom_attendu);
      if (!nom || !R.normaliser(c.data["Club"]).includes(nom)) {
        return `ÉCHEC : contrôle d'identité — l'ID ${i.club_id} correspond à « ${c.data["Club"]} », pas à « ${i.nom_attendu} ». Rien n'a été proposé.`;
      }
      let plan;
      try {
        plan = R.planifier(c.data, i, st, ctx.today);
      } catch (e) {
        if (e instanceof R.CrmError) return `ÉCHEC : ${e.message}`;
        throw e;
      }
      if (!Object.keys(plan.changes).length) return "Aucune modification nécessaire (valeurs déjà à jour). Rien n'a été proposé.";
      const lignes = Object.entries(plan.changes).map(([k, v]) => {
        let av = c.data[k];
        if (["Date 1er contact", "Dernier contact"].includes(k)) { av = R.fr(R.toDate(av)); v = R.fr(R.toDate(v)); }
        return { champ: k, avant: av === null || av === undefined || av === "" ? "(vide)" : String(av), apres: String(v) };
      });
      const titre = `${c.data["Club"]} — ${i.type}${i.canal ? ` (${i.canal})` : ""}`;
      const [a] = await ctx.tx<{ id: string }[]>`
        insert into actions (task_id, root_id, conversation_id, agent_id, kind, status, club_id, title, payload)
        values (${ctx.taskId}, ${ctx.rootId}, ${ctx.conversationId}, ${ctx.agentId}, 'crm_update', 'pending', ${c.id}, ${titre},
                ${ctx.tx.json({ demande: i, changes: plan.changes, lignes, avertissements: plan.avertissements, expectedVersion: c.version, club: c.data["Club"] } as never)})
        returning id`;
      return [
        `PROPOSITION ENREGISTRÉE (action ${a.id.slice(0, 8)}) — en attente de validation par Timothé. RIEN N'EST ÉCRIT dans le CRM pour l'instant.`,
        `Club : [ID ${c.id}] ${c.data["Club"]} · statut actuel « ${c.data["Statut"]} »`,
        ...lignes.map((l) => `- ${l.champ} : « ${l.avant} » → « ${l.apres} »`),
        ...plan.avertissements.map((w) => `⚠ ${w}`),
      ].join("\n");
    },
  },
  intel_lire: {
    description: "Dernier dossier de renseignement de Jojo pour un club, avec sa fraîcheur (≤ 30 j frais, ≤ 90 j à revérifier, au-delà périmé).",
    schema: z.object({ club_id: z.number().int() }),
    json: { type: "object", properties: { club_id: { type: "integer" } }, required: ["club_id"], additionalProperties: false },
    async run(i, ctx) {
      const [r] = await ctx.tx<{ data: unknown; verifie_le: string }[]>`
        select data, to_char(verifie_le, 'YYYY-MM-DD') as verifie_le from intel_dossiers where club_id = ${i.club_id} order by verifie_le desc, id desc limit 1`;
      if (!r) return `Aucun dossier de renseignement pour l'ID ${i.club_id}.`;
      const f = fraicheur(r.verifie_le, ctx.today);
      return `Dossier vérifié le ${r.verifie_le} — fraîcheur : ${f.label} (${f.jours} j)\n${JSON.stringify(r.data)}`;
    },
  },
  intel_enregistrer: {
    description: "Enregistre un dossier de renseignement structuré (validé automatiquement : sources, dates, top 3). Renvoie les erreurs à corriger le cas échéant.",
    schema: z.object({ dossier: z.record(z.string(), z.unknown()) }),
    json: {
      type: "object",
      properties: {
        dossier: {
          type: "object",
          description:
            "Champs : club_id, club, verifie_le (AAAA-MM-JJ), sources_consultees[{url,type,consulte_le,accessible}], faits[{id,categorie(identite|dirigeants|sportif|actualite|communication),fait,source_nom,source_url,date_fait(AAAA-MM-JJ|null),fiabilite(haute|moyenne|faible),statut(verifie|interpretation)}], interlocuteurs[{nom,role,contact_public,source_url,date}], top3[{fait_id,interet,angle,accroche}] (max 3), accroche_recommandee, objectif_personnalisation, arguments[], ne_pas_utiliser[{element,raison}], aucune_info_pertinente, limites",
        },
      },
      required: ["dossier"],
      additionalProperties: false,
    },
    async run(i, ctx) {
      const v = validerDossier(i.dossier, ctx.today);
      if (!v.dossier) return `DOSSIER NON VALIDE — corrige et renvoie :\n${v.erreurs.map((e) => `✗ ${e}`).join("\n")}`;
      const c = await getClub(ctx.tx, v.dossier.club_id);
      if (!c) return `DOSSIER NON VALIDE : aucun club avec l'ID ${v.dossier.club_id}.`;
      await ctx.tx`insert into intel_dossiers (club_id, verifie_le, data, task_id)
                   values (${v.dossier.club_id}, ${v.dossier.verifie_le}, ${ctx.tx.json(v.dossier as never)}, ${ctx.taskId})`;
      return [`DOSSIER ENREGISTRÉ pour [ID ${c.id}] ${c.data["Club"]} (${v.dossier.faits.length} faits, ${v.dossier.top3.length} accroches).`, ...v.avertissements.map((w) => `⚠ ${w}`)].join("\n");
    },
  },
  brouillon_enregistrer: {
    description: "Enregistre un brouillon de message prêt à copier dans « Actions à valider ». Il n'est JAMAIS envoyé : Timothé le copie, l'envoie lui-même puis appuie sur « J'ai envoyé ».",
    schema: z.object({
      club_id: z.number().int(), canal: z.string().min(2), destinataire: z.string().min(1),
      type_message: z.enum(["premier-contact", "relance", "reponse", "autre"]),
      objet: z.string().optional(), texte: z.string().min(10), faits_utilises: z.array(z.string()).default([]),
    }),
    json: {
      type: "object",
      properties: {
        club_id: { type: "integer" },
        canal: { type: "string", description: "Instagram, Facebook, Email, Téléphone (SMS) ou Autre (LinkedIn…)" },
        destinataire: { type: "string", description: "Compte ou adresse issu de la fiche (ex. @club, email du club)" },
        type_message: { type: "string", enum: ["premier-contact", "relance", "reponse", "autre"] },
        objet: { type: "string", description: "Objet (email uniquement)" },
        texte: { type: "string", description: "Message final prêt à copier-coller" },
        faits_utilises: { type: "array", items: { type: "string" }, description: "Faits utilisés et leur source (URL ou colonne de la fiche)" },
      },
      required: ["club_id", "canal", "destinataire", "type_message", "texte"],
      additionalProperties: false,
    },
    async run(i, ctx) {
      const c = await getClub(ctx.tx, i.club_id);
      if (!c) return `ÉCHEC : aucun club avec l'ID ${i.club_id}.`;
      if (c.data["Statut"] === "Exclu") return `ÉCHEC : ${c.data["Club"]} est « Exclu » (jamais de message). Brouillon non enregistré.`;
      if (/\[Pr[ée]nom\]/i.test(i.texte)) return "ÉCHEC : le texte contient « [Prénom] ». Utilise « Bonjour, » si le prénom est inconnu.";
      const titre = `${c.data["Club"]} — ${i.type_message} (${i.canal})`;
      const [a] = await ctx.tx<{ id: string }[]>`
        insert into actions (task_id, root_id, conversation_id, agent_id, kind, status, club_id, title, payload)
        values (${ctx.taskId}, ${ctx.rootId}, ${ctx.conversationId}, ${ctx.agentId}, 'message_draft', 'pending', ${c.id}, ${titre},
                ${ctx.tx.json({ ...i, club: c.data["Club"] } as never)})
        returning id`;
      return `BROUILLON ENREGISTRÉ (action ${a.id.slice(0, 8)}) pour [ID ${c.id}] ${c.data["Club"]} — visible dans « Actions à valider ». Il n'est pas envoyé.`;
    },
  },
};

export const DELEGATE_TOOL = {
  name: "deleguer",
  description:
    "Confie une tâche à un agent spécialisé (popi = CRM, jojo = recherche web sur un club, bililou = rédaction de brouillons). L'agent ne voit pas la conversation : la consigne doit être autonome (objectif, club(s) avec ID, données utiles, contraintes, format de retour). Si Timothé a joint des captures d'écran utiles à la tâche (ex. réponse Instagram d'un club), transmets-les avec `captures`. Plusieurs délégations dans le même tour s'exécutent en parallèle.",
  schema: z.object({
    agent: z.enum(["popi", "jojo", "bililou"]),
    consigne: z.string().min(10),
    captures: z.array(z.string().min(4)).max(5).optional(),
  }),
  json: {
    type: "object",
    properties: {
      agent: { type: "string", enum: ["popi", "jojo", "bililou"] },
      consigne: { type: "string" },
      captures: { type: "array", items: { type: "string" }, description: "Identifiants des captures à transmettre (ex. « a1b2c3d4 », tels qu'indiqués dans le message de Timothé)" },
    },
    required: ["agent", "consigne"],
    additionalProperties: false,
  },
};

/** Définitions d'outils envoyées à l'API pour un agent (ordre stable = cache efficace). */
export function toolDefinitions(names: string[], web: boolean, recentWeb = true): Anthropic.Beta.BetaToolUnion[] {
  const defs: Anthropic.Beta.BetaToolUnion[] = names.map((n) => {
    const d = n === "deleguer" ? DELEGATE_TOOL : { ...TOOLS[n], name: n };
    return { name: n, description: d.description, input_schema: d.json as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true };
  });
  if (web && recentWeb) {
    defs.push({ type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } });
    defs.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 });
  } else if (web) {
    // Modèles sans filtrage dynamique (ex. Haiku) : versions de base des outils web.
    defs.push({ type: "web_search_20250305", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } });
    defs.push({ type: "web_fetch_20250910", name: "web_fetch", max_uses: 8 });
  }
  return defs;
}
