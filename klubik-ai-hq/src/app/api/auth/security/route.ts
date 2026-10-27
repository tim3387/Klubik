// Gestion de la sécurité du compte : appareils de confiance, déconnexion générale, changement de mot de passe.
import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { currentSession } from "@/lib/session";

type Body =
  | { action: "revoke"; id: string }
  | { action: "logout-others" }
  | { action: "password"; current: string; next: string };

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!s) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const sql = getSql();

  // Après un changement de génération, la session courante est réémise pour rester connecté sur cet appareil.
  const reissue = async (message: string) => {
    const [g] = await sql<{ session_gen: number }[]>`update app_auth set session_gen = session_gen + 1 where id = 1 returning session_gen`;
    const res = NextResponse.json({ ok: true, message });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(s.email, s.device, g.session_gen), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
    });
    return res;
  };

  if (body.action === "revoke") {
    if (body.id === s.device) return NextResponse.json({ error: "Utilise « Se déconnecter » pour cet appareil." }, { status: 400 });
    await sql`update auth_devices set revoked_at = now() where id::text = ${body.id} and revoked_at is null`;
    return NextResponse.json({ ok: true, message: "Appareil retiré : il devra se reconnecter avec le mot de passe." });
  }

  if (body.action === "logout-others") {
    await sql`update auth_devices set revoked_at = now() where id::text <> ${s.device} and revoked_at is null`;
    return reissue("Tous les autres appareils sont déconnectés et ne sont plus de confiance.");
  }

  if (body.action === "password") {
    if (process.env.OWNER_PASSWORD_HASH) {
      return NextResponse.json({ error: "Le mot de passe est défini par la variable OWNER_PASSWORD_HASH chez l'hébergeur : retire-la pour le gérer ici." }, { status: 409 });
    }
    const [row] = await sql<{ password_hash: string }[]>`select password_hash from app_auth where id = 1`;
    if (!row || !verifyPassword(body.current ?? "", row.password_hash)) {
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 401 });
    }
    let hash: string;
    try { hash = hashPassword(body.next ?? ""); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
    await sql`update app_auth set password_hash = ${hash}, updated_at = now() where id = 1`;
    await sql`update auth_devices set revoked_at = now() where id::text <> ${s.device} and revoked_at is null`;
    return reissue("Mot de passe changé. Les autres appareils ont été déconnectés.");
  }
  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
