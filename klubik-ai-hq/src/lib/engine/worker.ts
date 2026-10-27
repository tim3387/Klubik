// Boucle de travail qui tourne en continu sur le serveur (indépendante des navigateurs).
// Plusieurs boucles en parallèle : les délégations simultanées de Kung avancent en même temps.
import { getSql } from "../db";
import { anthropicClient, type LlmClient } from "./llm";
import { claimNext, fail, runStep } from "./runner";

declare global {
  // eslint-disable-next-line no-var
  var __klubikWorker: { stop: () => void } | undefined;
}

export async function processOne(llm: LlmClient): Promise<boolean> {
  const sql = getSql();
  const task = await claimNext(sql);
  if (!task) return false;
  try {
    await runStep(sql, llm, task);
  } catch (e) {
    // Erreur inattendue (base, bug) : la tâche est libérée pour un nouvel essai, jamais perdue.
    console.error(`[worker] étape en échec pour la tâche ${task.id}`, e);
    const msg = e instanceof Error ? e.message : String(e);
    if (task.attempts + 1 >= 5) {
      // Échecs répétés : la tâche échoue proprement (le parent ou la conversation en est informé).
      await fail(sql, task, `Échecs répétés : ${msg}`).catch((err) => console.error("[worker] échec non enregistré", err));
    } else {
      await sql`update tasks set status = 'ready', attempts = attempts + 1, locked_until = null,
                not_before = now() + interval '30 seconds', error = ${msg}
                where id = ${task.id}`;
    }
  }
  return true;
}

export function startWorker() {
  if (globalThis.__klubikWorker) return;
  let running = true;
  const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 3));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const loop = async (n: number) => {
    let llm: LlmClient | null = null;
    let signale = false;
    while (running) {
      if (!process.env.ANTHROPIC_API_KEY) {
        // Sans clé, les demandes restent en file (rien n'est perdu) et seront traitées dès qu'elle sera configurée.
        if (!signale && n === 0) console.warn("[worker] ANTHROPIC_API_KEY absente : les missions restent en file d'attente.");
        signale = true;
        await sleep(60000);
        continue;
      }
      try {
        llm ??= anthropicClient();
        const worked = await processOne(llm);
        if (!worked) await sleep(1500);
      } catch (e) {
        console.error(`[worker ${n}]`, e instanceof Error ? e.message : e);
        await sleep(10000);
      }
    }
  };
  for (let i = 0; i < concurrency; i++) void loop(i);
  globalThis.__klubikWorker = { stop: () => { running = false; } };
  console.log(`[worker] démarré (${concurrency} boucles)`);
}
