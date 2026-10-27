// Envoi d'un message à un agent : crée la conversation si besoin et une tâche exécutée en arrière-plan.
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";
import { createRootTask, isAgentId } from "@/lib/engine/runner";

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { agentId?: string; conversationId?: string | null; text?: string };
  const text = (body.text ?? "").trim();
  if (!body.agentId || !isAgentId(body.agentId)) return NextResponse.json({ error: "Agent inconnu." }, { status: 400 });
  if (!text || text.length > 8000) return NextResponse.json({ error: "Message vide ou trop long (8 000 caractères max)." }, { status: 400 });
  const sql = getSql();
  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const [c] = await sql<{ agent_id: string }[]>`select agent_id from conversations where id = ${conversationId}`;
    if (!c || c.agent_id !== body.agentId) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
    const [busy] = await sql`select 1 from tasks where conversation_id = ${conversationId} and parent_id is null and status in ('ready', 'running', 'waiting')`;
    if (busy) return NextResponse.json({ error: "L'agent travaille encore sur ta demande précédente. Patiente ou ouvre une nouvelle conversation." }, { status: 409 });
  } else {
    const [c] = await sql<{ id: string }[]>`insert into conversations (agent_id, title) values (${body.agentId}, ${text.slice(0, 80)}) returning id`;
    conversationId = c.id;
  }
  await sql`insert into chat_messages (conversation_id, role, content) values (${conversationId}, 'user', ${text})`;
  await sql`update conversations set updated_at = now() where id = ${conversationId}`;
  const taskId = await createRootTask(sql, { agentId: body.agentId, conversationId: conversationId!, text });
  return NextResponse.json({ conversationId, taskId });
}
