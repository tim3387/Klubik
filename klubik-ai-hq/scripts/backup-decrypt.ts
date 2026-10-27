// Secours : déchiffre une sauvegarde .khqbk SANS l'application (si l'hébergeur a disparu).
// Usage : BACKUP_KEY=… node --experimental-strip-types scripts/backup-decrypt.ts fichier.khqbk [dossier-sortie]
// Produit : sauvegarde.json (toutes les tables) et clubs.csv (lisible dans Excel / Numbers).
// Le format est volontairement simple et documenté (voir src/lib/backup/crypto.ts) pour rester lisible dans 10 ans.
import { createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const [file, outDir = "sauvegarde-dechiffree"] = process.argv.slice(2);
const raw = (process.env.BACKUP_KEY ?? "").trim();
if (!file || !raw) {
  console.error("Usage : BACKUP_KEY=<clé> node --experimental-strip-types scripts/backup-decrypt.ts fichier.khqbk [dossier]");
  process.exit(1);
}
const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
const blob = readFileSync(file);
if (blob.subarray(0, 6).toString() !== "KHQB1\n") throw new Error("Ce fichier n'est pas une sauvegarde Klubik AI HQ.");
const d = createDecipheriv("aes-256-gcm", key, blob.subarray(6, 18));
d.setAuthTag(blob.subarray(18, 34));
const snap = JSON.parse(gunzipSync(Buffer.concat([d.update(blob.subarray(34)), d.final()])).toString("utf8"));

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "sauvegarde.json"), JSON.stringify(snap, null, 1));
const clubs: { id: number; data: Record<string, unknown> }[] = snap.tables.crm_clubs;
const cols = (snap.tables.crm_settings.find((s: { key: string }) => s.key === "colonnes")?.value?.headers as string[] | undefined)
  ?? [...new Set(clubs.flatMap((c) => Object.keys(c.data)))];
const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const present = cols.filter((h) => clubs.some((c) => h in c.data));
writeFileSync(path.join(outDir, "clubs.csv"), "﻿" + [present.map(cell).join(";"), ...clubs.map((c) => present.map((h) => cell(c.data[h])).join(";"))].join("\r\n"));
console.log(`Sauvegarde du ${snap.created_at} (${snap.reason}) : ${clubs.length} clubs → ${outDir}/clubs.csv et ${outDir}/sauvegarde.json`);
