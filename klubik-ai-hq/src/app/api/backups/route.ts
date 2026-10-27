// Sauvegardes : lancement manuel, aperçu d'une restauration, restauration (mot de passe exigé).
import { NextResponse, type NextRequest } from "next/server";
import { loadSnapshot, preview, restoreAll, restoreCrm, runBackup, type Source } from "@/lib/backup";
import { getSql } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { guard } from "@/lib/session";

export const maxDuration = 300;

type Body =
  | { action: "run" }
  | { action: "preview"; source: Source }
  | { action: "restore"; source: Source; mode: "crm" | "complete"; password: string };

const validSource = (s: unknown): s is Source =>
  !!s && typeof s === "object" &&
  (((s as Source).kind === "db" && Number.isInteger((s as { id: number }).id)) ||
   ((s as Source).kind === "offsite" && typeof (s as { key: string }).key === "string" && /^[\w\-/.]+\.khqbk$/.test((s as { key: string }).key)));

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const sql = getSql();
  const body = (await req.json().catch(() => ({}))) as Body;
  try {
    if (body.action === "run") {
      const r = await runBackup(sql, "manuelle");
      const externe = r.offsite === "verifiee" ? "copie externe vérifiée" : r.offsite === "non-configuree" ? "copie externe non configurée" : `copie externe en échec : ${r.error}`;
      return NextResponse.json({ ok: r.offsite !== "echec", message: `Sauvegarde n°${r.id} créée (${Math.round(r.size / 1024)} Ko, chiffrée) · ${externe}.` });
    }
    if (body.action === "preview" && validSource(body.source)) {
      const { snap } = await loadSnapshot(sql, body.source);
      return NextResponse.json({ ok: true, apercu: await preview(sql, snap) });
    }
    if (body.action === "restore" && validSource(body.source)) {
      const [row] = await sql<{ password_hash: string }[]>`select password_hash from app_auth where id = 1`;
      const hash = process.env.OWNER_PASSWORD_HASH || row?.password_hash || "";
      if (!hash || !verifyPassword(body.password ?? "", hash)) return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
      const { snap } = await loadSnapshot(sql, body.source);
      const date = new Date(snap.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
      if (body.mode === "complete") {
        const v = await restoreAll(sql, snap);
        return NextResponse.json({ ok: v.ok, message: v.ok ? `Base restaurée : ${v.clubs} clubs vérifiés un par un, conversations et historique rétablis.` : `Écarts détectés : ${v.ecarts.join(", ")}` });
      }
      const r = await restoreCrm(sql, snap, date);
      return NextResponse.json({
        ok: r.verification.ok,
        message: r.verification.ok
          ? `CRM restauré à l'état du ${date} : ${r.verification.clubs} clubs vérifiés. L'état précédent a été sauvegardé (n°${r.securite.id}).`
          : `Écarts détectés après restauration : ${r.verification.ecarts.join(", ")}`,
      });
    }
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
