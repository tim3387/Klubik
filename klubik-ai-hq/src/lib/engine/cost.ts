// Coût d'un appel à l'API (tarifs publics Anthropic, USD par million de tokens, vérifiés le 27/10/2026 :
// https://platform.claude.com/docs/en/about-claude/pricing). Recherche web : 10 $ / 1 000 recherches.
import type Anthropic from "@anthropic-ai/sdk";

const PRIX: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-opus-5": { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-fable-5-1": { in: 10, out: 50, cacheWrite: 12.5, cacheRead: 0.25 },
};
const PRIX_INCONNU = PRIX["claude-fable-5-1"]; // modèle inconnu (ex. repli) : tarif le plus élevé, par prudence
const RECHERCHE_WEB = 0.01;

export interface UsageLine {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  web_searches: number;
  cost_usd: number;
}

export function costOf(model: string, usage: Anthropic.Beta.BetaUsage): UsageLine {
  const p = PRIX[model] ?? PRIX_INCONNU;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  const cost = (input * p.in + output * p.out + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) / 1e6 + searches * RECHERCHE_WEB;
  return { model, input_tokens: input, output_tokens: output, cache_read: cacheRead, cache_write: cacheWrite, web_searches: searches, cost_usd: Math.round(cost * 1e6) / 1e6 };
}
