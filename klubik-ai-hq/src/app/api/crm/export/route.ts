// Export du CRM : Excel fidèle au fichier d'origine (format=xlsx, par défaut) ou CSV brut (format=csv).
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";
import { loadClubs } from "@/lib/crm/repo";
import { buildWorkbook } from "@/lib/crm/xlsx-export";
import type { RawCell } from "@/lib/crm/xlsx-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const sql = getSql();
  const clubs = await loadClubs(sql);
  if (!clubs.length) return NextResponse.json({ error: "Le CRM n'est pas encore importé." }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const [cols] = await sql<{ value: { headers: string[]; calculees: string[] } }[]>`select value from crm_settings where key = 'colonnes'`;
    const headers = (cols?.value.headers ?? Object.keys(clubs[0].data)).filter((h) => !cols?.value.calculees.includes(h));
    const lines = [headers.map(cell).join(";"), ...clubs.map((c) => headers.map((h) => cell(c.data[h])).join(";"))];
    return new Response("﻿" + lines.join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="crm-klubik-${date}.csv"` },
    });
  }

  const [archive] = await sql<{ file_base64: string | null; clubs: Record<string, RawCell> | null }[]>`
    select file_base64, sheets -> 'Clubs' as clubs from crm_import_archive order by id desc limit 1`;
  if (!archive?.file_base64 || !archive.clubs) return NextResponse.json({ error: "Fichier d'origine non archivé : utilise l'export CSV." }, { status: 409 });
  const { buffer, ajoutes } = await buildWorkbook(archive.file_base64, archive.clubs, clubs);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="klubik-prospection-${date}.xlsx"`,
      ...(ajoutes.length ? { "X-Clubs-Non-Exportes": ajoutes.join(",") } : {}),
    },
  });
}
