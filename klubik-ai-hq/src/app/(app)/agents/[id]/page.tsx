import { notFound } from "next/navigation";
import Chat from "@/components/Chat";
import { PROFILES } from "@/lib/agents/definitions";
import { isAgentId } from "@/lib/engine/runner";
import { getSql } from "@/lib/db";
import { agentConversations, conversationActivity, conversationMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { id } = await params;
  const { c } = await searchParams;
  if (!isAgentId(id)) notFound();
  const profile = PROFILES[id];
  const history = await agentConversations(id);
  let conversationId: string | null = null;
  if (c && /^[0-9a-f-]{36}$/.test(c)) {
    const [row] = await getSql()<{ agent_id: string }[]>`select agent_id from conversations where id = ${c}`;
    if (row?.agent_id === id) conversationId = c;
  }
  const [messages, activity] = conversationId ? await Promise.all([conversationMessages(conversationId), conversationActivity(conversationId)]) : [[], []];
  return (
    <Chat
      key={conversationId ?? "new"}
      profile={profile}
      history={history.map((h) => ({ id: h.id, title: h.title, updated_at: String(h.updated_at) }))}
      initialConversationId={conversationId}
      initialMessages={messages.map((m) => ({ ...m, created_at: String(m.created_at) }))}
      initialActivity={activity}
      apiReady={!!process.env.ANTHROPIC_API_KEY}
    />
  );
}
