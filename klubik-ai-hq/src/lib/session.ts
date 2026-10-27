// Contrôle de session côté serveur (défense en profondeur, en plus du middleware).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

export async function currentUser(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function guard(): Promise<NextResponse | null> {
  return (await currentUser()) ? null : NextResponse.json({ error: "Non authentifié" }, { status: 401 });
}
