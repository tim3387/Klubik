// Authentification d'un utilisateur unique (Timothé) : email + mot de passe haché (scrypt),
// session dans un cookie signé HMAC (httpOnly, Secure). Signature via WebCrypto : utilisable
// aussi dans le middleware (qui ne vérifie que la signature et l'expiration ; la révocation
// des appareils et des sessions est contrôlée côté serveur, voir session.ts).
export const SESSION_COOKIE = "khq_session";
export const DEVICE_COOKIE = "khq_device";
export const SESSION_DAYS = 30;
export const DEVICE_DAYS = 400; // durée maximale acceptée par les navigateurs

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

async function sign(payload: Record<string, unknown>): Promise<string> {
  const p = b64url(enc.encode(JSON.stringify(payload)));
  return `${p}.${await hmac(p)}`;
}

async function verify(token: string | undefined | null): Promise<Record<string, unknown> | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  let expected: string;
  try { expected = await hmac(payload); } catch { return null; }
  if (!sig || sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Record<string, unknown>;
    if (typeof p.x !== "number" || p.x < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export interface Session { email: string; device: string; gen: number }

/** Session : email, appareil et « génération » (incrémentée pour déconnecter toutes les sessions). */
export async function createSessionToken(email: string, device = "", gen = 1): Promise<string> {
  return sign({ t: "s", e: email, d: device, g: gen, x: Date.now() + SESSION_DAYS * 86400000 });
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  const p = await verify(token);
  if (!p || p.t !== "s" || typeof p.e !== "string") return null;
  if (!process.env.OWNER_EMAIL || p.e.toLowerCase() !== process.env.OWNER_EMAIL.toLowerCase()) return null;
  return { email: p.e, device: typeof p.d === "string" ? p.d : "", gen: typeof p.g === "number" ? p.g : 1 };
}

/** Compatibilité : renvoie l'email si la signature et l'expiration sont valides. */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  return (await verifySession(token))?.email ?? null;
}

/** Jeton d'appareil de confiance : posé après une connexion réussie, il exempte cet appareil
 *  des limitations déclenchées par les tentatives venant d'ailleurs. */
export async function createDeviceToken(device: string): Promise<string> {
  return sign({ t: "d", d: device, x: Date.now() + DEVICE_DAYS * 86400000 });
}

export async function verifyDeviceToken(token: string | undefined | null): Promise<string | null> {
  const p = await verify(token);
  return p && p.t === "d" && typeof p.d === "string" ? p.d : null;
}
