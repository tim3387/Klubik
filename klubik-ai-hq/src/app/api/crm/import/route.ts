// Migration du fichier Excel vers la base (une seule fois). Étape 1 : aperçu. Étape 2 : confirmation.
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";
import { parseWorkbook } from "@/lib/crm/xlsx-import";
import { crmCount, importWorkbook, verifyImport } from "@/lib/crm/repo";
import { stats, todayUtc } from "@/lib/crm/rules";
import { runBackup } from "@/lib/backup";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop volumineux (15 Mo max)." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  let wb;
  try {
    wb = await parseWorkbook(buf, file.name);
  } catch (e) {
    return NextResponse.json({ error: `Fichier illisible : ${(e as Error).message}` }, { status: 400 });
  }
  const sql = getSql();
  const existants = await crmCount(sql);
  const clubs = wb.clubs.map((c) => ({ id: c.id, data: c.data, version: 1 }));
  const s = stats(clubs, wb.settings, todayUtc());
  const report = {
    fichier: file.name, sha256: wb.sha256, onglets: Object.fromEntries(Object.entries(wb.sheets).map(([k, v]) => [k, Object.keys(v).length])),
    clubs: wb.clubs.length, colonnes: wb.headers.length, colonnesCalculees: wb.formulaHeaders, parametres: wb.settings,
    avertissements: wb.warnings, statistiques: s, baseActuelle: existants,
  };
  if (mode !== "confirm") return NextResponse.json({ ok: true, apercu: report });
  if (String(form.get("sha256") ?? "") !== wb.sha256) {
    return NextResponse.json({ error: "Le fichier envoyé n'est pas celui de l'aperçu : relance l'aperçu." }, { status: 409 });
  }
  try {
    await importWorkbook(sql, wb, buf.toString("base64"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
  const verification = await verifyImport(sql, wb);
  // Première sauvegarde immédiate de la base qui devient la source officielle.
  let sauvegarde: string;
  try {
    const b = await runBackup(sql, "après import");
    sauvegarde = `n°${b.id}, copie externe : ${b.offsite}${b.error ? ` (${b.error})` : ""}`;
  } catch (e) {
    sauvegarde = `non réalisée : ${(e as Error).message}`;
  }
  return NextResponse.json({ ok: verification.ok, import: report, verification, sauvegarde });
}
