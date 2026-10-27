// Réglages modifiables depuis l'app (table app_settings) : modèles par agent, plafonds de dépense,
// conservation des captures. Les variables d'environnement ne servent que de valeurs par défaut.
import { z } from "zod";
import type { Q } from "./db";
import { AGENT_IDS, type AgentId } from "./agents/definitions";

export const MODELES = {
  "claude-haiku-5-5": { label: "Haiku 5.5", note: "le plus économique — tâches simples et structurées" },
  "claude-sonnet-5-5": { label: "Sonnet 5.5", note: "équilibré — recommandé pour la plupart des missions" },
  "claude-opus-5-5": { label: "Opus 5.5", note: "le plus puissant — réflexion approfondie, 2× le prix de Sonnet" },
} as const;
export type ModelId = keyof typeof MODELES;
const modelIds = Object.keys(MODELES) as [ModelId, ...ModelId[]];

const schema = z.object({
  monthlyBudget: z.number().min(0).max(1000),
  missionBudget: z.number().min(0).max(100),
  models: z.object({ kung: z.enum(modelIds), popi: z.enum(modelIds), jojo: z.enum(modelIds), bililou: z.enum(modelIds) }),
  deepModel: z.enum(modelIds),
  attachmentDays: z.number().int().min(7).max(3650),
});
export type AppSettings = z.infer<typeof schema>;

export function defaults(): AppSettings {
  return {
    monthlyBudget: Number(process.env.MONTHLY_BUDGET_USD ?? 30),
    missionBudget: Number(process.env.MISSION_BUDGET_USD ?? 3),
    // Popi travaille sur des données structurées avec des règles déterministes : Haiku suffit.
    models: { kung: "claude-sonnet-5-5", popi: "claude-haiku-5-5", jojo: "claude-sonnet-5-5", bililou: "claude-sonnet-5-5" },
    deepModel: "claude-opus-5-5",
    attachmentDays: 180,
  };
}

let cache: { at: number; value: AppSettings } | null = null;

export async function getSettings(sql: Q): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const [row] = await sql<{ value: Partial<AppSettings> }[]>`select value from app_settings where key = 'config'`;
  const d = defaults();
  const merged = { ...d, ...(row?.value ?? {}), models: { ...d.models, ...(row?.value?.models ?? {}) } };
  const parsed = schema.safeParse(merged);
  const value = parsed.success ? parsed.data : d;
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(sql: Q, patch: unknown): Promise<{ ok: true; value: AppSettings } | { ok: false; error: string }> {
  const current = await getSettings(sql);
  const p = (patch ?? {}) as Partial<AppSettings>;
  const next = { ...current, ...p, models: { ...current.models, ...(p.models ?? {}) } };
  const parsed = schema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ") };
  await sql`insert into app_settings (key, value, updated_at) values ('config', ${sql.json(parsed.data as never)}, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  cache = null;
  return { ok: true, value: parsed.data };
}

/** Niveau de réflexion par agent. Sur les modèles 5.5, l'effort est le principal levier de coût. */
export function effortFor(agent: AgentId, model: string, deep: boolean): "low" | "medium" | "high" {
  if (deep) return "high";
  if (agent === "popi") return "low";
  return model === "claude-haiku-5-5" ? "low" : "medium";
}

/** Les modèles Haiku n'acceptent pas le repli automatique côté serveur. */
export const supportsFallback = (model: string) => !model.startsWith("claude-haiku");

/** Versions récentes des outils web (filtrage dynamique) : Opus/Sonnet 5.x ; sinon versions de base. */
export const recentWebTools = (model: string) => /^claude-(opus|sonnet)-5/.test(model);

export const isAgent = (x: string): x is AgentId => (AGENT_IDS as string[]).includes(x);
