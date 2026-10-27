// Sauvegardes : chiffrement, copie externe vérifiée, restauration du CRM, reconstruction complète d'une base perdue.
// Variables : KLUBIK_TEST_DB et KLUBIK_TEST_DB2 (bases jetables, ENTIÈREMENT VIDÉES), KLUBIK_XLSX (fichier réel),
// KLUBIK_TEST_S3 (point d'accès S3 de test, ex. moto_server : http://localhost:5055).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB = process.env.KLUBIK_TEST_DB ?? "";
const DB2 = process.env.KLUBIK_TEST_DB2 ?? "";
const XLSX = process.env.KLUBIK_XLSX ?? "";
const S3 = process.env.KLUBIK_TEST_S3 ?? "";
const dispo = !!DB && !!DB2 && !!S3 && !!XLSX && existsSync(XLSX);
const KEY = Buffer.alloc(32, 7).toString("base64");
if (dispo) {
  Object.assign(process.env, {
    DATABASE_URL: DB, BACKUP_KEY: KEY, BACKUP_S3_ENDPOINT: S3, BACKUP_S3_REGION: "us-east-1",
    BACKUP_S3_BUCKET: `klubik-test-${Date.now()}`, BACKUP_S3_KEY_ID: "test", BACKUP_S3_SECRET: "test",
  });
}

describe.skipIf(!dispo)("sauvegardes chiffrées et restauration", () => {
  let sql: import("@/lib/db").Sql;
  let sql2: postgres.Sql;
  let B: typeof import("@/lib/backup");
  let repo: typeof import("@/lib/crm/repo");
  const schema = () => readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const clubsOf = async (s: postgres.Sql) => new Map((await s<{ id: number; data: unknown }[]>`select id, data from crm_clubs`).map((r) => [r.id, JSON.stringify(r.data)]));

  beforeAll(async () => {
    // Seau de test sur l'émulateur S3.
    await new AwsClient({ accessKeyId: "test", secretAccessKey: "test", service: "s3", region: "us-east-1" })
      .fetch(`${S3}/${process.env.BACKUP_S3_BUCKET}`, { method: "PUT" });
    sql = (await import("@/lib/db")).getSql();
    sql2 = postgres(DB2, { ssl: false, prepare: false, onnotice: () => {} });
    for (const s of [sql, sql2]) {
      await s.unsafe("drop schema public cascade; create schema public;");
      await s.unsafe(schema());
    }
    B = await import("@/lib/backup");
    repo = await import("@/lib/crm/repo");
    const { parseWorkbook } = await import("@/lib/crm/xlsx-import");
    const wb = await parseWorkbook(readFileSync(XLSX), path.basename(XLSX));
    await repo.importWorkbook(sql, wb, readFileSync(XLSX).toString("base64"));
    // Un peu de vie dans l'application : une conversation, un message, une modification validée du CRM.
    const [c] = await sql<{ id: string }[]>`insert into conversations (agent_id, title) values ('kung', 'Point') returning id`;
    await sql`insert into chat_messages (conversation_id, role, content) values (${c.id}, 'user', 'Fais le point')`;
    const club = (await repo.getClub(sql, 305))!;
    await repo.applyChanges(sql, { clubId: 305, expectedVersion: club.version, changes: { "Prochain pas": "Relancer en janvier" }, kind: "prochain-pas", summary: "test", actionId: null });
  }, 120_000);

  afterAll(async () => { await sql?.end(); await sql2?.end(); });

  let premiere: number;
  const etatSauvegarde = new Map<number, string>();

  it("crée une sauvegarde chiffrée, la copie à l'extérieur et la relit pour la vérifier", async () => {
    const r = await B.runBackup(sql, "test");
    expect(r.offsite).toBe("verifiee");
    premiere = r.id;
    const [row] = await sql<{ size: number; data: Buffer; counts: Record<string, number>; offsite_key: string }[]>`select size, data, counts, offsite_key from crm_backups where id = ${r.id}`;
    expect(row.counts.crm_clubs).toBe(727);
    expect(row.counts.chat_messages).toBe(1);
    expect(Buffer.from(row.data).subarray(0, 6).toString()).toBe("KHQB1\n");
    expect(Buffer.from(row.data).toString("latin1")).not.toContain("OBJAT"); // aucun nom de club en clair
    expect(row.offsite_key).toMatch(/^klubik-hq\/\d{4}\/\d{2}\/\d{8}T\d{6}Z-test\.khqbk$/);
    console.log(`taille d'une sauvegarde complète chiffrée : ${Math.round(row.size / 1024)} Ko`);
    for (const [id, d] of await clubsOf(sql)) etatSauvegarde.set(id, d);
  }, 60_000);

  it("planifie : rien juste après, puis « après modifications » et « quotidienne »", async () => {
    expect(await B.backupDue(sql)).toBeNull();
    await sql`update crm_backups set created_at = now() - interval '2 hours'`;
    await sql`update crm_journal set created_at = created_at - interval '3 hours'`;
    expect(await B.backupDue(sql)).toBeNull(); // aucune modification du CRM depuis
    await sql`insert into crm_journal (club_id, actor, kind, summary) values (1, 'timothe', 'note', 'modif')`;
    expect(await B.backupDue(sql)).toBe("après modifications");
    await sql`update crm_backups set created_at = now() - interval '25 hours'`;
    expect(await B.backupDue(sql)).toBe("quotidienne");
  });

  it("refuse une mauvaise clé et un fichier altéré", async () => {
    const { decrypt } = await import("@/lib/backup/crypto");
    const [row] = await sql<{ data: Buffer }[]>`select data from crm_backups where id = ${premiere}`;
    const blob = Buffer.from(row.data);
    expect(() => decrypt(blob, Buffer.alloc(32, 9))).toThrow(/mauvaise clé/);
    const abime = Buffer.from(blob);
    abime[abime.length - 5] ^= 1;
    expect(() => decrypt(abime, Buffer.from(KEY, "base64"))).toThrow(/altéré/);
  });

  it("restaure le CRM après une erreur : retour exact à l'état sauvegardé, historique conservé, état actuel sauvegardé avant", async () => {
    // « Erreur » : 3 clubs modifiés après la sauvegarde + une proposition en attente.
    for (const id of [1, 2, 3]) {
      const c = (await repo.getClub(sql, id))!;
      await repo.applyChanges(sql, { clubId: id, expectedVersion: c.version, changes: { Notes: "ERREUR" }, kind: "note", summary: "erreur", actionId: null });
    }
    await sql`insert into actions (agent_id, kind, status, club_id, title, payload) values ('popi', 'crm_update', 'pending', 1, 'proposition', '{}')`;
    const journalAvant = (await sql<{ n: number }[]>`select count(*)::int as n from crm_journal`)[0].n;
    const { snap } = await B.loadSnapshot(sql, { kind: "db", id: premiere });
    const ap = await B.preview(sql, snap);
    expect(ap.clubs.modifies).toBe(3);
    const r = await B.restoreCrm(sql, snap, "test");
    expect(r.verification).toMatchObject({ ok: true, clubs: 727 });
    expect(await clubsOf(sql)).toEqual(etatSauvegarde);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from crm_journal`;
    expect(n).toBe(journalAvant + 1); // rien d'effacé, une entrée « restauration »
    const [a] = await sql<{ status: string }[]>`select status from actions where title = 'proposition'`;
    expect(a.status).toBe("failed"); // proposition préparée avant la restauration : caduque
    const [s] = await sql<{ reason: string }[]>`select reason from crm_backups where id = ${r.securite.id}`;
    expect(s.reason).toBe("avant restauration");
    // L'état « erroné » reste récupérable depuis la sauvegarde de sécurité.
    const { snap: avant } = await B.loadSnapshot(sql, { kind: "db", id: r.securite.id });
    expect(JSON.stringify(avant.tables.crm_clubs.find((c) => Number(c.id) === 1)?.data)).toContain("ERREUR");
  }, 60_000);

  it("panne totale : base neuve + restauration complète depuis le stockage externe, sans perte", async () => {
    const items = await B.listOffsite();
    expect(items.length).toBeGreaterThanOrEqual(2);
    const cible = items.find((i) => i.key.endsWith("-test.khqbk"))!;
    const { snap } = await B.loadSnapshot(sql, { kind: "offsite", key: cible.key });
    const v = await B.restoreAll(sql2 as never, snap);
    expect(v).toMatchObject({ ok: true, clubs: 727 });
    expect(await clubsOf(sql2)).toEqual(etatSauvegarde);
    const [cnt] = await sql2<{ m: number; j: number; a: number }[]>`
      select (select count(*)::int from chat_messages) as m, (select count(*)::int from crm_journal) as j, (select count(*)::int from crm_import_archive) as a`;
    expect(cnt.m).toBe(1);
    expect(cnt.j).toBe(snap.counts.crm_journal + 1);
    expect(cnt.a).toBe(1); // archive du fichier d'origine : l'export Excel fonctionne encore
    // Les séquences sont recalées : l'application peut écrire normalement.
    await sql2`insert into crm_journal (club_id, actor, kind, summary) values (1, 'timothe', 'note', 'après restauration')`;
    await sql2`insert into chat_messages (conversation_id, role, content) select id, 'user', 'ok' from conversations limit 1`;
    await expect(B.restoreAll(sql2 as never, snap)).rejects.toThrow(/pas vide/);
  }, 60_000);

  it("secours sans l'application : le script déchiffre une sauvegarde en CSV lisible", async () => {
    const [row] = await sql<{ data: Buffer }[]>`select data from crm_backups where id = ${premiere}`;
    const dir = mkdtempSync(path.join(tmpdir(), "khq-"));
    writeFileSync(path.join(dir, "s.khqbk"), Buffer.from(row.data));
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/backup-decrypt.ts", path.join(dir, "s.khqbk"), path.join(dir, "out")], { env: { ...process.env, BACKUP_KEY: KEY } });
    const csv = readFileSync(path.join(dir, "out", "clubs.csv"), "utf8").split("\r\n");
    expect(csv.length).toBe(728);
    expect(csv[0]).toContain("Club");
  });

  it("garde au plus 30 copies en base (les plus anciennes restent dans le stockage externe)", async () => {
    await sql`insert into crm_backups (reason, size, sha256, counts, key_fingerprint, data)
              select 'ancienne', 1, 'x', '{}'::jsonb, 'x', '\\x00'::bytea from generate_series(1, 35)`;
    await B.runBackup(sql, "test");
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from crm_backups where data is not null`;
    expect(n).toBe(B.DB_RETENTION);
  }, 60_000);
});
