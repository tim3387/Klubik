// Réponses instantanées de Popi, calculées directement sur le CRM par les règles déterministes :
// aucun appel à l'IA, coût 0 $. Elles s'inscrivent dans la conversation comme une réponse de Popi.
import { NextResponse, type NextRequest } from "next/server";
import { TOOLS } from "@/lib/agents/tools";
import { getSql } from "@/lib/db";
import { crmCount } from "@/lib/crm/repo";
import { todayUtc } from "@/lib/crm/rules";
import { QUICK, type QuickKind } from "@/lib/quick";
import { guard } from "@/lib/session";

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { kind?: QuickKind; texte?: string; conversationId?: string | null };
  const q = body.kind && QUICK[body.kind];
  if (!q) return NextResponse.json({ error: "Demande inconnue." }, { status: 400 });
  const texte = (body.texte ?? "").trim().slice(0, 200);
  if (body.kind === "chercher" && !texte) return NextResponse.json({ error: "Indique le nom (ou une partie) du club." }, { status: 400 });
  const sql = getSql();
  if ((await crmCount(sql)) === 0) return NextResponse.json({ error: "Le CRM n'est pas encore importé." }, { status: 409 });

  const tool = TOOLS[q.tool];
  const input = tool.schema.parse(body.kind === "chercher" ? { texte } : q.input);
  const resultat = await sql.begin((tx) =>
    tool.run(input, { tx, today: todayUtc(), taskId: "", rootId: "", agentId: "popi", conversationId: null }),
  );

  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const [c] = await sql<{ agent_id: string }[]>`select agent_id from conversations where id = ${conversationId}`;
    if (c?.agent_id !== "popi") conversationId = null;
  }
  const question = body.kind === "chercher" ? `⚡ ${q.label} : ${texte}` : `⚡ ${q.label}`;
  if (!conversationId) {
    const [c] = await sql<{ id: string }[]>`insert into conversations (agent_id, title) values ('popi', ${question.slice(2)}) returning id`;
    conversationId = c.id;
  }
  await sql`insert into chat_messages (conversation_id, role, content) values (${conversationId}, 'user', ${question})`;
  await sql`insert into chat_messages (conversation_id, role, agent_id, content, meta)
            values (${conversationId}, 'agent', 'popi', ${`${resultat}\n\n_Réponse instantanée calculée sur le CRM — sans IA, 0 $._`}, ${sql.json({ instantane: true } as never)})`;
  await sql`update conversations set updated_at = now() where id = ${conversationId}`;
  return NextResponse.json({ conversationId });
}
