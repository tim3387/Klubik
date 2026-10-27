// Tâches de fond périodiques (même processus que le serveur) : sauvegardes automatiques,
// purge des captures expirées et des envois abandonnés. Un état est exposé pour le diagnostic.
import { purgeOld } from "./attachments";
import { backupDue, runBackup } from "./backup";
import { getSql } from "./db";
import { getSettings } from "./settings";

declare global {
  // eslint-disable-next-line no-var
  var __klubikHealth: { startedAt: number; workerTick: number; maintenanceTick: number; lastError: string | null; lastBackup: string | null };
}
globalThis.__klubikHealth ??= { startedAt: Date.now(), workerTick: 0, maintenanceTick: 0, lastError: null, lastBackup: null };
export const health = () => globalThis.__klubikHealth;

let busy = false;

export async function maintenanceTick(): Promise<void> {
  if (busy) return;
  busy = true;
  const h = health();
  try {
    const sql = getSql();
    const due = await backupDue(sql);
    if (due) {
      const r = await runBackup(sql, due);
      h.lastBackup = `${new Date().toISOString()} · ${due} · externe : ${r.offsite}${r.error ? ` (${r.error})` : ""}`;
      if (r.offsite === "echec") console.error("[sauvegarde] copie externe en échec :", r.error);
    }
    const { attachmentDays } = await getSettings(sql);
    await purgeOld(sql, attachmentDays);
    await sql`delete from attachments where message_id is null and created_at < now() - interval '1 day'`; // envois jamais rattachés
    h.lastError = null;
  } catch (e) {
    h.lastError = e instanceof Error ? e.message : String(e);
    console.error("[maintenance]", h.lastError);
  } finally {
    h.maintenanceTick = Date.now();
    busy = false;
  }
}

export function startMaintenance(): void {
  setTimeout(() => void maintenanceTick(), 60_000); // premier passage une minute après le démarrage
  setInterval(() => void maintenanceTick(), 10 * 60_000);
}
