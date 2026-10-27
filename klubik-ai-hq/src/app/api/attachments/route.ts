// Envoi d'une capture d'écran (avant l'envoi du message qui la contient).
// L'iPhone l'a déjà redimensionnée et réencodée (métadonnées et géolocalisation supprimées).
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { detectImageType, MAX_BYTES } from "@/lib/attachments";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image manquante." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image trop lourde (5 Mo maximum)." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(buf);
  if (!type) return NextResponse.json({ error: "Format non pris en charge (JPEG, PNG, WebP ou GIF)." }, { status: 415 });
  const [a] = await getSql()<{ id: string }[]>`
    insert into attachments (media_type, size, sha256, bytes)
    values (${type}, ${buf.length}, ${createHash("sha256").update(buf).digest("hex")}, ${buf})
    returning id::text`;
  return NextResponse.json({ id: a.id, mediaType: type, size: buf.length });
}
