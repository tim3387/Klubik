// Téléchargement d'une sauvegarde chiffrée (à garder, par exemple, dans Fichiers > iCloud Drive).
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  const [b] = await getSql()<{ data: Buffer | null; created_at: Date }[]>`select data, created_at from crm_backups where id = ${id}`;
  if (!b?.data) return NextResponse.json({ error: "Contenu non conservé en base (voir la copie externe)." }, { status: 404 });
  const stamp = new Date(b.created_at).toISOString().replace(/[-:]/g, "").slice(0, 15);
  return new Response(new Uint8Array(b.data), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="klubik-hq-${stamp}.khqbk"` },
  });
}
