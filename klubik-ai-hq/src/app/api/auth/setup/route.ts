// Définition du mot de passe, une seule fois, avec le code SETUP_TOKEN défini dans l'hébergeur.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { blockedFor, clientIp, recordFailure, RULES } from "@/lib/throttle";

export async function POST(req: NextRequest) {
  const sql = getSql();
  const key = `setup:${clientIp(req.headers)}`;
  const min = await blockedFor(sql, key);
  if (min > 0) return NextResponse.json({ error: `Trop de tentatives. Réessaie dans ${min} min.` }, { status: 429 });
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  const expected = process.env.SETUP_TOKEN ?? "";
  const [existing] = await sql`select 1 from app_auth where id = 1`;
  if (existing || process.env.OWNER_PASSWORD_HASH) return NextResponse.json({ error: "Le mot de passe est déjà défini." }, { status: 409 });
  const ok = expected.length >= 16 && !!token && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) {
    await recordFailure(sql, key, RULES.setup);
    return NextResponse.json({ error: "Code de configuration invalide." }, { status: 401 });
  }
  let hash: string;
  try { hash = hashPassword(password ?? ""); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  await sql`insert into app_auth (id, password_hash) values (1, ${hash}) on conflict (id) do nothing`;
  return NextResponse.json({ ok: true });
}
