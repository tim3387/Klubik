// Export Excel fidèle : on repart du fichier d'origine archivé à l'import et on ne réécrit QUE les cellules
// de l'onglet Clubs dont la valeur a changé dans la base, directement dans le XML. Tout le reste du fichier
// (autres onglets, formules, tableaux, graphiques, mise en forme) est conservé octet pour octet.
import JSZip from "jszip";
import type { Club } from "./rules";
import { DATE_COLUMNS, serialToIso, type RawCell } from "./xlsx-import";

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const splitAddr = (addr: string) => { const m = /^([A-Z]+)(\d+)$/.exec(addr)!; return { col: m[1], row: Number(m[2]) }; };
const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CELL = (addr: string) => new RegExp(`<c r="${addr}"((?:\\s+[\\w:]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)`);

function cellXml(addr: string, style: string, header: string, v: unknown): string {
  const s = style ? ` s="${style}"` : "";
  if (v === null || v === undefined || v === "") return `<c r="${addr}"${s}/>`;
  if (DATE_COLUMNS.includes(header) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return `<c r="${addr}"${s} t="n"><v>${Math.round((Date.parse(`${v}T00:00:00Z`) - EXCEL_EPOCH_MS) / 86400000)}</v></c>`;
  }
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${addr}"${s} t="n"><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${addr}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${addr}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

/**
 * @param clubsCells cellules de l'onglet Clubs telles qu'archivées à l'import (crm_import_archive.sheets) :
 *   elles donnent les valeurs d'origine sans relire le fichier avec exceljs (trop gourmand en mémoire).
 */
export async function buildWorkbook(
  originalBase64: string,
  clubsCells: Record<string, RawCell>,
  clubs: Club[],
): Promise<{ buffer: Buffer; ajoutes: number[]; cellules: number }> {
  const original = Buffer.from(originalBase64, "base64");
  const cells = clubsCells;

  // En-têtes (ligne 1), colonnes calculées et ligne de chaque club, d'après le fichier d'origine.
  const colOf = new Map<string, string>();
  const headerOf = new Map<string, string>();
  const formulaCols = new Set<string>();
  const rowOf = new Map<number, number>();
  for (const [addr, c] of Object.entries(cells)) {
    const { col, row } = splitAddr(addr);
    if (row === 1 && c.v !== null && String(c.v).trim()) { colOf.set(String(c.v).trim(), col); headerOf.set(col, String(c.v).trim()); }
    else if (row > 1 && c.f) formulaCols.add(col);
  }
  const idCol = colOf.get("ID");
  if (!idCol) throw new Error("Colonne ID absente de l'archive.");
  for (const [addr, c] of Object.entries(cells)) {
    const { col, row } = splitAddr(addr);
    if (col === idCol && row > 1 && Number.isInteger(Number(c.v)) && !rowOf.has(Number(c.v))) rowOf.set(Number(c.v), row);
  }
  // Valeur d'origine d'une cellule, normalisée comme à l'import (dates en AAAA-MM-JJ, vide = null).
  const avant = (h: string, addr: string) => {
    const v = cells[addr]?.v;
    if (v === undefined || v === null || v === "") return null;
    return DATE_COLUMNS.includes(h) && typeof v === "number" ? serialToIso(v) : v;
  };

  // Cellules à réécrire : uniquement les valeurs modifiées (colonnes non calculées).
  const changes = new Map<number, { addr: string; header: string; v: unknown }[]>();
  const ajoutes: number[] = [];
  for (const c of clubs) {
    const row = rowOf.get(c.id);
    if (!row) { ajoutes.push(c.id); continue; }
    for (const [h, v] of Object.entries(c.data)) {
      const col = colOf.get(h);
      if (!col || formulaCols.has(col)) continue;
      if (JSON.stringify(v ?? null) === JSON.stringify(avant(h, `${col}${row}`))) continue;
      if (!changes.has(row)) changes.set(row, []);
      changes.get(row)!.push({ addr: `${col}${row}`, header: h, v });
    }
  }

  const zip = await JSZip.loadAsync(original);
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const rid = /<sheet\b[^>]*\bname="Clubs"[^>]*>/.exec(wbXml)?.[0].match(/r:id="([^"]+)"/)?.[1];
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const target = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels)?.[0].match(/Target="([^"]+)"/)?.[1];
  if (!rid || !target) throw new Error("Onglet « Clubs » introuvable dans le fichier archivé.");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  let xml = await zip.file(sheetPath)!.async("string");

  let cellules = 0;
  for (const [row, list] of changes) {
    const rowRe = new RegExp(`<row r="${row}"((?:\\s+[\\w:]+="[^"]*")*)\\s*(?:/>|>([\\s\\S]*?)</row>)`);
    const m = rowRe.exec(xml);
    if (!m) throw new Error(`Ligne ${row} introuvable dans l'onglet Clubs.`);
    let inner = m[2] ?? "";
    for (const ch of list) {
      const existing = CELL(ch.addr).exec(inner);
      const style = existing?.[1].match(/\bs="(\d+)"/)?.[1] ?? "";
      const neu = cellXml(ch.addr, style, ch.header, ch.v);
      if (existing) inner = inner.slice(0, existing.index) + neu + inner.slice(existing.index + existing[0].length);
      else {
        // Cellule absente : insertion à sa place (les cellules d'une ligne sont triées par colonne).
        const target = colIndex(splitAddr(ch.addr).col);
        const re = /<c r="([A-Z]+)\d+"/g;
        let at = inner.length, k: RegExpExecArray | null;
        while ((k = re.exec(inner))) if (colIndex(k[1]) > target) { at = k.index; break; }
        inner = inner.slice(0, at) + neu + inner.slice(at);
      }
      cellules++;
    }
    xml = xml.slice(0, m.index) + `<row r="${row}"${m[1]}>${inner}</row>` + xml.slice(m.index + m[0].length);
  }
  zip.file(sheetPath, xml, { createFolders: false });

  // Recalcul complet des formules à l'ouverture (Excel, Numbers, LibreOffice).
  if (!/fullCalcOnLoad="1"/.test(wbXml)) {
    const sans = wbXml.replace(/\sfullCalcOnLoad="[^"]*"/, "");
    const patched = /<calcPr\b/.test(sans) ? sans.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"') : sans.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file("xl/workbook.xml", patched, { createFolders: false });
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return { buffer, ajoutes, cellules };
}
