// Contrôle de session côté serveur (défense en profondeur, en plus du middleware) :
// signature, expiration, appareil non révoqué et génération de session à jour.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type Session } from "./auth";
import { getSql } from "./db";

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const sql = getSql();
  const [row] = await sql<{ gen: number | null; revoked: boolean | null; stale: boolean | null }[]>`
    select (select session_gen from app_auth where id = 1) as gen,
           (select revoked_at is not null from auth_devices where id::text = ${s.device}) as revoked,
           (select last_seen < now() - interval '10 minutes' from auth_devices where id::text = ${s.device}) as stale`;
  if ((row.gen ?? 1) !== s.gen) return null;
  if (row.revoked === null || row.revoked) return null; // appareil inconnu ou révoqué
  if (row.stale) await sql`update auth_devices set last_seen = now() where id::text = ${s.device}`;
  return s;
}

export async function currentUser(): Promise<string | null> {
  return (await currentSession())?.email ?? null;
}

export async function guard(): Promise<NextResponse | null> {
  return (await currentSession()) ? null : NextResponse.json({ error: "Non authentifié" }, { status: 401 });
}
