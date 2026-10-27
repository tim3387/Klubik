// Moteur d'exécution durable. Une « tâche » = un agent qui travaille sur une consigne.
// Chaque étape = 1 appel à l'API + exécution des outils, puis sauvegarde atomique en base.
// Si le serveur redémarre, la tâche reprend à la dernière étape sauvegardée.
// Les délégations de Kung créent des tâches enfants ; le parent attend leurs résultats.
import type Anthropic from "@anthropic-ai/sdk";
import type { Sql, Tx } from "../db";
import { AGENT_IDS, PROFILES, runtimes, type AgentId } from "../agents/definitions";
import { DELEGATE_TOOL, TOOLS, toolDefinitions } from "../agents/tools";
import { todayUtc, fr } from "../crm/rules";
import { hydrate, refs, resolveCaptures, short } from "../attachments";
import { effortFor, getSettings, MODELES, recentWebTools, supportsFallback } from "../settings";
import { costOf } from "./cost";
import { isRetryable, type LlmClient } from "./llm";

type Msg = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;
type Pending = ToolResult | { pending_child: string; tool_use_id: string };

export interface TaskRow {
  id: string;
  root_id: string | null;
  parent_id: string | null;
  parent_tool_use_id: string | null;
  conversation_id: string | null;
  agent_id: AgentId;
  title: string;
  input: string;
  status: string;
  transcript: Msg[];
  pending_results: Pending[];
  steps: number;
  attempts: number;
  model: string | null;
  deep: boolean;
}

export const LIMITS = {
  maxSteps: Number(process.env.MAX_STEPS_PER_TASK ?? 30),
  maxAttempts: 5,
  // Captures renvoyées au modèle : celles des N derniers messages qui en contiennent (au-delà, mention textuelle).
  imagesHistory: 3,
};
const nomModele = (m: string) => MODELES[m as keyof typeof MODELES]?.label ?? m;

const nomAgent = (id: string) => PROFILES[id as AgentId]?.nom ?? id;

async function postEvent(tx: Tx | Sql, conversationId: string | null, agentId: string, content: string, taskId: string) {
  if (!conversationId) return;
  await tx`insert into chat_messages (conversation_id, role, agent_id, content, task_id) values (${conversationId}, 'event', ${agentId}, ${content}, ${taskId})`;
}

/** Crée la tâche racine d'une demande de Timothé dans une conversation. */
export async function createRootTask(sql: Sql, args: { agentId: AgentId; conversationId: string; text: string; deep?: boolean }) {
  const history = await sql<{ id: number; role: string; content: string; attachments: string[] | null }[]>`
    select m.id::int, m.role, m.content,
           (select array_agg(a.id::text order by a.created_at) from attachments a where a.message_id = m.id) as attachments
    from chat_messages m where m.conversation_id = ${args.conversationId} and m.role in ('user', 'agent')
    order by m.id desc limit 20`;
  history.reverse();
  // Seules les captures des derniers messages sont renvoyées au modèle (coût maîtrisé).
  const withImages = history.filter((h) => h.role === "user" && h.attachments?.length).slice(-LIMITS.imagesHistory).map((h) => h.id);
  const transcript: Msg[] = [];
  history.forEach((h, i) => {
    const role = h.role === "user" ? "user" : "assistant";
    if (!transcript.length && role === "assistant") return; // le premier message doit venir de l'utilisateur
    const last = i === history.length - 1;
    let text = last ? `[Contexte : nous sommes le ${fr(todayUtc())}.]\n\n${args.text}` : h.content;
    if (role === "user" && h.attachments?.length) {
      const liste = h.attachments.map((a) => `#${short(a)}`).join(", ");
      if (withImages.includes(h.id)) {
        text = `[Captures d'écran jointes par Timothé : ${liste}]\n\n${text}`;
        transcript.push({ role, content: [...refs(h.attachments), { type: "text", text }] as never });
        return;
      }
      text = `[Captures jointes précédemment (${liste}), non renvoyées]\n\n${text}`;
    }
    transcript.push({ role, content: text });
  });
  const settings = await getSettings(sql);
  const model = args.deep ? settings.deepModel : settings.models[args.agentId];
  const [t] = await sql<{ id: string }[]>`
    insert into tasks (agent_id, conversation_id, title, input, status, transcript, model, deep)
    values (${args.agentId}, ${args.conversationId}, ${args.text.slice(0, 120)}, ${args.text}, 'ready', ${sql.json(transcript as never)}, ${model}, ${!!args.deep})
    returning id`;
  await sql`update tasks set root_id = id where id = ${t.id}`;
  return t.id;
}

/** Réserve la prochaine tâche exécutable (ou une tâche abandonnée par un serveur arrêté). */
export async function claimNext(sql: Sql): Promise<TaskRow | null> {
  const rows = await sql<TaskRow[]>`
    update tasks set status = 'running', locked_until = now() + interval '15 minutes', updated_at = now(),
      attempts = attempts + case when status = 'running' then 1 else 0 end -- reprise après arrêt brutal du serveur
    where id = (
      select id from tasks
      where (status = 'ready' and not_before <= now()) or (status = 'running' and locked_until < now())
      order by created_at limit 1 for update skip locked
    )
    returning id, root_id, parent_id, parent_tool_use_id, conversation_id, agent_id, title, input, status, transcript, pending_results, steps, attempts, model, deep`;
  return rows[0] ?? null;
}

async function budgetDepasse(sql: Sql, rootId: string): Promise<string | null> {
  const { monthlyBudget, missionBudget } = await getSettings(sql);
  const [m] = await sql<{ total: string }[]>`select coalesce(sum(cost_usd), 0) as total from usage_log where created_at >= date_trunc('month', now())`;
  if (Number(m.total) >= monthlyBudget)
    return `Plafond mensuel atteint (${Number(m.total).toFixed(2)} $ / ${monthlyBudget} $). Tu peux le relever dans Réglages.`;
  const [r] = await sql<{ total: string }[]>`select coalesce(sum(cost_usd), 0) as total from tasks where root_id = ${rootId}`;
  if (Number(r.total) >= missionBudget)
    return `Plafond par mission atteint (${Number(r.total).toFixed(2)} $ / ${missionBudget} $). Mission arrêtée par sécurité (réglable dans Réglages).`;
  return null;
}

export async function fail(sql: Sql, task: TaskRow, error: string) {
  await sql.begin(async (tx) => {
    await tx`update tasks set status = 'failed', error = ${error}, locked_until = null, finished_at = now(), updated_at = now() where id = ${task.id}`;
    await onFinished(tx, { ...task, status: "failed" }, null, error);
  });
}

/** Exécute UNE étape d'une tâche réservée. */
export async function runStep(sql: Sql, llm: LlmClient, task: TaskRow): Promise<void> {
  const rootId = task.root_id ?? task.id;
  const rt = runtimes()[task.agent_id];
  if (!rt) return fail(sql, task, `Agent inconnu : ${task.agent_id}`);
  if (task.steps >= LIMITS.maxSteps) return fail(sql, task, `Nombre maximal d'étapes atteint (${LIMITS.maxSteps}).`);
  if (task.attempts >= LIMITS.maxAttempts) return fail(sql, task, `Trop d'interruptions successives (${task.attempts}).`);
  const budget = await budgetDepasse(sql, rootId);
  if (budget) return fail(sql, task, budget);

  const transcript: Msg[] = task.transcript.length ? task.transcript : [{ role: "user", content: task.input }];
  const model = task.model ?? (await getSettings(sql)).models[task.agent_id];
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await llm.create({
      model,
      max_tokens: 32000,
      system: [{ type: "text", text: rt.system, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions(rt.tools, rt.web, recentWebTools(model)),
      messages: await hydrate(sql, transcript), // les captures ne sont chargées qu'ici
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive" },
      output_config: { effort: effortFor(task.agent_id, model, task.deep) },
      // Repli automatique si le modèle refuse (sécurité) ; non disponible sur Haiku.
      ...(supportsFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isRetryable(e) && task.attempts + 1 < LIMITS.maxAttempts) {
      const delai = Math.min(300, 15 * 2 ** task.attempts);
      await sql`update tasks set status = 'ready', attempts = attempts + 1, locked_until = null,
                not_before = now() + make_interval(secs => ${delai}), error = ${`Nouvel essai dans ${delai} s : ${msg}`}, updated_at = now()
                where id = ${task.id}`;
      return;
    }
    return fail(sql, task, `Erreur de l'API Claude : ${msg}`);
  }

  const usage = costOf(response.model ?? model, response.usage); // modèle réellement utilisé (repli compris)
  transcript.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
  const texte = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

  await sql.begin(async (tx) => {
    await tx`insert into usage_log (task_id, agent_id, model, input_tokens, output_tokens, cache_read, cache_write, web_searches, cost_usd)
             values (${task.id}, ${task.agent_id}, ${usage.model}, ${usage.input_tokens}, ${usage.output_tokens}, ${usage.cache_read}, ${usage.cache_write}, ${usage.web_searches}, ${usage.cost_usd})`;
    const base = { steps: task.steps + 1, cost: usage.cost_usd };
    const save = async (status: string, extra: { pending?: Pending[]; result?: string | null; error?: string | null } = {}) => {
      await tx`update tasks set status = ${status}, transcript = ${tx.json(transcript as never)},
               pending_results = ${tx.json((extra.pending ?? []) as never)}, result = ${extra.result ?? null}, error = ${extra.error ?? null},
               steps = ${base.steps}, attempts = 0, cost_usd = cost_usd + ${base.cost}, locked_until = null, updated_at = now(),
               finished_at = ${status === "done" || status === "failed" ? new Date() : null}
               where id = ${task.id}`;
    };

    switch (response.stop_reason) {
      case "pause_turn":
        await save("ready"); // la recherche web reprend à l'étape suivante
        return;
      case "refusal":
        await save("failed", { error: "La demande a été refusée par les filtres de sécurité du modèle." });
        await onFinished(tx, { ...task, status: "failed" }, null, "Demande refusée par les filtres de sécurité du modèle.");
        return;
      case "max_tokens":
        await save("failed", { error: "Réponse trop longue (limite de tokens atteinte)." });
        await onFinished(tx, { ...task, status: "failed" }, null, "Réponse trop longue (limite de tokens atteinte).");
        return;
      case "tool_use": {
        const pending: Pending[] = [];
        let enfants = 0;
        for (const b of response.content) {
          if (b.type !== "tool_use") continue;
          if (b.name === DELEGATE_TOOL.name && rt.tools.includes("deleguer")) {
            const parsed = DELEGATE_TOOL.schema.safeParse(b.input);
            if (!parsed.success) {
              pending.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: `Entrée invalide : ${parsed.error.issues.map((i) => i.message).join(", ")}` });
              continue;
            }
            const { agent, consigne, captures = [] } = parsed.data;
            const childInput = `[Contexte : nous sommes le ${fr(todayUtc())}. Consigne de Kung (Timothé ne voit pas ce brief, il verra la synthèse de Kung).]\n\n${consigne}`;
            const cap = await resolveCaptures(tx, task.conversation_id, captures);
            if (cap.inconnues.length) {
              pending.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: `Captures introuvables : ${cap.inconnues.join(", ")}. Utilise les identifiants indiqués dans le message de Timothé (ex. a1b2c3d4).` });
              continue;
            }
            const childTranscript: Msg[] = cap.ids.length
              ? [{ role: "user", content: [...refs(cap.ids), { type: "text", text: `[Captures d'écran transmises par Kung : ${cap.ids.map((x) => `#${short(x)}`).join(", ")}]\n\n${childInput}` }] as never }]
              : [];
            const childModel = (await getSettings(tx)).models[agent];
            const [child] = await tx<{ id: string }[]>`
              insert into tasks (root_id, parent_id, parent_tool_use_id, conversation_id, agent_id, title, input, status, transcript, model)
              values (${rootId}, ${task.id}, ${b.id}, ${task.conversation_id}, ${agent}, ${consigne.slice(0, 120)}, ${childInput}, 'ready', ${tx.json(childTranscript as never)}, ${childModel})
              returning id`;
            pending.push({ pending_child: child.id, tool_use_id: b.id });
            enfants++;
            await postEvent(tx, task.conversation_id, task.agent_id, `${nomAgent(task.agent_id)} → ${nomAgent(agent)} : ${consigne.slice(0, 160)}${consigne.length > 160 ? "…" : ""}`, task.id);
            continue;
          }
          const def = TOOLS[b.name];
          if (!def || !rt.tools.includes(b.name)) {
            pending.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: `Outil non autorisé pour ${nomAgent(task.agent_id)} : ${b.name}` });
            continue;
          }
          const parsed = def.schema.safeParse(b.input);
          if (!parsed.success) {
            pending.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: `Entrée invalide : ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}` });
            continue;
          }
          try {
            const out = await tx.savepoint((sp) =>
              def.run(parsed.data, { tx: sp, today: todayUtc(), taskId: task.id, rootId, agentId: task.agent_id, conversationId: task.conversation_id }),
            );
            pending.push({ type: "tool_result", tool_use_id: b.id, content: out });
            if (b.name === "crm_proposer_mise_a_jour" && out.startsWith("PROPOSITION"))
              await postEvent(tx, task.conversation_id, task.agent_id, `${nomAgent(task.agent_id)} a préparé une mise à jour du CRM — à valider dans « Actions ».`, task.id);
            if (b.name === "brouillon_enregistrer" && out.startsWith("BROUILLON"))
              await postEvent(tx, task.conversation_id, task.agent_id, `${nomAgent(task.agent_id)} a préparé un brouillon — à copier depuis « Actions ».`, task.id);
            if (b.name === "intel_enregistrer" && out.startsWith("DOSSIER ENREGISTRÉ"))
              await postEvent(tx, task.conversation_id, task.agent_id, `${nomAgent(task.agent_id)} a enregistré un dossier de renseignement.`, task.id);
          } catch (e) {
            pending.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: `Erreur de l'outil : ${e instanceof Error ? e.message : String(e)}` });
          }
        }
        if (enfants) await save("waiting", { pending });
        else {
          transcript.push({ role: "user", content: pending as ToolResult[] });
          await save("ready");
        }
        return;
      }
      default: {
        // end_turn / stop_sequence : la tâche est terminée.
        const result = texte || "(aucune réponse textuelle)";
        await save("done", { result });
        await onFinished(tx, { ...task, status: "done" }, result, null);
      }
    }
  });
}

/** Fin d'une tâche : réponse dans la conversation (racine) ou réveil du parent (délégation). */
async function onFinished(tx: Tx, task: TaskRow, result: string | null, error: string | null) {
  if (!task.parent_id) {
    if (task.conversation_id) {
      if (result) await tx`insert into chat_messages (conversation_id, role, agent_id, content, task_id) values (${task.conversation_id}, 'agent', ${task.agent_id}, ${result}, ${task.id})`;
      else await postEvent(tx, task.conversation_id, task.agent_id, `⚠ ${nomAgent(task.agent_id)} n'a pas pu terminer : ${error}`, task.id);
      // Coût réel de la mission (tokens facturés × tarifs publics), toutes délégations comprises.
      const lignes = await tx<{ model: string; calls: number; cost: string; searches: number }[]>`
        select u.model, count(*)::int as calls, sum(u.cost_usd)::text as cost, sum(u.web_searches)::int as searches
        from usage_log u join tasks t on t.id = u.task_id where t.root_id = ${task.id} group by u.model order by 3 desc`;
      if (lignes.length) {
        const total = lignes.reduce((x, l) => x + Number(l.cost), 0);
        const recherches = lignes.reduce((x, l) => x + l.searches, 0);
        const detail = lignes.map((l) => `${nomModele(l.model)} ×${l.calls}`).join(", ");
        await postEvent(tx, task.conversation_id, task.agent_id,
          `Coût de la mission : ${total.toFixed(3)} $ · ${detail}${recherches ? ` · ${recherches} recherche${recherches > 1 ? "s" : ""} web` : ""}`, task.id);
      }
      await tx`update conversations set updated_at = now() where id = ${task.conversation_id}`;
    }
    return;
  }
  const [parent] = await tx<{ id: string; status: string; pending_results: Pending[]; transcript: Msg[] }[]>`
    select id, status, pending_results, transcript from tasks where id = ${task.parent_id} for update`;
  if (!parent) return;
  const pending = parent.pending_results.map((p) =>
    "pending_child" in p && p.pending_child === task.id
      ? ({ type: "tool_result", tool_use_id: p.tool_use_id, content: result ? `Résultat de ${nomAgent(task.agent_id)} :\n${result}` : `Échec de ${nomAgent(task.agent_id)} : ${error}`, is_error: !result } as ToolResult)
      : p,
  );
  const restant = pending.some((p) => "pending_child" in p);
  await postEvent(tx, task.conversation_id, task.agent_id, result ? `${nomAgent(task.agent_id)} a terminé sa tâche.` : `⚠ ${nomAgent(task.agent_id)} a échoué : ${error}`, task.id);
  if (restant) {
    await tx`update tasks set pending_results = ${tx.json(pending as never)}, updated_at = now() where id = ${parent.id}`;
  } else {
    const transcript = [...parent.transcript, { role: "user", content: pending as ToolResult[] } as Msg];
    await tx`update tasks set pending_results = '[]'::jsonb, transcript = ${tx.json(transcript as never)}, status = 'ready', not_before = now(), updated_at = now()
             where id = ${parent.id} and status = 'waiting'`;
  }
}

export const isAgentId = (x: string): x is AgentId => (AGENT_IDS as string[]).includes(x);
