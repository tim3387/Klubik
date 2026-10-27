import Link from "next/link";
import Avatar from "@/components/Avatar";
import { quand, STATUT_TACHE } from "@/components/format";
import { AGENT_IDS, PROFILES } from "@/lib/agents/definitions";
import { fr, toDate, todayUtc } from "@/lib/crm/rules";
import { crmSummary, missions, monthCost, pendingActions, recentConversations } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const [crm, actions, mis, convs, cout] = await Promise.all([crmSummary(), pendingActions(5), missions(20), recentConversations(5), monthCost()]);
  const enCours = mis.filter((m) => m.open > 0);
  const heure = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
  const salut = heure < 18 ? "Bonjour" : "Bonsoir";
  return (
    <main className="shell">
      <div className="topbar">
        <img src="/logo-klubik.png" alt="Klubik" />
        <span className="chip blue">AI HQ</span>
      </div>
      <h1 className="page-title">{salut} Timothé</h1>
      <p className="subtitle">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date())} · ton équipe est prête.</p>

      {!process.env.ANTHROPIC_API_KEY && <div className="banner warn">Les agents sont inactifs : la clé API Claude n'est pas encore configurée sur le serveur.</div>}
      {!crm && <div className="banner info">Le CRM n'est pas encore importé. <Link href="/reglages">Importer le fichier de prospection</Link></div>}

      {crm && (
        <section className="section" style={{ marginTop: 8 }}>
          <div className="kpis">
            <div className="kpi"><b>{crm.stats.relancesEnRetard}</b><span>relance{crm.stats.relancesEnRetard > 1 ? "s" : ""} en retard</span></div>
            <div className="kpi"><b>{crm.relances.avenir.length}</b><span>relances sous 7 jours</span></div>
            <div className="kpi"><b>{crm.stats.premiersContactsSemaine}/{crm.stats.objectifSemaine}</b><span>premiers contacts cette semaine</span></div>
            <div className="kpi"><b>{crm.stats.ontRepondu}/{crm.stats.contactes}</b><span>réponses / clubs contactés</span></div>
          </div>
          {crm.relances.retard.length > 0 && (
            <div className="banner warn" style={{ marginTop: 10 }}>
              En retard : {crm.relances.retard.slice(0, 3).map((r) => `${r.club.data["Club"]} (${r.joursRetard} j)`).join(", ")}
              {crm.relances.retard.length > 3 ? "…" : ""}
            </div>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Ton équipe</h2></div>
        <div className="agents">
          {AGENT_IDS.map((id) => {
            const a = PROFILES[id];
            return (
              <Link key={id} href={`/agents/${id}`} className="agent-card">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar agent={a} size={44} />
                  <div>
                    <div className="name">{a.nom}</div>
                    <div className="animal">{a.animal}</div>
                  </div>
                </div>
                <div className="role" style={{ color: a.couleur }}>{a.role}</div>
                <div className="desc">{a.description}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Actions à valider</h2><Link href="/actions">Tout voir</Link></div>
        {actions.length === 0 ? <div className="empty">Rien à valider pour l'instant.</div> : (
          <div className="list">
            {actions.map((a) => (
              <Link key={a.id} href="/actions" className="row">
                <span className={`chip ${a.kind === "crm_update" ? "orange" : "blue"}`}>{a.kind === "crm_update" ? "CRM" : "Brouillon"}</span>
                <div className="grow"><div className="title">{a.title}</div><div className="meta">par {PROFILES[a.agent_id as keyof typeof PROFILES]?.nom ?? a.agent_id} · {quand(a.created_at)}</div></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Missions en cours</h2><Link href="/missions">Historique</Link></div>
        {enCours.length === 0 ? <div className="empty">Aucune mission en cours.</div> : (
          <div className="list">
            {enCours.map((m) => (
              <Link key={m.id} href={`/missions/${m.id}`} className="row">
                <span className="chip blue"><span className="dot pulse" />{STATUT_TACHE[m.status]?.label ?? m.status}</span>
                <div className="grow"><div className="title">{m.title}</div><div className="meta">{m.agents.map((x) => PROFILES[x as keyof typeof PROFILES]?.nom ?? x).join(", ")} · {quand(m.created_at)}</div></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Dernières conversations</h2></div>
        {convs.length === 0 ? <div className="empty">Écris à Kung pour commencer.</div> : (
          <div className="list">
            {convs.map((c) => {
              const a = PROFILES[c.agent_id as keyof typeof PROFILES];
              return (
                <Link key={c.id} href={`/agents/${c.agent_id}?c=${c.id}`} className="row">
                  {a && <Avatar agent={a} size={36} />}
                  <div className="grow"><div className="title">{c.title ?? "Conversation"}</div><div className="meta">{a?.nom} · {quand(c.updated_at)} · {c.last?.slice(0, 80)}</div></div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {crm && crm.relances.prochainsPas.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Prochains pas datés</h2></div>
          <div className="list">
            {crm.relances.prochainsPas.slice(0, 5).map((p) => (
              <div key={p.club.id} className="row"><span className="chip gray">{fr(toDate(p.date))}</span><div className="grow"><div className="title">{String(p.club.data["Club"])}</div><div className="meta">{String(p.club.data["Prochain pas"] ?? "")}</div></div></div>
            ))}
          </div>
        </section>
      )}

      <p className="muted small" style={{ marginTop: 28, textAlign: "center" }}>
        Consommation IA ce mois-ci : {cout.toFixed(2)} $ · CRM au {fr(todayUtc())}
      </p>
    </main>
  );
}
