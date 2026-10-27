// Limitation des tentatives de connexion, persistée en base.
// Principe (recommandation OWASP « device cookies ») : un appareil où Timothé s'est déjà connecté
// a son propre compteur. Les échecs venant d'ailleurs (autre IP, autre appareil) ne peuvent donc
// jamais bloquer ses appareils de confiance. Les inconnus sont limités par IP (blocages de plus en
// plus longs) et par un plafond global qui ne concerne que les nouveaux appareils.
import type { Q } from "./db";

export interface Rule { max: number; windowMin: number; blockMin: number; maxBlockMin: number }

export const RULES = {
  device: { max: 10, windowMin: 15, blockMin: 15, maxBlockMin: 60 },          // appareil de confiance
  ip: { max: 5, windowMin: 15, blockMin: 15, maxBlockMin: 24 * 60 },          // inconnu, par adresse IP
  globalNew: { max: 50, windowMin: 60, blockMin: 60, maxBlockMin: 60 },       // tous les inconnus confondus
  setup: { max: 5, windowMin: 15, blockMin: 15, maxBlockMin: 24 * 60 },
} satisfies Record<string, Rule>;

/** Minutes restantes de blocage (0 si la clé est libre). */
export async function blockedFor(sql: Q, key: string): Promise<number> {
  const [r] = await sql<{ until: Date | null }[]>`select blocked_until as until from auth_throttle where key = ${key}`;
  if (!r?.until) return 0;
  const ms = new Date(r.until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** Enregistre un échec. Au-delà du seuil dans la fenêtre : blocage, de plus en plus long à chaque récidive. */
export async function recordFailure(sql: Q, key: string, rule: Rule): Promise<void> {
  await sql`
    insert into auth_throttle as t (key, failures, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      failures = case when t.window_start < now() - make_interval(mins => ${rule.windowMin}) then 1 else t.failures + 1 end,
      window_start = case when t.window_start < now() - make_interval(mins => ${rule.windowMin}) then now() else t.window_start end`;
  await sql`
    update auth_throttle set
      blocks = blocks + 1,
      failures = 0,
      window_start = now(),
      blocked_until = now() + make_interval(mins => least(${rule.maxBlockMin}, ${rule.blockMin} * power(2, blocks)::int))
    where key = ${key} and failures >= ${rule.max}`;
}

export async function reset(sql: Q, key: string): Promise<void> {
  await sql`delete from auth_throttle where key = ${key}`;
}

/** Adresse du client vue par l'hébergeur (première valeur de X-Forwarded-For). Peut être falsifiée par
 *  un attaquant : c'est pourquoi le plafond global des nouveaux appareils existe en plus. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
