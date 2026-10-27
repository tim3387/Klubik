// Diagnostic du serveur : utile juste après le déploiement et en cas de doute.
import { backupKey, fingerprint } from "./backup/crypto";
import { s3Config } from "./backup/s3";
import { getSql } from "./db";
import { health } from "./maintenance";

export async function diagnostic() {
  const h = health();
  const mem = process.memoryUsage();
  const mo = (n: number) => Math.round(n / 1024 / 1024);
  let db: Record<string, unknown>;
  try {
    const t0 = Date.now();
    const sql = getSql();
    const [r] = await sql<{ size: string; clubs: number; open: number; last_backup: Date | null; offsite_ok: Date | null; offsite_error: string | null }[]>`
      select pg_size_pretty(pg_database_size(current_database())) as size,
             (select count(*)::int from crm_clubs) as clubs,
             (select count(*)::int from tasks where status in ('ready', 'running', 'waiting')) as open,
             b.created_at as last_backup, b.offsite_verified_at as offsite_ok, b.offsite_error
      from (select 1) x left join lateral (select * from crm_backups order by id desc limit 1) b on true`;
    db = { ok: true, latenceMs: Date.now() - t0, taille: r.size, clubs: r.clubs, tachesOuvertes: r.open, derniereSauvegarde: r.last_backup, copieExterneVerifiee: r.offsite_ok, erreurCopieExterne: r.offsite_error };
  } catch (e) {
    db = { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
  let cle: string | null = null;
  try { const k = backupKey(); cle = k ? fingerprint(k) : null; } catch (e) { cle = `invalide : ${(e as Error).message}`; }
  return {
    serveur: {
      demarreLe: new Date(h.startedAt).toISOString(),
      memoireMo: { rss: mo(mem.rss), tas: mo(mem.heapUsed), tasMax: mo(mem.heapTotal) },
      node: process.version,
      moteurActifIlYaS: h.workerTick ? Math.round((Date.now() - h.workerTick) / 1000) : null,
      maintenanceIlYaS: h.maintenanceTick ? Math.round((Date.now() - h.maintenanceTick) / 1000) : null,
      derniereErreurMaintenance: h.lastError,
    },
    base: db,
    configuration: {
      cleApiClaude: !!process.env.ANTHROPIC_API_KEY,
      cleSauvegarde: cle,
      stockageExterne: s3Config() ? `${s3Config()!.endpoint} / ${s3Config()!.bucket}` : null,
    },
  };
}
