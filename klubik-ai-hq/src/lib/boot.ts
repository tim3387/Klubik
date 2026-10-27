// Démarrage côté Node : applique le schéma de la base (idempotent), puis lance le moteur des missions
// dans le même processus que le serveur web (hébergement « toujours allumé »).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSql } from "./db";
import { startWorker } from "./engine/worker";

export async function boot() {
  if (!process.env.DATABASE_URL) {
    console.warn("[démarrage] DATABASE_URL absent : base et moteur des missions non initialisés.");
    return;
  }
  try {
    await getSql().unsafe(readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8"));
    console.log("[démarrage] schéma de la base vérifié.");
  } catch (e) {
    console.error("[démarrage] application du schéma impossible :", e instanceof Error ? e.message : e);
  }
  if (process.env.WORKER_ENABLED !== "false") startWorker();
}
