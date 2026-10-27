import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { loginBlocked, loginFailed, loginSucceeded, verifyPassword } from "@/lib/password";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (loginBlocked(ip) || loginBlocked("global")) {
    return NextResponse.json({ error: "Trop de tentatives. Réessaie dans 15 minutes." }, { status: 429 });
  }
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const owner = process.env.OWNER_EMAIL?.toLowerCase();
  let hash = process.env.OWNER_PASSWORD_HASH ?? "";
  if (!hash) {
    const [row] = await getSql()<{ password_hash: string }[]>`select password_hash from app_auth where id = 1`;
    hash = row?.password_hash ?? "";
  }
  const ok = !!owner && !!hash && !!email && !!password && email.trim().toLowerCase() === owner && verifyPassword(password, hash);
  if (!ok) {
    loginFailed(ip);
    loginFailed("global");
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: hash ? "Identifiants incorrects." : "Aucun mot de passe défini : passe par la page /setup." }, { status: 401 });
  }
  loginSucceeded(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(owner!), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
