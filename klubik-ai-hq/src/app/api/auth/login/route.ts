// Connexion. Les échecs venant d'inconnus ne peuvent pas bloquer un appareil de confiance (voir throttle.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createDeviceToken, createSessionToken, DEVICE_COOKIE, DEVICE_DAYS, SESSION_COOKIE, SESSION_DAYS, verifyDeviceToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { blockedFor, clientIp, recordFailure, reset, RULES } from "@/lib/throttle";

const cookieOpts = (days: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: days * 86400,
});

function deviceLabel(ua: string): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Appareil";
  const nav = /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /Mobile\//.test(ua) ? "app écran d'accueil" : "navigateur";
  return `${os} · ${nav}`;
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  const ip = clientIp(req.headers);
  const claimed = await verifyDeviceToken(req.cookies.get(DEVICE_COOKIE)?.value);
  let device: string | null = null;
  if (claimed) {
    const [d] = await sql<{ id: string }[]>`select id from auth_devices where id = ${claimed} and revoked_at is null`;
    device = d?.id ?? null;
  }
  // Appareil de confiance : seul son propre compteur compte. Inconnu : limite par IP + plafond global.
  const keys = device ? [`device:${device}`] : [`ip:${ip}`, "global:new"];
  for (const k of keys) {
    const min = await blockedFor(sql, k);
    if (min > 0) {
      const msg = k === "global:new"
        ? `Connexions depuis un nouvel appareil suspendues ${min} min (trop d'échecs). Tes appareils déjà connectés ne sont pas concernés.`
        : `Trop de tentatives. Réessaie dans ${min} min.`;
      return NextResponse.json({ error: msg }, { status: 429 });
    }
  }

  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const owner = process.env.OWNER_EMAIL?.toLowerCase();
  let hash = process.env.OWNER_PASSWORD_HASH ?? "";
  let gen = 1;
  const [row] = await sql<{ password_hash: string; session_gen: number }[]>`select password_hash, session_gen from app_auth where id = 1`;
  if (!hash) hash = row?.password_hash ?? "";
  if (row) gen = row.session_gen;
  const ok = !!owner && !!hash && !!email && !!password && email.trim().toLowerCase() === owner && verifyPassword(password, hash);
  if (!ok) {
    if (device) await recordFailure(sql, `device:${device}`, RULES.device);
    else {
      await recordFailure(sql, `ip:${ip}`, RULES.ip);
      await recordFailure(sql, "global:new", RULES.globalNew);
    }
    await new Promise((r) => setTimeout(r, Number(process.env.AUTH_FAIL_DELAY_MS ?? 800))); // ralentit les essais en rafale
    return NextResponse.json({ error: hash ? "Identifiants incorrects." : "Aucun mot de passe défini : passe par la page /setup." }, { status: 401 });
  }

  if (device) {
    await reset(sql, `device:${device}`);
    await sql`update auth_devices set last_seen = now() where id = ${device}`;
  } else {
    await reset(sql, `ip:${ip}`);
    const [d] = await sql<{ id: string }[]>`insert into auth_devices (label) values (${deviceLabel(req.headers.get("user-agent") ?? "")}) returning id`;
    device = d.id;
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(owner!, device, gen), cookieOpts(SESSION_DAYS));
  res.cookies.set(DEVICE_COOKIE, await createDeviceToken(device), cookieOpts(DEVICE_DAYS));
  return res;
}
