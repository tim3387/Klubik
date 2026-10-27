import Link from "next/link";
import ActionCard from "@/components/ActionCard";
import { quand } from "@/components/format";
import Avatar from "@/components/Avatar";
import { profil } from "@/lib/agents/profiles";
import { pendingActions, recentActions } from "@/lib/queries";

export const dynamic = "force-dynamic";
const nom = (id: string) => profil(id)?.nom ?? id;
const STATUT: Record<string, { label: string; cls: string }> = {
  applied: { label: "Appliquée", cls: "green" },
  sent: { label: "Envoi confirmé", cls: "green" },
  rejected: { label: "Refusée", cls: "gray" },
  failed: { label: "Échec", cls: "red" },
};

export default async function Actions({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue } = await searchParams;
  const historique = vue === "historique";
  const [pending, done] = await Promise.all([historique ? [] : pendingActions(100), historique ? recentActions(100) : []]);
  return (
    <main className="shell">
      <h1 className="page-title">Actions</h1>
      <p className="subtitle">Rien n'est écrit dans le CRM ni envoyé sans ta validation.</p>
      <div className="tabs">
        <Link href="/actions" className={historique ? "" : "on"}>À valider</Link>
        <Link href="/actions?vue=historique" className={historique ? "on" : ""}>Historique</Link>
      </div>
      {!historique && (pending.length === 0 ? <div className="empty">Rien à valider. Les propositions de Popi et les brouillons de Bililou apparaîtront ici.</div> : (
        pending.map((a) => <ActionCard key={a.id} id={a.id} kind={a.kind as "crm_update" | "message_draft"} title={a.title} agentId={a.agent_id} when={quand(a.created_at)} payload={a.payload} />)
      ))}
      {historique && (done.length === 0 ? <div className="empty">Aucune décision pour l'instant.</div> : (
        <div className="list">
          {done.map((a) => (
            <div key={a.id} className="row">
              {profil(a.agent_id) && <Avatar agent={profil(a.agent_id)!} size={32} decorative />}
              <span className={`chip ${STATUT[a.status]?.cls ?? "gray"}`}>{STATUT[a.status]?.label ?? a.status}</span>
              <div className="grow">
                <div className="title">{a.title}</div>
                <div className="meta">{nom(a.agent_id)} · {quand(a.decided_at ?? a.created_at)}{a.status === "failed" && a.result?.error ? ` · ${a.result.error}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
