// Chiffrement des sauvegardes : AES-256-GCM (chiffrement authentifié : toute altération ou mauvaise clé est détectée).
// Format : "KHQB1\n" (6 octets) · IV (12) · tag (16) · contenu chiffré.
// La clé (BACKUP_KEY, 32 octets en base64) est générée par l'hébergeur et doit AUSSI être conservée par Timothé
// (trousseau iCloud) : sans elle, une sauvegarde externe est illisible si l'hébergeur disparaît.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("KHQB1\n");

export function backupKey(): Buffer | null {
  const raw = (process.env.BACKUP_KEY ?? "").trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("BACKUP_KEY invalide : 32 octets attendus (base64 ou hexadécimal).");
  return key;
}

/** Empreinte publique de la clé : permet de vérifier qu'on a gardé la bonne, sans la révéler. */
export const fingerprint = (key: Buffer) => createHash("sha256").update(key).digest("hex").slice(0, 12);

export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function decrypt(blob: Buffer, key: Buffer): Buffer {
  if (blob.length < MAGIC.length + 28 || !blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Ce fichier n'est pas une sauvegarde Klubik AI HQ.");
  const iv = blob.subarray(6, 18);
  const tag = blob.subarray(18, 34);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(blob.subarray(34)), d.final()]);
  } catch {
    throw new Error("Déchiffrement impossible : mauvaise clé (BACKUP_KEY) ou fichier altéré.");
  }
}
