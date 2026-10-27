import CrmImport from "@/components/CrmImport";
import LogoutButton from "@/components/LogoutButton";
import { quand } from "@/components/format";
import { getSql } from "@/lib/db";
import { crmCount } from "@/lib/crm/repo";
import { LIMITS } from "@/lib/engine/runner";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const sql = getSql();
  const [n, user, [archive], usage, journal] = await Promise.all([
    crmCount(sql),
    currentUser(),
    sql<{ source_name: string; source_sha256: string; imported_at: string }[]>`select source_name, source_sha256, imported_at from crm_import_archive order by id desc limit 1`,
    sql<{ agent_id: string; calls: number; cost: string; searches: number }[]>`
      select agent_id, count(*)::int as calls, sum(cost_usd)::text as cost, sum(web_searches)::int as searches
      from usage_log where created_at >= date_trunc('month', now()) group by agent_id order by agent_id`,
    sql<{ created_at: string; actor: string; kind: string; summary: string }[]>`select created_at, actor, kind, summary from crm_journal order by id desc limit 8`,
  ]);
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
        <div className="section-head"><h2>Agents et coûts</h2></div>
        <div className="card">
          <p style={{ margin: 0 }}>Clé API Claude : {process.env.ANTHROPIC_API_KEY ? <span className="chip green">configurée</span> : <span className="chip red">absente</span>}</p>
          <p className="small" style={{ margin: "10px 0 0" }}>Modèle : {LIMITS.model} · plafond mensuel {LIMITS.monthlyBudget} $ · plafond par mission {LIMITS.missionBudget} $ · {LIMITS.maxSteps} étapes max par tâche.</p>
          <p style={{ margin: "12px 0 6px" }}><b>Ce mois-ci : {total.toFixed(2)} $</b> / {LIMITS.monthlyBudget} $</p>
          {usage.length > 0 && (
            <table className="diff"><tbody>
              {usage.map((u) => <tr key={u.agent_id}><td>{u.agent_id}</td><td>{u.calls} appels · {u.searches} recherches web · {Number(u.cost).toFixed(3)} $</td></tr>)}
            </tbody></table>
          )}
          <p className="small muted" style={{ margin: "10px 0 0" }}>Coût estimé à partir des jetons consommés et des tarifs publics. La facture officielle reste celle de la console Anthropic.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Compte</h2></div>
        <LogoutButton />
      </section>
    </main>
  );
}
