import Link from "next/link";
import Avatar from "@/components/Avatar";
import KungLauncher from "@/components/KungLauncher";
import { quand } from "@/components/format";
import { activite } from "@/lib/agents/activity";
import { AGENT_IDS, PROFILES, profil, type AgentId } from "@/lib/agents/profiles";
import { fr, toDate, todayUtc } from "@/lib/crm/rules";
import { getSql } from "@/lib/db";
import { activeTasks, crmSummary, missions, monthCost, pendingActions, recentConversations } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const [crm, actions, mis, convs, cout, settings, actives] = await Promise.all([
    crmSummary(), pendingActions(5), missions(20), recentConversations(5), monthCost(), getSettings(getSql()), activeTasks(),
  ]);
  const enCours = mis.filter((m) => m.open > 0);
  // Activité réelle par mission : la tâche la plus récente qui n'attend pas ses collègues, sinon celle qui coordonne.
  const activiteDe = (root: string) => {
    const t = actives.filter((x) => x.root_id === root);
    const cible = [...t].reverse().find((x) => x.status !== "waiting") ?? t[0];
    return cible ? { texte: activite(cible), agent: cible.agent_id } : null;
  };
  const equipe: AgentId[] = ["jojo", "popi", "bililou"];
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
      {cout >= settings.monthlyBudget && <div className="banner err">Plafond mensuel atteint ({cout.toFixed(2)} $ / {settings.monthlyBudget} $) : les agents sont en pause jusqu'au mois prochain. <Link href="/reglages">Ajuster le plafond</Link></div>}
      {cout < settings.monthlyBudget && cout >= 0.8 * settings.monthlyBudget && <div className="banner warn">{Math.round((cout / settings.monthlyBudget) * 100)} % du plafond mensuel utilisé ({cout.toFixed(2)} $ / {settings.monthlyBudget} $).</div>}
      {!crm && <div className="banner info">Le CRM n'est pas encore importé. <Link href="/reglages">Importer le fichier de prospection</Link></div>}

      <KungLauncher />

      <section className="section">
        <div className="section-head"><h2>Ton équipe</h2></div>
        <div className="team">
          {equipe.map((id) => {
            const a = PROFILES[id];
            return (
              <Link key={id} href={`/agents/${id}`} className="team-card" aria-label={`Ouvrir la conversation avec ${a.nom}, ${a.role}`}>
                <div className="team-stage"><Avatar agent={a} forme="entier" size={96} decorative /></div>
                <div className="team-id">
                  <div className="name">{a.nom}</div>
                  <div className="role">{a.role}</div>
                  <div className="desc">{a.description}</div>
                </div>
                <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            );
          })}
        </div>
      </section>

      {crm && (
        <section className="section">
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
        <div className="section-head"><h2>Actions à valider</h2><Link href="/actions">Tout voir</Link></div>
        {actions.length === 0 ? <div className="empty">Rien à valider pour l'instant.</div> : (
          <div className="list">
            {actions.map((a) => (
              <Link key={a.id} href="/actions" className="row">
                {profil(a.agent_id) && <Avatar agent={profil(a.agent_id)!} size={36} decorative />}
                <div className="grow"><div className="title">{a.title}</div><div className="meta">{a.kind === "crm_update" ? "Mise à jour CRM" : "Brouillon"} · par {profil(a.agent_id)?.nom ?? a.agent_id} · {quand(a.created_at)}</div></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Missions en cours</h2><Link href="/missions">Historique</Link></div>
        {enCours.length === 0 ? <div className="empty">Aucune mission en cours.</div> : (
          <div className="list">
            {enCours.map((m) => {
              const act = activiteDe(m.id);
              return (
                <Link key={m.id} href={`/missions/${m.id}`} className="row">
                  <span className="avatar-stack">
                    {[...m.agents].sort((a, b) => AGENT_IDS.indexOf(a as AgentId) - AGENT_IDS.indexOf(b as AgentId)).map((x) => profil(x)).filter((p) => !!p).map((p) => <Avatar key={p!.id} agent={p!} size={32} decorative />)}
                  </span>
                  <div className="grow">
                    <div className="title">{m.title}</div>
                    <div className="meta live">{act ? <><span className="dot pulse" />{act.texte}</> : quand(m.created_at)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Dernières conversations</h2></div>
        {convs.length === 0 ? <div className="empty">Confie ta première mission à Kung ci-dessus.</div> : (
          <div className="list">
            {convs.map((c) => {
              const a = profil(c.agent_id);
              return (
                <Link key={c.id} href={`/agents/${c.agent_id}?c=${c.id}`} className="row">
                  {a && <Avatar agent={a} size={40} decorative />}
                  <div className="grow"><div className="title">{c.title ?? "Conversation"}</div><div className="meta">{a?.nom} · {quand(c.updated_at)} · {c.last?.replace(/[*_`#>]/g, "").slice(0, 80)}</div></div>
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
        Consommation IA ce mois-ci : {cout.toFixed(2)} $ / {settings.monthlyBudget} $ · CRM au {fr(todayUtc())}
      </p>
    </main>
  );
}
