import Link from "next/link";
import { quand, STATUT_TACHE } from "@/components/format";
import Avatar from "@/components/Avatar";
import { AGENT_IDS, profil } from "@/lib/agents/profiles";
import { missions } from "@/lib/queries";

export const dynamic = "force-dynamic";
const nom = (id: string) => profil(id)?.nom ?? id;
const ordre = (ids: string[]) => [...ids].sort((a, b) => AGENT_IDS.indexOf(a as never) - AGENT_IDS.indexOf(b as never));

export default async function Missions() {
  const list = await missions(100);
  return (
    <main className="shell">
      <h1 className="page-title">Missions</h1>
      <p className="subtitle">Chaque demande à un agent devient une mission exécutée sur le serveur, même app fermée.</p>
      {list.length === 0 ? <div className="empty">Aucune mission pour l'instant. Écris à Kung depuis l'accueil.</div> : (
        <div className="list">
          {list.map((m) => {
            const st = m.open > 0 ? STATUT_TACHE[m.status] ?? STATUT_TACHE.running : m.failed > 0 && m.status !== "done" ? STATUT_TACHE.failed : STATUT_TACHE[m.status];
            return (
              <Link key={m.id} href={`/missions/${m.id}`} className="row">
                <span className="avatar-stack">{ordre(m.agents).map((x) => profil(x)).filter((p) => !!p).map((p) => <Avatar key={p!.id} agent={p!} size={30} decorative />)}</span>
                <div className="grow">
                  <div className="title">{m.title}</div>
                  <div className="meta">{ordre(m.agents).map(nom).join(", ")} · {quand(m.created_at)} · {Number(m.cost).toFixed(2)} $</div>
                </div>
                <span className={`chip ${st?.cls ?? "gray"}`}>{m.open > 0 && <span className="dot pulse" />}{st?.label ?? m.status}</span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
