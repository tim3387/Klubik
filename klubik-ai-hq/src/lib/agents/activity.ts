// Libellés d'activité des agents, construits UNIQUEMENT à partir de faits enregistrés en base :
// statut de la tâche, outils réellement appelés à la dernière étape, collègues réellement attendus.
// Aucune animation ni activité simulée.
import { nomAgent } from "./profiles";

export interface TaskActivity {
  id: string;
  agent_id: string;
  status: string;
  steps: number;
  last_tools: string[] | null;
  waiting_for: string[] | null;
}

const OUTILS: Record<string, string> = {
  crm_point: "a consulté le CRM",
  crm_relances: "a consulté les relances du CRM",
  crm_prioritaires: "a sélectionné des clubs dans le CRM",
  crm_chercher: "a cherché un club dans le CRM",
  crm_fiche: "a lu une fiche club",
  crm_qualite: "a contrôlé la qualité du CRM",
  crm_proposer_mise_a_jour: "a préparé une mise à jour du CRM",
  intel_lire: "a relu un dossier de renseignement",
  intel_enregistrer: "a enregistré un dossier de renseignement",
  brouillon_enregistrer: "a enregistré un brouillon",
  deleguer: "a confié des tâches à l'équipe",
  web_search: "a fait des recherches web",
  web_fetch: "a lu des pages web",
};

const liste = (noms: string[]) => (noms.length <= 1 ? noms.join("") : `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`);

export function activite(t: TaskActivity): string {
  const nom = nomAgent(t.agent_id);
  if (t.status === "waiting") {
    const attendus = [...new Set((t.waiting_for ?? []).map(nomAgent))];
    return attendus.length ? `${nom} coordonne : attend ${liste(attendus)}` : `${nom} attend ses collègues`;
  }
  if (t.steps === 0) return t.status === "running" ? `${nom} prend connaissance de la demande` : `${nom} : demande en file d'attente`;
  const faits = [...new Set((t.last_tools ?? []).map((o) => OUTILS[o]).filter(Boolean))];
  if (!faits.length) return `${nom} poursuit son travail`;
  return `${nom} ${liste(faits)} · ${t.status === "running" ? "analyse en cours" : "reprend"}`;
}
