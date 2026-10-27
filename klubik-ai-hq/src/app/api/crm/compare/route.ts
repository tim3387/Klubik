// Compare un fichier Excel de prospection avec le CRM en base, sans rien modifier.
// Sert à vérifier la bascule : le fichier gardé sur l'ordinateur et le CRM cloud sont-ils identiques ?
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { loadClubs } from "@/lib/crm/repo";
import { parseWorkbook } from "@/lib/crm/xlsx-import";
import { guard } from "@/lib/session";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop volumineux (15 Mo max)." }, { status: 400 });
  let wb;
  try { wb = await parseWorkbook(Buffer.from(await file.arrayBuffer()), file.name); } catch (e) {
    return NextResponse.json({ error: `Fichier illisible : ${(e as Error).message}` }, { status: 400 });
  }
  const db = new Map((await loadClubs(getSql())).map((c) => [c.id, c.data]));
  const ecarts: { id: number; club: string; champ: string; fichier: unknown; base: unknown }[] = [];
  const seulementFichier: number[] = [];
  for (const c of wb.clubs) {
    const d = db.get(c.id);
    if (!d) { seulementFichier.push(c.id); continue; }
    for (const [k, v] of Object.entries(c.data)) {
      if (JSON.stringify(v ?? null) !== JSON.stringify(d[k] ?? null)) ecarts.push({ id: c.id, club: String(d["Club"] ?? c.data["Club"]), champ: k, fichier: v ?? null, base: d[k] ?? null });
    }
  }
  const ids = new Set(wb.clubs.map((c) => c.id));
  const seulementBase = [...db.keys()].filter((id) => !ids.has(id));
  return NextResponse.json({
    identique: ecarts.length === 0 && !seulementFichier.length && !seulementBase.length,
    clubsFichier: wb.clubs.length, clubsBase: db.size, ecarts: ecarts.slice(0, 100), totalEcarts: ecarts.length, seulementFichier, seulementBase,
  });
}
