// Dossiers de renseignement de Jojo : validation (portage de klubik_crm.valider_dossier) et fraîcheur.
import { z } from "zod";

export const CATEGORIES = ["identite", "dirigeants", "sportif", "actualite", "communication"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ attendue");

export const dossierSchema = z.object({
  club_id: z.number().int(),
  club: z.string().min(1),
  verifie_le: isoDate,
  sources_consultees: z.array(z.object({
    url: z.string(), type: z.string(), consulte_le: z.string().optional(), accessible: z.boolean().optional(),
  })),
  faits: z.array(z.object({
    id: z.string(),
    categorie: z.enum(CATEGORIES),
    fait: z.string().min(1),
    source_nom: z.string().optional(),
    source_url: z.string().regex(/^https?:\/\//, "source_url doit être une URL"),
    date_fait: isoDate.nullable(),
    fiabilite: z.enum(["haute", "moyenne", "faible"]),
    statut: z.enum(["verifie", "interpretation"]),
  })),
  interlocuteurs: z.array(z.object({
    nom: z.string(), role: z.string(), contact_public: z.string().nullable().optional(),
    source_url: z.string().regex(/^https?:\/\//), date: z.string().nullable().optional(),
  })).default([]),
  top3: z.array(z.object({ fait_id: z.string(), interet: z.string().min(1), angle: z.string().min(1), accroche: z.string().min(1) })).max(3),
  accroche_recommandee: z.string().optional(),
  objectif_personnalisation: z.string().optional(),
  arguments: z.array(z.string()).default([]),
  ne_pas_utiliser: z.array(z.object({ element: z.string(), raison: z.string() })),
  aucune_info_pertinente: z.boolean().default(false),
  limites: z.string(),
});
export type Dossier = z.infer<typeof dossierSchema>;

const ACTUALITE_ANCIENNE_JOURS = 180;

export function validerDossier(input: unknown, today: Date): { dossier: Dossier | null; erreurs: string[]; avertissements: string[] } {
  const parsed = dossierSchema.safeParse(input);
  if (!parsed.success) {
    return { dossier: null, erreurs: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`), avertissements: [] };
  }
  const d = parsed.data;
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const day = (t: string) => new Date(`${t}T00:00:00Z`);
  if (day(d.verifie_le) > today) erreurs.push("verifie_le est dans le futur");
  const faits = new Map(d.faits.map((f) => [f.id, f]));
  for (const f of d.faits) {
    if (f.date_fait && day(f.date_fait) > today) erreurs.push(`fait ${f.id} : date_fait dans le futur`);
    if (f.categorie === "actualite") {
      if (!f.date_fait) avertissements.push(`fait ${f.id} : actualité sans date — ne pas la présenter comme récente`);
      else if ((today.getTime() - day(f.date_fait).getTime()) / 86400000 > ACTUALITE_ANCIENNE_JOURS)
        avertissements.push(`fait ${f.id} : actualité de plus de ${ACTUALITE_ANCIENNE_JOURS} jours — ancienne`);
    }
  }
  for (const t of d.top3) {
    const f = faits.get(t.fait_id);
    if (!f) { erreurs.push(`top3 : fait_id ${t.fait_id} inexistant`); continue; }
    if (f.statut !== "verifie") avertissements.push(`top3 : ${t.fait_id} est une interprétation, pas un fait vérifié`);
    if (f.fiabilite === "faible") avertissements.push(`top3 : ${t.fait_id} a une fiabilité faible`);
  }
  if (!d.top3.length && !d.aucune_info_pertinente) erreurs.push("top3 vide : indiquer aucune_info_pertinente = true si rien de fiable n'a été trouvé");
  return { dossier: erreurs.length ? null : d, erreurs, avertissements };
}

export function fraicheur(verifieLe: string, today: Date): { label: "FRAIS" | "À REVÉRIFIER" | "PÉRIMÉ"; jours: number } {
  const jours = Math.round((today.getTime() - new Date(`${verifieLe}T00:00:00Z`).getTime()) / 86400000);
  return { label: jours <= 30 ? "FRAIS" : jours <= 90 ? "À REVÉRIFIER" : "PÉRIMÉ", jours };
}
