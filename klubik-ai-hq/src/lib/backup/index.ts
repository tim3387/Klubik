// Sauvegardes automatiques du CRM et des données de l'application.
//  · Contenu : CRM (clubs, réglages, journal, archive d'import), dossiers de Jojo, conversations, missions,
//    actions, coûts, réglages. Exclus : mots de passe/appareils (à refaire via /setup), contenu des captures
//    (seulement leurs métadonnées), transcriptions internes des missions (volumineuses, sans utilité après coup).
//  · Chiffrée (AES-256-GCM), copiée en base (restauration rapide) et dans un stockage externe S3 (perte de la base),
//    puis relue et déchiffrée pour vérification.
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Q, Sql } from "../db";
import { backupKey, decrypt, encrypt, fingerprint } from "./crypto";
import { getObject, listObjects, putObject, s3Config, type S3Item } from "./s3";

export const FORMAT = "klubik-hq-backup";
export const DB_RETENTION = 30; // copies conservées en base (les plus récentes)

/** Tables sauvegardées, dans l'ordre de restauration (dépendances d'abord). */
const TABLES: { name: string; select: string; restoreCols?: string[] }[] = [
  { name: "app_settings", select: "select key, value, updated_at from app_settings" },
  { name: "crm_settings", select: "select key, value from crm_settings" },
  { name: "crm_import_archive", select: "select * from crm_import_archive order by id" },
  { name: "crm_clubs", select: "select id, data, version, updated_at from crm_clubs order by id" },
  { name: "crm_journal", select: "select * from crm_journal order by id" },
  { name: "intel_dossiers", select: "select id, club_id, verifie_le::text as verifie_le, data, task_id, created_at from intel_dossiers order by id" },
  { name: "conversations", select: "select * from conversations order by created_at" },
  { name: "chat_messages", select: "select * from chat_messages order by id" },
  {
    name: "tasks",
    select: `select id, root_id, parent_id, parent_tool_use_id, conversation_id, agent_id, title, input, status,
             '[]'::jsonb as transcript, '[]'::jsonb as pending_results, result, error, steps, attempts, not_before,
             null::timestamptz as locked_until, cost_usd, created_at, updated_at, finished_at, model, deep
             from tasks order by created_at`,
  },
  { name: "actions", select: "select * from actions order by created_at" },
  { name: "attachments", select: "select id, conversation_id, message_id, media_type, size, sha256, null::bytea as bytes, created_at from attachments order by created_at" },
  { name: "usage_log", select: "select * from usage_log order by id" },
];

export interface Snapshot {
  format: typeof FORMAT;
  version: 1;
  created_at: string;
  reason: string;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function takeSnapshot(sql: Q, reason: string): Promise<Snapshot> {
  const tables: Snapshot["tables"] = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = await sql.unsafe(t.select);
    tables[t.name] = rows.map((r) => ({ ...r }));
    counts[t.name] = rows.length;
  }
  return { format: FORMAT, version: 1, created_at: new Date().toISOString(), reason, counts, tables };
}

export const encode = (s: Snapshot) => gzipSync(Buffer.from(JSON.stringify(s)), { level: 9 });

export function decode(plain: Buffer): Snapshot {
  const s = JSON.parse(gunzipSync(plain).toString("utf8")) as Snapshot;
  if (s.format !== FORMAT || s.version !== 1 || !s.tables?.crm_clubs) throw new Error("Contenu de sauvegarde non reconnu.");
  return s;
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface BackupResult { id: number; size: number; offsite: "verifiee" | "non-configuree" | "echec"; error?: string }

let running = false;

/** Crée une sauvegarde complète. Ne lève pas d'erreur pour un échec du stockage externe : il est consigné et signalé. */
export async function runBackup(sql: Sql, reason: string): Promise<BackupResult> {
  const key = backupKey();
  if (!key) throw new Error("BACKUP_KEY absente : sauvegardes chiffrées impossibles (à définir chez l'hébergeur).");
  if (running) throw new Error("Une sauvegarde est déjà en cours.");
  running = true;
  try {
    const snap = await takeSnapshot(sql, reason);
    const plain = encode(snap);
    const sha = createHash("sha256").update(plain).digest("hex");
    const blob = encrypt(plain, key);
    const [row] = await sql<{ id: number }[]>`
      insert into crm_backups (reason, size, sha256, counts, key_fingerprint, data)
      values (${reason}, ${blob.length}, ${sha}, ${sql.json(snap.counts as never)}, ${fingerprint(key)}, ${blob})
      returning id::int`;
    await sql`update crm_backups set data = null where data is not null and id not in (select id from crm_backups where data is not null order by id desc limit ${DB_RETENTION})`;

    const c = s3Config();
    if (!c) return { id: row.id, size: blob.length, offsite: "non-configuree" };
    const d = snap.created_at;
    const objectKey = `${c.prefix}${d.slice(0, 4)}/${d.slice(5, 7)}/${d.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${slug(reason)}.khqbk`;
    try {
      await putObject(c, objectKey, blob);
      // Vérification : relire, déchiffrer et comparer l'empreinte.
      const back = await getObject(c, objectKey);
      const check = createHash("sha256").update(decrypt(back, key)).digest("hex");
      if (check !== sha) throw new Error("la copie relue ne correspond pas à l'original");
      await sql`update crm_backups set offsite_key = ${objectKey}, offsite_verified_at = now(), offsite_error = null where id = ${row.id}`;
      return { id: row.id, size: blob.length, offsite: "verifiee" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql`update crm_backups set offsite_key = ${objectKey}, offsite_error = ${msg.slice(0, 500)} where id = ${row.id}`;
      return { id: row.id, size: blob.length, offsite: "echec", error: msg };
    }
  } finally {
    running = false;
  }
}

/** Faut-il sauvegarder maintenant ? Toutes les 24 h, et dans l'heure qui suit une modification du CRM. */
export async function backupDue(sql: Q): Promise<string | null> {
  if (!backupKey()) return null;
  const [r] = await sql<{ last: Date | null; offsite_error: string | null; clubs: number; changed: boolean }[]>`
    select b.created_at as last, b.offsite_error,
           (select count(*)::int from crm_clubs) as clubs,
           exists (select 1 from crm_journal j where j.created_at > coalesce(b.created_at, '-infinity')) as changed
    from (select 1) x left join lateral (select created_at, offsite_error from crm_backups order by id desc limit 1) b on true`;
  if (r.clubs === 0) return null;
  if (!r.last) return "première sauvegarde";
  const age = Date.now() - new Date(r.last).getTime();
  if (age > 24 * 3600_000) return "quotidienne";
  if (r.changed && age > 3600_000) return "après modifications";
  if (r.offsite_error && age > 1800_000) return "nouvel essai (copie externe)";
  return null;
}

export interface BackupSource { kind: "db"; id: number } // ou copie externe :
export type Source = BackupSource | { kind: "offsite"; key: string };

export async function loadSnapshot(sql: Q, src: Source): Promise<{ snap: Snapshot; sha: string }> {
  const key = backupKey();
  if (!key) throw new Error("BACKUP_KEY absente : impossible de déchiffrer.");
  let blob: Buffer;
  let expected: string | null = null;
  if (src.kind === "db") {
    const [r] = await sql<{ data: Buffer | null; sha256: string; offsite_key: string | null }[]>`select data, sha256, offsite_key from crm_backups where id = ${src.id}`;
    if (!r) throw new Error("Sauvegarde introuvable.");
    expected = r.sha256;
    if (r.data) blob = Buffer.from(r.data);
    else if (r.offsite_key && s3Config()) blob = await getObject(s3Config()!, r.offsite_key);
    else throw new Error("Contenu de cette sauvegarde plus conservé en base et pas de copie externe.");
  } else {
    const c = s3Config();
    if (!c) throw new Error("Stockage externe non configuré.");
    blob = await getObject(c, src.key);
  }
  const plain = decrypt(blob, key);
  const sha = createHash("sha256").update(plain).digest("hex");
  if (expected && sha !== expected) throw new Error("Empreinte différente de celle enregistrée : sauvegarde refusée.");
  return { snap: decode(plain), sha };
}

export async function listOffsite(): Promise<S3Item[]> {
  const c = s3Config();
  return c ? listObjects(c) : [];
}

/** Compare la sauvegarde au CRM actuel (avant toute restauration). */
export async function preview(sql: Q, snap: Snapshot) {
  const current = new Map((await sql<{ id: number; data: unknown }[]>`select id, data from crm_clubs`).map((r) => [r.id, JSON.stringify(r.data)]));
  const backup = new Map(snap.tables.crm_clubs.map((r) => [Number(r.id), JSON.stringify(r.data)]));
  let identiques = 0, modifies = 0, absentsDeLaBase = 0, absentsDeLaSauvegarde = 0;
  const exemples: number[] = [];
  for (const [id, d] of backup) {
    const cur = current.get(id);
    if (cur === undefined) absentsDeLaBase++;
    else if (cur === d) identiques++;
    else { modifies++; if (exemples.length < 10) exemples.push(id); }
  }
  for (const id of current.keys()) if (!backup.has(id)) absentsDeLaSauvegarde++;
  return { date: snap.created_at, raison: snap.reason, counts: snap.counts, clubs: { identiques, modifies, absentsDeLaBase, absentsDeLaSauvegarde, exemples } };
}

async function insertRows(tx: Q, table: string, rows: Record<string, unknown>[], cols?: string[]) {
  if (!rows.length) return;
  const columns = cols ?? Object.keys(rows[0]);
  const list = columns.map((c) => `"${c}"`).join(", ");
  // jsonb_populate_recordset convertit chaque valeur JSON vers le type exact de la colonne.
  for (let i = 0; i < rows.length; i += 500) {
    await tx.unsafe(`insert into ${table} (${list}) select ${list} from jsonb_populate_recordset(null::${table}, $1::text::jsonb)`, [JSON.stringify(rows.slice(i, i + 500))] as never);
  }
}

async function resetSequences(tx: Q) {
  for (const t of ["crm_journal", "crm_import_archive", "intel_dossiers", "chat_messages", "usage_log", "crm_backups"]) {
    await tx.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), greatest(coalesce((select max(id) from ${t}), 0), 1))`);
  }
}

/** Vérifie club par club que la base correspond à la sauvegarde. */
async function verifyClubs(tx: Q, snap: Snapshot) {
  const db = new Map((await tx<{ id: number; data: unknown }[]>`select id, data from crm_clubs`).map((r) => [r.id, JSON.stringify(r.data)]));
  const ecarts = snap.tables.crm_clubs.filter((r) => db.get(Number(r.id)) !== JSON.stringify(r.data)).map((r) => Number(r.id));
  return { ok: ecarts.length === 0 && db.size === snap.tables.crm_clubs.length, clubs: db.size, ecarts: ecarts.slice(0, 20) };
}

/**
 * Restaure le CRM (clubs et réglages) tel qu'il était dans la sauvegarde. Une sauvegarde de l'état actuel est
 * faite AVANT. Le journal et les dossiers récents sont conservés (rien n'est effacé de l'historique).
 */
export async function restoreCrm(sql: Sql, snap: Snapshot, label: string) {
  const securite = await runBackup(sql, "avant restauration");
  const verification = await sql.begin(async (tx) => {
    const versions = new Map((await tx<{ id: number; version: number }[]>`select id, version from crm_clubs`).map((r) => [r.id, r.version]));
    await tx`delete from crm_clubs`;
    // Versions augmentées : toute proposition préparée avant la restauration devient caduque.
    await insertRows(tx, "crm_clubs", snap.tables.crm_clubs.map((r) => ({
      ...r, version: Math.max(versions.get(Number(r.id)) ?? 0, Number(r.version) || 1) + 1, updated_at: new Date().toISOString(),
    })), ["id", "data", "version", "updated_at"]);
    await tx`delete from crm_settings`;
    await insertRows(tx, "crm_settings", snap.tables.crm_settings);
    for (const t of ["crm_import_archive", "crm_journal", "intel_dossiers"]) {
      const ids = new Set((await tx.unsafe(`select id from ${t}`)).map((r) => Number(r.id)));
      await insertRows(tx, t, snap.tables[t].filter((r) => !ids.has(Number(r.id))));
    }
    await resetSequences(tx);
    await tx`update actions set status = 'failed', decided_at = now(), result = ${tx.json({ error: "Annulée : le CRM a été restauré depuis une sauvegarde." } as never)}
             where status = 'pending' and kind = 'crm_update'`;
    await tx`insert into crm_journal (club_id, actor, kind, summary)
             values (0, 'timothe', 'restauration', ${`CRM restauré depuis la sauvegarde du ${label} (${snap.tables.crm_clubs.length} clubs)`})`;
    return verifyClubs(tx, snap);
  });
  return { securite, verification };
}

/** Restauration complète dans une base vide (ex. nouvelle base après une panne). */
export async function restoreAll(sql: Sql, snap: Snapshot) {
  return sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select (select count(*) from crm_clubs) + (select count(*) from conversations) as n`;
    if (Number(n) > 0) throw new Error("La base n'est pas vide : utilise la restauration du CRM.");
    for (const t of TABLES) {
      let rows = snap.tables[t.name] ?? [];
      if (t.name === "tasks") rows = rows.map((r) => (["ready", "running", "waiting"].includes(String(r.status))
        ? { ...r, status: "failed", error: "Interrompue : base restaurée depuis une sauvegarde." } : r));
      if (t.name === "app_settings") await tx`delete from app_settings`;
      await insertRows(tx, t.name, rows, t.name === "crm_clubs" ? ["id", "data", "version", "updated_at"] : undefined);
    }
    await resetSequences(tx);
    await tx`insert into crm_journal (club_id, actor, kind, summary)
             values (0, 'timothe', 'restauration', ${`Base complète restaurée depuis la sauvegarde du ${snap.created_at} (${snap.tables.crm_clubs.length} clubs)`})`;
    return verifyClubs(tx, snap);
  });
}
