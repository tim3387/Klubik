// Lecture du fichier de prospection Excel (onglets Clubs + Listes + archive intégrale de tous les onglets).
// Utilisé une seule fois pour la migration vers la base (source officielle ensuite).
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { CrmSettings } from "./rules";

export const DATE_COLUMNS = ["Date 1er contact", "Dernier contact"];
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export interface RawCell { v: unknown; f?: string }
export interface ParsedWorkbook {
  sha256: string;
  sourceName: string;
  sheets: Record<string, Record<string, RawCell>>;
  headers: string[];
  formulaHeaders: string[];
  clubs: { id: number; data: Record<string, unknown> }[];
  settings: CrmSettings;
  warnings: string[];
}

export function serialToIso(n: number): string {
  return new Date(EXCEL_EPOCH_MS + Math.round(n) * 86400000).toISOString().slice(0, 10);
}

function dateToSerial(d: Date): number {
  return Math.round((d.getTime() - EXCEL_EPOCH_MS) / 86400000);
}

/** Valeur brute d'une cellule, au même format que le lecteur Python validé (dates = numéro de série Excel). */
function cellValue(c: ExcelJS.Cell): RawCell {
  const val = c.value as unknown;
  if (val === null || val === undefined) return { v: null };
  if (val instanceof Date) return { v: dateToSerial(val) };
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) {
      const f = (o.formula ?? c.formula ?? "") as string;
      const r = o.result as unknown;
      const v = r instanceof Date ? dateToSerial(r) : (r as { error?: string })?.error ?? r ?? null;
      return { v: v === "" ? null : v, f };
    }
    if ("richText" in o) return { v: (o.richText as { text: string }[]).map((t) => t.text).join("") };
    if ("text" in o) return { v: o.text };
    if ("error" in o) return { v: o.error };
  }
  return { v: val };
}

export async function parseWorkbook(buf: Buffer, sourceName: string): Promise<ParsedWorkbook> {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets: ParsedWorkbook["sheets"] = {};
  wb.eachSheet((ws) => {
    const cells: Record<string, RawCell> = {};
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        // Cellules fusionnées : la valeur n'existe que dans la cellule principale (exceljs la recopie ailleurs).
        if (cell.isMerged && cell.master.address !== cell.address) return;
        const rc = cellValue(cell);
        if (rc.v !== null || rc.f) cells[cell.address] = rc;
      });
    });
    sheets[ws.name] = cells;
  });
  const warnings: string[] = [];
  if (!sheets["Clubs"]) throw new Error("Onglet « Clubs » introuvable : ce n'est pas le fichier de prospection attendu.");
  if (!sheets["Listes"]) throw new Error("Onglet « Listes » introuvable.");

  // Onglet Clubs : en-têtes ligne 1, une ligne par club.
  const ws = wb.getWorksheet("Clubs")!;
  const headerByCol = new Map<number, string>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = String(cellValue(cell).v ?? "").trim();
    if (h) headerByCol.set(col, h);
  });
  const headers = [...headerByCol.values()];
  for (const h of ["ID", "Club", "Statut", "Score /10"]) {
    if (!headers.includes(h)) throw new Error(`Colonne attendue absente de l'onglet Clubs : ${h}`);
  }
  const formulaCols = new Set<number>();
  ws.eachRow((row, r) => {
    if (r === 1) return;
    row.eachCell((cell, col) => {
      if (cellValue(cell).f) formulaCols.add(col);
    });
  });
  const formulaHeaders = [...formulaCols].map((c) => headerByCol.get(c)!).filter(Boolean);

  const clubs: ParsedWorkbook["clubs"] = [];
  const seen = new Set<number>();
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const data: Record<string, unknown> = {};
    for (const [col, h] of headerByCol) {
      if (formulaCols.has(col)) continue;
      let v = cellValue(row.getCell(col)).v;
      if (DATE_COLUMNS.includes(h) && typeof v === "number") v = serialToIso(v);
      data[h] = v === undefined || v === "" ? null : v;
    }
    const id = Number(data["ID"]);
    if (!Number.isInteger(id)) return;
    if (seen.has(id)) warnings.push(`ID ${id} en double (ligne ${r}) : seule la première occurrence est importée.`);
    else {
      seen.add(id);
      clubs.push({ id, data });
    }
  });

  return { sha256, sourceName, sheets, headers, formulaHeaders, clubs, settings: readSettings(sheets["Listes"]), warnings };
}

/** Paramètres de l'onglet « Listes », lus par en-têtes (comme l'outil Python). */
export function readSettings(cells: Record<string, RawCell>): CrmSettings {
  const byCol = new Map<string, Map<number, unknown>>();
  for (const [addr, c] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr)!;
    if (!byCol.has(m[1])) byCol.set(m[1], new Map());
    byCol.get(m[1])!.set(Number(m[2]), c.v);
  }
  const findCol = (h: string) => [...byCol.entries()].find(([, vals]) => String(vals.get(1) ?? "").trim() === h)?.[1];
  const list = (h: string) => {
    const vals = findCol(h);
    if (!vals) return [];
    return [...vals.entries()].filter(([r, v]) => r > 1 && v !== null && v !== "").sort((a, b) => a[0] - b[0]).map(([, v]) => String(v));
  };
  const labels = findCol("Paramètre");
  const values = findCol("Valeur");
  const params: Record<string, number> = {};
  if (labels && values) {
    for (const [r, lab] of labels) {
      const v = values.get(r);
      if (r > 1 && typeof v === "number") params[String(lab)] = v;
    }
  }
  const param = (prefix: string, def: number) => {
    const k = Object.keys(params).find((x) => x.startsWith(prefix));
    return k ? params[k] : def;
  };
  const statuts = list("Statuts");
  if (!statuts.length) throw new Error("Liste des statuts introuvable dans l'onglet Listes.");
  return {
    statuts,
    canauxEnvoi: list("Canaux d’envoi"),
    reponses: list("Réponse"),
    delaiRelance: Math.round(param("Délai de relance", 7)),
    objectifSemaine: Math.round(param("Objectif premiers contacts", 10)),
    seuils: [param("Seuil A+", 8.9), param("Seuil A (", 8), param("Seuil B", 6.5)],
  };
}
