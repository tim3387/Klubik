// Décisions de Timothé sur les actions proposées par les agents.
import type { Sql } from "./db";
import { applyChanges, getClub, loadSettings } from "./crm/repo";
import { CrmError, fr, planifier, todayUtc, toDate, type ClubData, type DemandeMaj } from "./crm/rules";

export type Decision = "approve" | "reject" | "sent";

interface ActionRow {
  id: string;
  kind: "crm_update" | "message_draft";
  status: string;
  club_id: number | null;
  conversation_id: string | null;
  agent_id: string;
  title: string;
  payload: Record<string, any>;
}

async function note(sql: Sql, a: ActionRow, content: string) {
  if (a.conversation_id) {
    await sql`insert into chat_messages (conversation_id, role, agent_id, content, meta)
              values (${a.conversation_id}, 'event', 'popi', ${content}, ${sql.json({ action_id: a.id } as never)})`;
  }
}

export async function decide(sql: Sql, actionId: string, decision: Decision): Promise<{ ok: boolean; message: string }> {
  const [a] = await sql<ActionRow[]>`select id, kind, status, club_id, conversation_id, agent_id, title, payload from actions where id = ${actionId}`;
  if (!a) return { ok: false, message: "Action introuvable." };
  if (a.status !== "pending") return { ok: false, message: `Action déjà traitée (${a.status}).` };

  if (decision === "reject") {
    await sql`update actions set status = 'rejected', decided_at = now() where id = ${a.id} and status = 'pending'`;
    await note(sql, a, `✗ Refusé par Timothé : ${a.title}`);
    return { ok: true, message: "Action refusée. Rien n'a été modifié." };
  }

  if (a.kind === "crm_update" && decision === "approve") {
    try {
      const r = await applyChanges(sql, {
        clubId: a.club_id!, expectedVersion: a.payload.expectedVersion, changes: a.payload.changes as ClubData,
        kind: a.payload.demande?.type ?? "maj", summary: a.title, actionId: a.id,
      });
      await sql`update actions set status = 'applied', decided_at = now(), result = ${sql.json(r as never)} where id = ${a.id}`;
      await note(sql, a, `✓ CRM mis à jour et vérifié (relecture) : ${a.title}`);
      return { ok: true, message: "Mise à jour appliquée et vérifiée." };
    } catch (e) {
      const msg = e instanceof CrmError ? e.message : `Erreur : ${e instanceof Error ? e.message : String(e)}`;
      await sql`update actions set status = 'failed', decided_at = now(), result = ${sql.json({ error: msg } as never)} where id = ${a.id}`;
      await note(sql, a, `⚠ Mise à jour non appliquée : ${msg}`);
      return { ok: false, message: msg };
    }
  }

  if (a.kind === "message_draft" && decision === "sent") {
    // Timothé confirme avoir envoyé le message lui-même : on enregistre l'interaction (règles de l'onglet Listes).
    const club = await getClub(sql, a.club_id!);
    if (!club) return { ok: false, message: "Club introuvable." };
    const st = await loadSettings(sql);
    const p = a.payload;
    const statut = String(club.data["Statut"] ?? "");
    const canal = st.canauxEnvoi.includes(p.canal) ? p.canal : "Autre";
    const extrait = `${p.objet ? `${p.objet} — ` : ""}${String(p.texte).slice(0, 90)}${String(p.texte).length > 90 ? "…" : ""}`;
    let dm: DemandeMaj;
    if (p.type_message === "reponse" || p.type_message === "autre") dm = { type: "note", resume: `message envoyé (${canal}) : « ${extrait} »` };
    else if (["Contacté", "Relancé"].includes(statut)) dm = { type: "relance", canal, resume: `« ${extrait} »` };
    else dm = { type: "premier-contact", canal, resume: `« ${extrait} »` };
    try {
      const plan = planifier(club.data, dm, st, todayUtc());
      const r = await applyChanges(sql, { clubId: club.id, expectedVersion: club.version, changes: plan.changes, kind: dm.type, summary: `Envoi confirmé : ${a.title}`, actionId: a.id });
      await sql`update actions set status = 'sent', decided_at = now(), result = ${sql.json({ ...r, type: dm.type } as never)} where id = ${a.id}`;
      const due = r.after["Action maintenant"] ? ` · ${r.after["Action maintenant"]}` : "";
      await note(sql, a, `✓ Envoi enregistré dans le CRM le ${fr(todayUtc())} (${dm.type}, ${canal})${due}`);
      return { ok: true, message: `Envoi enregistré dans le CRM (${dm.type}).` };
    } catch (e) {
      const msg = e instanceof CrmError ? e.message : `Erreur : ${e instanceof Error ? e.message : String(e)}`;
      await note(sql, a, `⚠ Envoi non enregistré dans le CRM : ${msg}`);
      return { ok: false, message: msg };
    }
  }
  return { ok: false, message: "Décision non applicable à ce type d'action." };
}

export const dateFr = (v: unknown) => fr(toDate(v));
