// Envoi d'un message à un agent : crée la conversation si besoin et une tâche exécutée en arrière-plan.
import { NextResponse, type NextRequest } from "next/server";
import { MAX_PER_MESSAGE } from "@/lib/attachments";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";
import { createRootTask, isAgentId } from "@/lib/engine/runner";

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    agentId?: string; conversationId?: string | null; text?: string; attachments?: string[]; deep?: boolean;
  };
  const attachments = [...new Set((body.attachments ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x)))];
  if (attachments.length > MAX_PER_MESSAGE) return NextResponse.json({ error: `${MAX_PER_MESSAGE} captures maximum par message.` }, { status: 400 });
  const text = (body.text ?? "").trim() || (attachments.length ? "(voir les captures jointes)" : "");
  if (!body.agentId || !isAgentId(body.agentId)) return NextResponse.json({ error: "Agent inconnu." }, { status: 400 });
  if (!text || text.length > 8000) return NextResponse.json({ error: "Message vide ou trop long (8 000 caractères max)." }, { status: 400 });
  const sql = getSql();
  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const [c] = await sql<{ agent_id: string }[]>`select agent_id from conversations where id = ${conversationId}`;
    if (!c || c.agent_id !== body.agentId) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
    const [busy] = await sql`select 1 from tasks where conversation_id = ${conversationId} and parent_id is null and status in ('ready', 'running', 'waiting')`;
    if (busy) return NextResponse.json({ error: "L'agent travaille encore sur ta demande précédente. Patiente ou ouvre une nouvelle conversation." }, { status: 409 });
  }
  const result = await sql.begin(async (tx) => {
    if (!conversationId) {
      const [c] = await tx<{ id: string }[]>`insert into conversations (agent_id, title) values (${body.agentId!}, ${text.slice(0, 80)}) returning id`;
      conversationId = c.id;
    }
    const [m] = await tx<{ id: string }[]>`
      insert into chat_messages (conversation_id, role, content, meta)
      values (${conversationId}, 'user', ${text}, ${tx.json({ deep: !!body.deep } as never)}) returning id`;
    if (attachments.length) {
      // Seules des captures envoyées et pas encore utilisées peuvent être rattachées.
      const linked = await tx`update attachments set message_id = ${m.id}, conversation_id = ${conversationId}
                              where id::text in ${tx(attachments)} and message_id is null`;
      if (linked.count !== attachments.length) throw new Error("ATTACHMENTS");
    }
    await tx`update conversations set updated_at = now() where id = ${conversationId}`;
    return true;
  }).catch((e: Error) => (e.message === "ATTACHMENTS" ? null : Promise.reject(e)));
  if (!result) return NextResponse.json({ error: "Une capture est introuvable ou déjà utilisée : renvoie-la." }, { status: 400 });
  const taskId = await createRootTask(sql, { agentId: body.agentId, conversationId: conversationId!, text, deep: !!body.deep });
  return NextResponse.json({ conversationId, taskId });
}
