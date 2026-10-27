import Link from "next/link";
import { notFound } from "next/navigation";
import Avatar from "@/components/Avatar";
import Markdown from "@/components/Markdown";
import { quand, STATUT_TACHE } from "@/components/format";
import { PROFILES } from "@/lib/agents/definitions";
import { missionDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ACTION: Record<string, { label: string; cls: string }> = {
  pending: { label: "À valider", cls: "orange" },
  applied: { label: "Appliquée", cls: "green" },
  sent: { label: "Envoyé (confirmé)", cls: "green" },
  rejected: { label: "Refusée", cls: "gray" },
  failed: { label: "Échec", cls: "red" },
};

export default async function Mission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { tasks, actions } = await missionDetail(id);
  const root = tasks.find((t) => t.id === id);
  if (!root) notFound();
  const cost = tasks.reduce((s, t) => s + Number(t.cost_usd), 0);
  return (
    <main className="shell">
      <div className="topbar"><Link href="/missions">← Missions</Link>{root.conversation_id && <Link href={`/agents/${root.agent_id}?c=${root.conversation_id}`}>Ouvrir la conversation</Link>}</div>
      <h1 className="page-title" style={{ fontSize: 22 }}>{root.title}</h1>
      <p className="subtitle">Lancée {quand(root.created_at)} · {tasks.length} tâche{tasks.length > 1 ? "s" : ""} · coût {cost.toFixed(3)} $</p>

      <section className="section" style={{ marginTop: 8 }}>
        <div className="section-head"><h2>Déroulé</h2></div>
        <div className="timeline">
          {tasks.map((t) => {
            const a = PROFILES[t.agent_id as keyof typeof PROFILES];
            const st = STATUT_TACHE[t.status];
            return (
              <div key={t.id} className="card" style={{ marginLeft: t.parent_id ? 16 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {a && <Avatar agent={a} size={32} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 750, color: "var(--ink)" }}>{a?.nom ?? t.agent_id}{t.parent_id ? " · délégué par Kung" : ""}</div>
                    <div className="small muted">{t.steps} étape{t.steps > 1 ? "s" : ""} · {Number(t.cost_usd).toFixed(3)} $ · {quand(t.created_at)}</div>
                  </div>
                  <span className={`chip ${st?.cls ?? "gray"}`}>{["ready", "running", "waiting"].includes(t.status) && <span className="dot pulse" />}{st?.label ?? t.status}</span>
                </div>
                {t.parent_id && <p className="small" style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}><b>Consigne :</b> {t.title}</p>}
                {t.error && <div className="banner err" style={{ marginTop: 10, marginBottom: 0 }}>{t.error}</div>}
                {t.result && (
                  <details>
                    <summary>Résultat</summary>
                    <div className="md small" style={{ marginTop: 8 }}><Markdown text={t.result} /></div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Actions proposées</h2><Link href="/actions">Valider</Link></div>
        {actions.length === 0 ? <div className="empty">Aucune action proposée par cette mission.</div> : (
          <div className="list">
            {actions.map((a) => (
              <div key={a.id} className="row">
                <span className={`chip ${a.kind === "crm_update" ? "orange" : "blue"}`}>{a.kind === "crm_update" ? "CRM" : "Brouillon"}</span>
                <div className="grow"><div className="title">{a.title}</div></div>
                <span className={`chip ${ACTION[a.status]?.cls ?? "gray"}`}>{ACTION[a.status]?.label ?? a.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
