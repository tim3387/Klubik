"use client";
// Avatar officiel d'un agent, à partir de la configuration centrale (lib/agents/profiles.ts).
//  · forme « portrait » : pastille ronde cadrée sur le visage (en-têtes, réponses, listes) ;
//  · forme « entier »   : personnage en entier, proportions conservées (cartes, accueil des conversations).
// Secours : si l'image ne charge pas, l'initiale de l'agent s'affiche sur sa couleur.
import { useEffect, useRef, useState } from "react";
import { avatarSrc, TAILLES, type AgentProfile } from "@/lib/agents/profiles";

type Props = {
  agent: Pick<AgentProfile, "nom" | "couleur" | "avatar">;
  size?: number;
  forme?: "portrait" | "entier";
  priority?: boolean;
  decorative?: boolean; // vrai quand le nom est déjà écrit à côté (évite une double lecture par VoiceOver)
};

export default function Avatar({ agent, size = 48, forme = "portrait", priority = false, decorative = false }: Props) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Une erreur de chargement survenue avant l'activation de la page n'est pas signalée à React : on vérifie au montage.
  useEffect(() => {
    const i = img.current;
    if (i && i.complete && i.naturalWidth === 0) setFailed(true);
  }, []);
  const a = agent.avatar;
  const alt = decorative ? "" : a?.alt ?? `Avatar de ${agent.nom}`;
  if (!a || failed) {
    return (
      <span
        className={`avatar ${forme}`}
        style={{ width: size, height: size, fontSize: size * (forme === "entier" ? 0.32 : 0.42), background: `linear-gradient(145deg, ${agent.couleur}, ${agent.couleur}cc)` }}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative || undefined}
      >
        <span className="initial">{agent.nom[0]}</span>
      </span>
    );
  }
  const tailles = TAILLES[forme];
  return (
    <span className={`avatar ${forme} has-img`} style={{ width: size, height: size }}>
      <img
        ref={img}
        src={avatarSrc(a, forme, tailles[0])}
        srcSet={tailles.map((t) => `${avatarSrc(a, forme, t)} ${t}w`).join(", ")}
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
