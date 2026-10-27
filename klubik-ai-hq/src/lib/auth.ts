// Authentification d'un utilisateur unique (Timothé) : email + mot de passe haché (scrypt),
// session dans un cookie signé HMAC (httpOnly, Secure). Signature via WebCrypto : utilisable
// aussi dans le middleware.
export const SESSION_COOKIE = "khq_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum).");
  return s;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSessionToken(email: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86400000 })));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  let expected: string;
  try { expected = await hmac(payload); } catch { return null; }
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const { e, x } = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { e: string; x: number };
    if (typeof x !== "number" || x < Date.now()) return null;
    if (!process.env.OWNER_EMAIL || e.toLowerCase() !== process.env.OWNER_EMAIL.toLowerCase()) return null;
    return e;
  } catch {
    return null;
  }
}
