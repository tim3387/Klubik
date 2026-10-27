// Affichage d'une capture (uniquement pour l'utilisateur connecté).
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  const [a] = await getSql()<{ media_type: string; bytes: Buffer | null }[]>`select media_type, bytes from attachments where id = ${id}`;
  if (!a) return NextResponse.json({ error: "Capture introuvable." }, { status: 404 });
  if (!a.bytes) return NextResponse.json({ error: "Capture expirée (durée de conservation dépassée)." }, { status: 410 });
  return new Response(new Uint8Array(a.bytes), {
    headers: { "Content-Type": a.media_type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
