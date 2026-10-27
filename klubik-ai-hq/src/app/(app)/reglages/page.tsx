import BackupPanel, { type BackupRow } from "@/components/BackupPanel";
import CostSettings from "@/components/CostSettings";
import CrmCompare from "@/components/CrmCompare";
import CrmImport from "@/components/CrmImport";
import LogoutButton from "@/components/LogoutButton";
import SecurityPanel from "@/components/SecurityPanel";
import { quand } from "@/components/format";
import { getSql } from "@/lib/db";
import { crmCount } from "@/lib/crm/repo";
import { LIMITS } from "@/lib/engine/runner";
import { currentSession } from "@/lib/session";
import { getSettings, MODELES } from "@/lib/settings";
import { listOffsite } from "@/lib/backup";
import { backupKey, fingerprint } from "@/lib/backup/crypto";
import { s3Config } from "@/lib/backup/s3";
import { diagnostic } from "@/lib/diagnostic";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const sql = getSql();
  const [n, session, [archive], usage, journal, devices, settings, backups, diag] = await Promise.all([
    crmCount(sql),
    currentSession(),
    sql<{ source_name: string; source_sha256: string; imported_at: string }[]>`select source_name, source_sha256, imported_at from crm_import_archive order by id desc limit 1`,
    sql<{ agent_id: string; model: string; calls: number; cost: string; searches: number }[]>`
      select agent_id, model, count(*)::int as calls, sum(cost_usd)::text as cost, sum(web_searches)::int as searches
      from usage_log where created_at >= date_trunc('month', now()) group by agent_id, model order by agent_id, model`,
    sql<{ created_at: string; actor: string; kind: string; summary: string }[]>`select created_at, actor, kind, summary from crm_journal order by id desc limit 8`,
    sql<{ id: string; label: string; created_at: string; last_seen: string }[]>`
      select id::text, label, created_at, last_seen from auth_devices where revoked_at is null order by last_seen desc`,
    getSettings(sql),
    sql<{ id: number; created_at: Date; reason: string; size: number; offsite_verified_at: Date | null; offsite_error: string | null; local: boolean; offsite_key: string | null }[]>`
      select id::int, created_at, reason, size, offsite_verified_at, offsite_error, data is not null as local, offsite_key
      from crm_backups order by id desc limit 15`,
    diagnostic(),
  ]);
  // Base vide : on cherche des sauvegardes externes à restaurer (reconstruction après une panne).
  let offsite: { key: string; size: number; lastModified: string }[] = [];
  let offsiteErreur: string | null = null;
  if (n === 0) {
    try { offsite = await listOffsite(); } catch (e) { offsiteErreur = (e as Error).message; }
  }
  let cle: string | null = null;
  try { const k = backupKey(); cle = k ? fingerprint(k) : null; } catch { cle = "invalide"; }
  const rows: BackupRow[] = backups.map((b) => ({
    id: b.id, created_at: new Date(b.created_at).toISOString(), reason: b.reason, size: b.size, local: b.local, offsite_key: b.offsite_key,
    offsite: b.offsite_verified_at ? "ok" : b.offsite_error ? "echec" : "non", error: b.offsite_error,
  }));
  const user = session?.email;
  const total = usage.reduce((s, u) => s + Number(u.cost), 0);
  return (
    <main className="shell">
      <h1 className="page-title">Réglages</h1>
      <p className="subtitle">Connecté : {user}</p>

      <section className="section" style={{ marginTop: 8 }}>
        <div className="section-head"><h2>CRM</h2></div>
        <div className="card">
          {n > 0 ? (
            <>
              <p style={{ margin: 0 }}><b>{n} clubs</b> dans la base — c'est la source officielle.</p>
              {archive && <p className="small muted" style={{ margin: "6px 0 0" }}>Importé depuis {archive.source_name} {quand(archive.imported_at)} (empreinte {archive.source_sha256.slice(0, 12)}…). Le fichier d'origine est archivé intégralement.</p>}
              <div className="btn-row">
                <a className="btn primary" href="/api/crm/export">Télécharger en Excel</a>
                <a className="btn ghost" href="/api/crm/export?format=csv">CSV</a>
              </div>
              <p className="small muted" style={{ margin: "10px 0 0" }}>L'export Excel reprend ton fichier d'origine (onglets, formules, mise en forme) avec les valeurs à jour. C'est une copie de sauvegarde : les modifications se font ici, pas dans le fichier.</p>
              <CrmCompare />
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 12px" }}>Aucun club importé. Envoie ton fichier de prospection : l'app l'analyse d'abord sans rien écrire, puis importe et vérifie chaque cellule après ta confirmation.</p>
              <CrmImport />
            </>
          )}
        </div>
        {journal.length > 0 && (
          <details>
            <summary>Journal des modifications du CRM</summary>
            <div className="list" style={{ marginTop: 8 }}>
              {journal.map((j, i) => (
                <div key={i} className="row"><div className="grow"><div className="title" style={{ whiteSpace: "normal" }}>{j.summary}</div><div className="meta">{j.actor} · {j.kind} · {quand(j.created_at)}</div></div></div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Sauvegardes</h2></div>
        <div className="card">
          {!cle && <div className="banner err">Clé de sauvegarde (BACKUP_KEY) absente chez l'hébergeur : aucune sauvegarde automatique n'est possible.</div>}
          {cle && !s3Config() && <div className="banner warn">Stockage externe non configuré : les sauvegardes restent dans la même base que le CRM. Elles protègent contre une erreur, pas contre la perte de la base.</div>}
          {offsiteErreur && <div className="banner err">Stockage externe injoignable : {offsiteErreur}</div>}
          <p className="small muted" style={{ margin: "0 0 12px" }}>
            Automatiques : chaque jour, et dans l'heure qui suit une modification du CRM. Chiffrées (AES-256), {30} versions gardées en base{s3Config() ? ", toutes gardées dans le stockage externe et relues après chaque envoi" : ""}.
            {cle && <> Empreinte de la clé : <code>{cle}</code> (elle doit correspondre à la clé gardée dans ton trousseau).</>}
          </p>
          <BackupPanel backups={rows} offsite={offsite} crmEmpty={n === 0} />
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Agents et coûts</h2></div>
        <div className="card">
          <p style={{ margin: 0 }}>Clé API Claude : {process.env.ANTHROPIC_API_KEY ? <span className="chip green">configurée</span> : <span className="chip red">absente</span>}</p>
          <p style={{ margin: "12px 0 6px" }}><b>Ce mois-ci : {total.toFixed(2)} $</b> / {settings.monthlyBudget} $ · {LIMITS.maxSteps} étapes max par tâche</p>
          {usage.length > 0 && (
            <table className="diff"><tbody>
              {usage.map((u) => <tr key={u.agent_id + u.model}><td>{u.agent_id}</td><td>{MODELES[u.model as keyof typeof MODELES]?.label ?? u.model} · {u.calls} appels · {u.searches} recherches web · {Number(u.cost).toFixed(3)} $</td></tr>)}
            </tbody></table>
          )}
          <p className="small muted" style={{ margin: "10px 0 0" }}>Coût calculé pour chaque appel à partir des jetons réellement facturés (renvoyés par l'API) et des tarifs publics. La facture officielle reste celle de la console Anthropic.</p>
        </div>
        <details className="card" style={{ marginTop: 12 }}>
          <summary style={{ marginTop: 0 }}>Modèles et plafonds</summary>
          <div style={{ marginTop: 12 }}><CostSettings value={settings} modeles={MODELES} /></div>
        </details>
      </section>

      <section className="section">
        <div className="section-head"><h2>Diagnostic du serveur</h2></div>
        <div className="card small">
          <div>Mémoire utilisée : <b>{diag.serveur.memoireMo.rss} Mo</b> (limite de l'offre Starter : 512 Mo) · démarré {quand(diag.serveur.demarreLe)}</div>
          <div>Moteur des missions : {diag.serveur.moteurActifIlYaS === null ? "non démarré" : `actif (dernier passage il y a ${diag.serveur.moteurActifIlYaS} s)`}</div>
          <div>Base : {diag.base.ok ? `joignable (${String(diag.base.latenceMs)} ms), taille ${String(diag.base.taille)} sur 500 Mo (offre gratuite)` : `INJOIGNABLE — ${String(diag.base.erreur)}`}</div>
          {diag.serveur.derniereErreurMaintenance && <div className="banner err" style={{ marginTop: 8, marginBottom: 0 }}>Dernière erreur des tâches de fond : {diag.serveur.derniereErreurMaintenance}</div>}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Sécurité</h2></div>
        <SecurityPanel
          devices={devices.map((d) => ({ ...d, created_at: String(d.created_at), last_seen: String(d.last_seen), current: d.id === session?.device }))}
          passwordManaged={!process.env.OWNER_PASSWORD_HASH}
        />
        <div style={{ marginTop: 12 }}><LogoutButton /></div>
      </section>
    </main>
  );
}
