export function quand(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

export const STATUT_TACHE: Record<string, { label: string; cls: string }> = {
  ready: { label: "En file", cls: "blue" },
  running: { label: "En cours", cls: "blue" },
  waiting: { label: "Attend ses agents", cls: "blue" },
  done: { label: "Terminée", cls: "green" },
  failed: { label: "Échouée", cls: "red" },
};
