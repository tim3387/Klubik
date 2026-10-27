// Identité visible des quatre agents : SOURCE UNIQUE pour l'interface (prénom, rôle, description, avatar).
// Aucune dépendance serveur : utilisable partout (pages serveur et composants client).
//
// Remplacer l'avatar d'un agent, sans toucher au reste du code :
//   1. remplacer public/avatars/<id>/original.png par la nouvelle image (carrée de préférence) ;
//   2. ajuster si besoin `cadrage` (zone du visage pour les petites pastilles) et incrémenter `version` ;
//   3. lancer `npm run avatars` (génère les versions web légères à partir des originaux).

export type AgentId = "kung" | "popi" | "jojo" | "bililou";
export const AGENT_IDS: AgentId[] = ["kung", "jojo", "popi", "bililou"];

export interface AgentAvatar {
  /** Dossier public des images : original.png (référence, jamais modifiée) + versions web générées. */
  dossier: string;
  /** Texte alternatif (accessibilité). */
  alt: string;
  /** Zone carrée du visage dans l'original, en fractions (x, y, côté) : sert aux pastilles rondes. */
  cadrage: { x: number; y: number; cote: number };
  /** À incrémenter quand l'image change (évite qu'un navigateur garde l'ancienne en cache). */
  version: number;
}

export interface AgentProfile {
  id: AgentId;
  nom: string;
  animal: string;
  role: string;
  description: string;
  /** Ce que l'agent fait concrètement quand il travaille (libellés d'activité réelle). */
  verbe: string;
  personnalite: string[];
  couleur: string; // couleur de secours si l'image ne peut pas s'afficher
  avatar: AgentAvatar | null;
  suggestions: string[];
}

export const PROFILES: Record<AgentId, AgentProfile> = {
  kung: {
    id: "kung", nom: "Kung", animal: "Panda", role: "Manager général",
    description: "Ton interlocuteur principal. Il pilote la prospection, répartit le travail et te propose les priorités.",
    verbe: "coordonne la mission",
    personnalite: ["calme", "stratégique", "organisé", "exigeant", "proactif"],
    couleur: "#0B51FD",
    avatar: {
      dossier: "/avatars/kung", version: 1,
      alt: "Kung, panda noir et blanc en peluche portant le maillot bleu Klubik",
      cadrage: { x: 272 / 1254, y: 35 / 1254, cote: 710 / 1254 },
    },
    suggestions: [
      "Qu'est-ce qu'on fait aujourd'hui ?",
      "Identifie les 5 clubs les plus intéressants à contacter, fais chercher des infos par Jojo et prépare les messages avec Bililou.",
      "Prépare les relances des clubs qui n'ont pas répondu.",
      "Qu'est-ce qu'on pourrait améliorer dans notre prospection ?",
    ],
  },
  jojo: {
    id: "jojo", nom: "Jojo", animal: "Panda", role: "Club Intelligence",
    description: "Il enquête sur les clubs (projets, résultats, dirigeants, actualités) et trouve des accroches sourcées.",
    verbe: "enquête sur le club",
    personnalite: ["curieux", "observateur", "analytique", "persévérant"],
    couleur: "#7C3AED",
    avatar: {
      dossier: "/avatars/jojo", version: 1,
      alt: "Jojo, panda blanc crème en peluche aux oreilles sombres, portant le maillot bleu Klubik",
      cadrage: { x: 297 / 1254, y: 50 / 1254, cote: 660 / 1254 },
    },
    suggestions: [
      "Trouve ce qui pourrait me permettre d'approcher intelligemment Annecy CSAV.",
      "Quelles sont les actualités récentes du CS Bourgoin-Jallieu handball ?",
    ],
  },
  popi: {
    id: "popi", nom: "Popi", animal: "Lapin", role: "CRM Manager",
    description: "Il tient le fichier de prospection : fiches clubs, statuts, échanges, relances, doublons.",
    verbe: "travaille sur le CRM",
    personnalite: ["rapide", "précis", "organisé", "méthodique", "rigoureux"],
    couleur: "#16A34A",
    avatar: {
      dossier: "/avatars/popi", version: 1,
      alt: "Popi, lapin caramel en peluche aux grandes oreilles tombantes, portant le maillot bleu Klubik",
      cadrage: { x: 207 / 1254, y: 55 / 1254, cote: 840 / 1254 },
    },
    suggestions: [
      "Fais-moi le point sur la prospection.",
      "Quels clubs dois-je relancer cette semaine ?",
      "J'ai envoyé un DM Instagram à ALC Longvic aujourd'hui.",
      "Y a-t-il des doublons ou des incohérences dans le fichier ?",
    ],
  },
  bililou: {
    id: "bililou", nom: "Bililou", animal: "Bouvier bernois", role: "Copywriter",
    description: "Il rédige tes emails, DM, SMS, relances et réponses aux clubs — humains et personnalisés.",
    verbe: "rédige",
    personnalite: ["chaleureux", "empathique", "sociable", "créatif", "persuasif"],
    couleur: "#EA580C",
    avatar: {
      dossier: "/avatars/bililou", version: 1,
      alt: "Bililou, bouvier bernois noir, blanc et roux en peluche, portant le maillot bleu Klubik",
      cadrage: { x: 262 / 1254, y: 30 / 1254, cote: 730 / 1254 },
    },
    suggestions: [
      "Prépare un premier DM Instagram pour Annecy CSAV.",
      "Le président m'a répondu : « Nous avons déjà quelqu'un pour la communication. » Propose une réponse.",
      "Je t'envoie la capture de la réponse Instagram du club : analyse-la et propose une réponse.",
    ],
  },
};

/** Versions web générées par `npm run avatars` (largeur en pixels). */
export const TAILLES = { entier: [320, 640], portrait: [96, 256] } as const;

export function avatarSrc(a: AgentAvatar, forme: "entier" | "portrait", largeur: number): string {
  return `${a.dossier}/${forme}-${largeur}.webp?v=${a.version}`;
}

export const profil = (id: string): AgentProfile | undefined => PROFILES[id as AgentId];
export const nomAgent = (id: string) => profil(id)?.nom ?? id;
