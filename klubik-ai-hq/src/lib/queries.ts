// Lectures pour l'interface (toutes côté serveur).
import { getSql } from "./db";
import { loadClubs, loadSettings, crmCount } from "./crm/repo";
import { stats, relances, todayUtc } from "./crm/rules";

export interface ChatMessage { id: number; role: "user" | "agent" | "event"; agent_id: string | null; content: string; created_at: string }
export interface TaskInfo { id: string; agent_id: string; status: string; title: string; steps: number; error: string | null }

export async function crmSummary() {
  const sql = getSql();
  if ((await crmCount(sql)) === 0) return null;
  const [st, clubs] = await Promise.all([loadSettings(sql), loadClubs(sql)]);
  const today = todayUtc();
  return { stats: stats(clubs, st, today), relances: relances(clubs, st, today, 7) };
}

export async function monthCost(): Promise<number> {
  const [r] = await getSql()<{ total: string }[]>`select coalesce(sum(cost_usd), 0) as total from usage_log where created_at >= date_trunc('month', now())`;
  return Number(r.total);
}

export async function pendingActions(limit = 50) {
  return getSql()<{ id: string; kind: string; title: string; agent_id: string; club_id: number | null; payload: any; created_at: string; status: string; result: any; conversation_id: string | null }[]>`
    select id, kind, title, agent_id, club_id, payload, created_at, status, result, conversation_id from actions
    where status = 'pending' order by created_at desc limit ${limit}`;
}

export async function recentActions(limit = 30) {
  return getSql()<{ id: string; kind: string; title: string; agent_id: string; status: string; created_at: string; decided_at: string | null; result: any }[]>`
    select id, kind, title, agent_id, status, created_at, decided_at, result from actions
    where status <> 'pending' order by coalesce(decided_at, created_at) desc limit ${limit}`;
}

export async function missions(limit = 50) {
  return getSql()<{ id: string; agent_id: string; title: string; status: string; created_at: string; finished_at: string | null; conversation_id: string | null; agents: string[]; cost: string; open: number; failed: number }[]>`
    select r.id, r.agent_id, r.title, r.status, r.created_at, r.finished_at, r.conversation_id,
           array_agg(distinct t.agent_id) as agents, sum(t.cost_usd)::text as cost,
           count(*) filter (where t.status in ('ready', 'running', 'waiting'))::int as open,
           count(*) filter (where t.status = 'failed')::int as failed
    from tasks r join tasks t on t.root_id = r.id
    where r.parent_id is null
    group by r.id order by r.created_at desc limit ${limit}`;
}

export async function missionDetail(id: string) {
  const sql = getSql();
  const tasks = await sql<{ id: string; parent_id: string | null; agent_id: string; title: string; status: string; result: string | null; error: string | null; steps: number; cost_usd: string; created_at: string; finished_at: string | null; conversation_id: string | null }[]>`
    select id, parent_id, agent_id, title, status, result, error, steps, cost_usd::text, created_at, finished_at, conversation_id
    from tasks where root_id = ${id} order by created_at`;
  const actions = await sql<{ id: string; kind: string; title: string; status: string }[]>`select id, kind, title, status from actions where root_id = ${id} order by created_at`;
  return { tasks, actions };
}

export async function recentConversations(limit = 8) {
  return getSql()<{ id: string; agent_id: string; title: string | null; updated_at: string; last: string | null }[]>`
    select c.id, c.agent_id, c.title, c.updated_at,
      (select content from chat_messages m where m.conversation_id = c.id and m.role in ('user', 'agent') order by id desc limit 1) as last
    from conversations c order by c.updated_at desc limit ${limit}`;
}

export async function agentConversations(agentId: string, limit = 30) {
  return getSql()<{ id: string; title: string | null; updated_at: string }[]>`
    select id, title, updated_at from conversations where agent_id = ${agentId} order by updated_at desc limit ${limit}`;
}

export async function conversationMessages(conversationId: string, after = 0): Promise<ChatMessage[]> {
  return getSql()<ChatMessage[]>`
    select id::int, role, agent_id, content, created_at from chat_messages
    where conversation_id = ${conversationId} and id > ${after} order by id limit 300`;
}

export async function conversationActivity(conversationId: string): Promise<TaskInfo[]> {
  return getSql()<TaskInfo[]>`
    select t.id, t.agent_id, t.status, t.title, t.steps, t.error from tasks t
    where t.conversation_id = ${conversationId} and t.status in ('ready', 'running', 'waiting') order by t.created_at`;
}
