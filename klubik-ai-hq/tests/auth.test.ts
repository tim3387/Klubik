// Authentification : signature des sessions, mots de passe, blocage après échecs. Aucune base nécessaire.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { hashPassword, loginBlocked, loginFailed, loginSucceeded, verifyPassword } from "@/lib/password";

describe("session signée", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "s".repeat(40);
    process.env.OWNER_EMAIL = "timothe@example.test";
  });

  it("accepte un jeton valide et refuse toute altération", async () => {
    const t = await createSessionToken("timothe@example.test");
    expect(await verifySessionToken(t)).toBe("timothe@example.test");
    const [payload, sig] = t.split(".");
    const forge = Buffer.from(JSON.stringify({ e: "timothe@example.test", x: Date.now() + 1e12 })).toString("base64url");
    expect(await verifySessionToken(`${forge}.${sig}`)).toBeNull();
    expect(await verifySessionToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(await verifySessionToken("n'importe quoi")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("refuse un jeton signé avec un autre secret, expiré, ou pour un autre email", async () => {
    const t = await createSessionToken("timothe@example.test");
    process.env.SESSION_SECRET = "t".repeat(40);
    expect(await verifySessionToken(t)).toBeNull();
    process.env.SESSION_SECRET = "s".repeat(40);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 86400000);
    expect(await verifySessionToken(t)).toBeNull();
    vi.useRealTimers();
    process.env.OWNER_EMAIL = "autre@example.test";
    expect(await verifySessionToken(t)).toBeNull();
  });

  it("refuse de fonctionner avec un secret trop court", async () => {
    process.env.SESSION_SECRET = "court";
    await expect(createSessionToken("timothe@example.test")).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("mots de passe", () => {
  it("hache (scrypt, sel aléatoire) et vérifie", () => {
    const h = hashPassword("un-mot-de-passe-solide");
    expect(h).not.toContain("un-mot-de-passe-solide");
    expect(hashPassword("un-mot-de-passe-solide")).not.toBe(h);
    expect(verifyPassword("un-mot-de-passe-solide", h)).toBe(true);
    expect(verifyPassword("un-mot-de-passe-solidE", h)).toBe(false);
    expect(verifyPassword("x", "format-invalide")).toBe(false);
  });

  it("impose 12 caractères minimum", () => {
    expect(() => hashPassword("trop-court")).toThrow();
  });

  it("bloque après 5 échecs, débloque après une réussite", () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) loginFailed(ip);
    expect(loginBlocked(ip)).toBe(true);
    loginSucceeded(ip);
    expect(loginBlocked(ip)).toBe(false);
  });
});
