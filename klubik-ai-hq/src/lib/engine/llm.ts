// Accès à l'API Claude. Interface minimale pour pouvoir tester le moteur sans appel réseau.
import Anthropic from "@anthropic-ai/sdk";

export type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
export interface LlmClient {
  create(params: CreateParams): Promise<Anthropic.Beta.BetaMessage>;
}

let client: Anthropic | null = null;

export function anthropicClient(): LlmClient {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquante : les agents ne peuvent pas fonctionner (à renseigner dans les secrets de l'hébergeur).");
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return {
    // Streaming + finalMessage : évite les délais d'attente HTTP sur les longues réponses.
    create: (params) => client!.beta.messages.stream(params).finalMessage(),
  };
}

/** Erreurs temporaires (à réessayer plus tard) : quota, surcharge, réseau. */
export function isRetryable(e: unknown): boolean {
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && (e.status >= 500 || e.status === 429)) return true;
  return false;
}
