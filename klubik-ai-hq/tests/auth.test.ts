// Authentification : signature des sessions et des appareils, mots de passe. Aucune base nécessaire.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeviceToken, createSessionToken, verifyDeviceToken, verifySession, verifySessionToken } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

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

  it("porte l'appareil et la génération ; un jeton d'appareil n'est pas une session (et inversement)", async () => {
    const t = await createSessionToken("timothe@example.test", "dev-1", 7);
    expect(await verifySession(t)).toEqual({ email: "timothe@example.test", device: "dev-1", gen: 7 });
    const d = await createDeviceToken("dev-1");
    expect(await verifyDeviceToken(d)).toBe("dev-1");
    expect(await verifySession(d)).toBeNull();
    expect(await verifyDeviceToken(t)).toBeNull();
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
});
