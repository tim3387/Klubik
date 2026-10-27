// Hachage du mot de passe (scrypt, Node uniquement). Format : scrypt$N$r$p$sel$hash (base64).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 32;

export function hashPassword(password: string): string {
  if (password.length < 12) throw new Error("Mot de passe trop court (12 caractères minimum).");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const got = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Limitation des tentatives (instance unique) : 5 échecs → blocage 15 minutes.
const tentatives = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string): boolean {
  const t = tentatives.get(key);
  return !!t && t.until > Date.now();
}
export function loginFailed(key: string) {
  const t = tentatives.get(key) ?? { n: 0, until: 0 };
  t.n += 1;
  if (t.n >= 5) { t.until = Date.now() + 15 * 60000; t.n = 0; }
  tentatives.set(key, t);
}
export function loginSucceeded(key: string) {
  tentatives.delete(key);
}
