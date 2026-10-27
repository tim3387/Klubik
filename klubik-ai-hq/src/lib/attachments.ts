// Captures d'écran jointes aux conversations. Elles sont stockées en base (privées, servies uniquement
// à l'utilisateur connecté) et référencées dans les transcriptions des tâches par leur identifiant :
// le contenu n'est chargé qu'au moment de l'appel à l'API (pas de copies multiples en base).
import type Anthropic from "@anthropic-ai/sdk";
import type { Q } from "./db";

export const MAX_PER_MESSAGE = 5;
export const MAX_BYTES = 5 * 1024 * 1024;
export const short = (id: string) => id.slice(0, 8);

type Block = Anthropic.Beta.BetaContentBlockParam;
type Msg = Anthropic.Beta.BetaMessageParam;
/** Référence interne, remplacée par l'image réelle juste avant l'appel à l'API. */
export interface AttachmentRef { type: "image"; source: { type: "attachment"; id: string } }

/** Type réel du fichier d'après sa signature (on ne fait pas confiance au type annoncé). */
export function detectImageType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

export const refs = (ids: string[]): AttachmentRef[] => ids.map((id) => ({ type: "image", source: { type: "attachment", id } }));

const isRef = (b: unknown): b is AttachmentRef =>
  !!b && typeof b === "object" && (b as AttachmentRef).type === "image" && (b as AttachmentRef).source?.type === "attachment";

/** Remplace les références par les images (base64). Une capture purgée devient une mention textuelle. */
export async function hydrate(sql: Q, messages: Msg[]): Promise<Msg[]> {
  const ids = new Set<string>();
  for (const m of messages) if (Array.isArray(m.content)) for (const b of m.content as unknown[]) if (isRef(b)) ids.add(b.source.id);
  if (!ids.size) return messages;
  const rows = await sql<{ id: string; media_type: string; bytes: Buffer | null }[]>`
    select id::text, media_type, bytes from attachments where id::text in ${sql([...ids])}`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: (m.content as unknown[]).map((b): Block => {
        if (!isRef(b)) return b as Block;
        const a = byId.get(b.source.id);
        if (!a?.bytes) return { type: "text", text: `[capture ${short(b.source.id)} expirée ou introuvable]` };
        return { type: "image", source: { type: "base64", media_type: a.media_type as "image/jpeg", data: Buffer.from(a.bytes).toString("base64") } };
      }),
    } as Msg;
  });
}

/** Retrouve les captures désignées par Kung (préfixes d'identifiants) parmi celles de la conversation. */
export async function resolveCaptures(sql: Q, conversationId: string | null, prefixes: string[]): Promise<{ ids: string[]; inconnues: string[] }> {
  if (!conversationId || !prefixes.length) return { ids: [], inconnues: prefixes };
  const rows = await sql<{ id: string }[]>`select id::text from attachments where conversation_id = ${conversationId} and message_id is not null`;
  const ids: string[] = [];
  const inconnues: string[] = [];
  for (const p of prefixes) {
    const clean = p.replace(/^#/, "").trim().toLowerCase();
    const hit = rows.find((r) => r.id.startsWith(clean));
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
    else if (!hit) inconnues.push(p);
  }
  return { ids, inconnues };
}

/** Purge le contenu des captures plus anciennes que la durée de conservation (les métadonnées restent). */
export async function purgeOld(sql: Q, days: number): Promise<number> {
  const r = await sql`update attachments set bytes = null where bytes is not null and created_at < now() - make_interval(days => ${days})`;
  return r.count;
}
