// Accès au CRM en base : lecture, import initial, écriture vérifiée et journalisée.
import type { Q, Sql } from "../db";
import type { ParsedWorkbook } from "./xlsx-import";
import { CrmError, type Club, type ClubData, type CrmSettings } from "./rules";

export async function loadSettings(sql: Q): Promise<CrmSettings> {
  const rows = await sql<{ value: CrmSettings }[]>`select value from crm_settings where key = 'listes'`;
  if (!rows.length) throw new CrmError("CRM non initialisé : importe d'abord le fichier de prospection (page Réglages).");
  return rows[0].value;
}

export async function loadClubs(sql: Q): Promise<Club[]> {
  const rows = await sql<{ id: number; data: ClubData; version: number }[]>`select id, data, version from crm_clubs order by id`;
  return rows.map((r) => ({ id: r.id, data: r.data, version: r.version }));
}

export async function getClub(sql: Q, id: number): Promise<Club | null> {
  const rows = await sql<{ id: number; data: ClubData; version: number }[]>`select id, data, version from crm_clubs where id = ${id}`;
  return rows[0] ?? null;
}

export async function crmCount(sql: Q): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from crm_clubs`;
  return r.n;
}

/** Import initial : refusé si la base contient déjà des clubs (la base est alors la source officielle). */
export async function importWorkbook(sql: Sql, wb: ParsedWorkbook, fileBase64: string | null) {
  return sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from crm_clubs`;
    if (n > 0) throw new CrmError(`La base contient déjà ${n} clubs : import refusé pour ne rien écraser.`);
    await tx`insert into crm_import_archive (source_name, source_sha256, sheets, file_base64)
             values (${wb.sourceName}, ${wb.sha256}, ${tx.json(wb.sheets as never)}, ${fileBase64})`;
    for (const c of wb.clubs) {
      await tx`insert into crm_clubs (id, data) values (${c.id}, ${tx.json(c.data as never)})`;
    }
    await tx`insert into crm_settings (key, value) values ('listes', ${tx.json(wb.settings as never)})
             on conflict (key) do update set value = excluded.value`;
    await tx`insert into crm_settings (key, value) values ('colonnes', ${tx.json({ headers: wb.headers, calculees: wb.formulaHeaders } as never)})
             on conflict (key) do update set value = excluded.value`;
    await tx`insert into crm_journal (club_id, actor, kind, summary)
             values (0, 'import', 'import', ${`Import de ${wb.sourceName} (${wb.clubs.length} clubs, empreinte ${wb.sha256.slice(0, 12)})`})`;
    return { clubs: wb.clubs.length };
  });
}

/** Relit la base et la compare au fichier analysé : chaque club, chaque colonne. */
export async function verifyImport(sql: Sql, wb: ParsedWorkbook) {
  const db = new Map((await loadClubs(sql)).map((c) => [c.id, c.data]));
  const ecarts: string[] = [];
  for (const c of wb.clubs) {
    const d = db.get(c.id);
    if (!d) { ecarts.push(`club ${c.id} absent`); continue; }
    for (const [k, v] of Object.entries(c.data)) {
      if (JSON.stringify(d[k] ?? null) !== JSON.stringify(v ?? null)) ecarts.push(`club ${c.id} · ${k}`);
    }
  }
  if (db.size !== wb.clubs.length) ecarts.push(`nombre de clubs : base ${db.size} ≠ fichier ${wb.clubs.length}`);
  return { ok: ecarts.length === 0, clubs: db.size, ecarts: ecarts.slice(0, 50) };
}

/**
 * Applique des modifications validées par Timothé. Verrou optimiste sur la version :
 * si le club a changé depuis la proposition, rien n'est écrit. Relecture + journal dans la même transaction.
 */
export async function applyChanges(
  sql: Sql,
  args: { clubId: number; expectedVersion: number; changes: ClubData; kind: string; summary: string; actionId: string | null },
) {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ data: ClubData; version: number }[]>`select data, version from crm_clubs where id = ${args.clubId} for update`;
    if (!row) throw new CrmError(`Club ${args.clubId} introuvable.`);
    if (row.version !== args.expectedVersion) {
      throw new CrmError("La fiche a été modifiée depuis cette proposition : rien n'a été écrit. Demande une nouvelle proposition à Popi.");
    }
    const before: ClubData = {};
    for (const k of Object.keys(args.changes)) before[k] = row.data[k] ?? null;
    const [after] = await tx<{ data: ClubData; version: number }[]>`
      update crm_clubs set data = data || ${tx.json(args.changes as never)}, version = version + 1, updated_at = now()
      where id = ${args.clubId} returning data, version`;
    for (const [k, v] of Object.entries(args.changes)) {
      if (JSON.stringify(after.data[k] ?? null) !== JSON.stringify(v ?? null)) throw new CrmError(`Vérification échouée sur « ${k} » : annulation.`);
    }
    await tx`insert into crm_journal (club_id, actor, kind, summary, before, after, action_id)
             values (${args.clubId}, 'timothe', ${args.kind}, ${args.summary}, ${tx.json(before as never)}, ${tx.json(args.changes as never)}, ${args.actionId})`;
    return { before, after: args.changes, version: after.version };
  });
}

export async function clubJournal(sql: Q, clubId: number, limit = 20) {
  return sql<{ created_at: Date; kind: string; summary: string | null; after: ClubData | null }[]>`
    select created_at, kind, summary, after from crm_journal where club_id = ${clubId} order by id desc limit ${limit}`;
}
