import type { AgentProfile } from "@/lib/agents/definitions";

// Emplacement d'avatar : l'avatar officiel s'affichera dès que `avatar` sera renseigné dans definitions.ts.
export default function Avatar({ agent, size = 48 }: { agent: Pick<AgentProfile, "nom" | "couleur" | "avatar">; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(145deg, ${agent.couleur}, ${agent.couleur}cc)` }}
      aria-label={`Avatar de ${agent.nom}`}
    >
      {agent.avatar ? <img src={agent.avatar} alt="" /> : <span className="initial">{agent.nom[0]}</span>}
    </span>
  );
}
