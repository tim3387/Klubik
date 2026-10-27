// Connexion et limitation des tentatives, en appelant les vraies routes sur une vraie base.
// Objectif vérifié : un attaquant ne peut pas bloquer l'accès de Timothé depuis ses appareils de confiance.
// KLUBIK_TEST_DB = base jetable (ENTIÈREMENT VIDÉE).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const DB = process.env.KLUBIK_TEST_DB ?? "";
if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.SESSION_SECRET = "x".repeat(48);
  process.env.OWNER_EMAIL = "timothe@example.test";
  process.env.AUTH_FAIL_DELAY_MS = "0";
  delete process.env.OWNER_PASSWORD_HASH;
}

// Cookies de la « requête courante » pour les routes qui lisent la session via next/headers.
let jar: Record<string, string> = {};
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar[n] ? { name: n, value: jar[n] } : undefined) }) }));

const PW = "mot-de-passe-de-test-solide";

describe.skipIf(!DB)("connexion : limitation sans blocage provocable", () => {
  let sql: import("@/lib/db").Sql;
  let login: typeof import("@/app/api/auth/login/route").POST;
  let security: typeof import("@/app/api/auth/security/route").POST;
  let currentSession: typeof import("@/lib/session").currentSession;
  let NextRequest: typeof import("next/server").NextRequest;

  const req = (url: string, body: unknown, opts: { ip?: string; cookies?: Record<string, string> } = {}) =>
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": opts.ip ?? "203.0.113.1",
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1",
        ...(opts.cookies ? { cookie: Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
    });
  const cookiesOf = (res: Response) => Object.fromEntries(
    res.headers.getSetCookie().map((c) => c.split(";")[0].split("=")).map(([k, ...v]) => [k, v.join("=")]),
  );
  const tryLogin = (password: string, opts: { ip?: string; cookies?: Record<string, string> } = {}) =>
    login(req("/api/auth/login", { email: "timothe@example.test", password }, opts));

  beforeAll(async () => {
    sql = (await import("@/lib/db")).getSql();
    await sql.unsafe("drop schema public cascade; create schema public;");
    await sql.unsafe(readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
    const { hashPassword } = await import("@/lib/password");
    await sql`insert into app_auth (id, password_hash) values (1, ${hashPassword(PW)})`;
    login = (await import("@/app/api/auth/login/route")).POST;
    security = (await import("@/app/api/auth/security/route")).POST;
    currentSession = (await import("@/lib/session")).currentSession;
    NextRequest = (await import("next/server")).NextRequest;
  });
  afterAll(async () => { await sql?.end(); });

  let iphone: Record<string, string> = {};

  it("première connexion : l'iPhone devient un appareil de confiance (cookie séparé de la session)", async () => {
    const r = await tryLogin(PW, { ip: "198.51.100.7" });
    expect(r.status).toBe(200);
    iphone = cookiesOf(r);
    expect(Object.keys(iphone).sort()).toEqual(["khq_device", "khq_session"]);
    const [d] = await sql<{ label: string }[]>`select label from auth_devices`;
    expect(d.label).toBe("iPhone · Safari");
  });

  it("un attaquant (une IP) est bloqué après 5 échecs, avec des blocages de plus en plus longs", async () => {
    for (let i = 0; i < 5; i++) expect((await tryLogin("mauvais", { ip: "192.0.2.66" })).status).toBe(401);
    const r = await tryLogin(PW, { ip: "192.0.2.66" }); // même le bon mot de passe est refusé depuis cette IP
    expect(r.status).toBe(429);
    const [t] = await sql<{ blocks: number; m: number }[]>`select blocks, extract(epoch from blocked_until - now())::int / 60 as m from auth_throttle where key = 'ip:192.0.2.66'`;
    expect(t.blocks).toBe(1);
    expect(t.m).toBeGreaterThanOrEqual(14);
    await sql`update auth_throttle set blocked_until = now() - interval '1 second' where key = 'ip:192.0.2.66'`;
    for (let i = 0; i < 5; i++) await tryLogin("mauvais", { ip: "192.0.2.66" });
    const [t2] = await sql<{ m: number }[]>`select extract(epoch from blocked_until - now())::int / 60 as m from auth_throttle where key = 'ip:192.0.2.66'`;
    expect(t2.m).toBeGreaterThanOrEqual(29); // 2e blocage : 30 min
  });

  it("attaque répartie sur 60 IP : les nouveaux appareils sont suspendus, MAIS l'iPhone de confiance se connecte", async () => {
    for (let i = 0; i < 60; i++) await tryLogin("mauvais", { ip: `10.0.${Math.floor(i / 4)}.${i}` });
    const inconnu = await tryLogin(PW, { ip: "10.9.9.9" });
    expect(inconnu.status).toBe(429);
    expect((await inconnu.json()).error).toMatch(/nouvel appareil/);
    // L'iPhone, même depuis l'IP déjà bloquée de l'attaquant, n'est pas concerné.
    const ok = await tryLogin(PW, { ip: "192.0.2.66", cookies: { khq_device: iphone.khq_device } });
    expect(ok.status).toBe(200);
  });

  it("un cookie d'appareil falsifié ne donne aucun passe-droit", async () => {
    const r = await tryLogin(PW, { ip: "10.9.9.9", cookies: { khq_device: "faux.cookie" } });
    expect(r.status).toBe(429);
  });

  it("révocation et « déconnecter les autres appareils » invalident immédiatement les sessions", async () => {
    await sql`delete from auth_throttle`;
    const mac = cookiesOf(await tryLogin(PW, { ip: "198.51.100.8" }));
    jar = mac;
    expect(await currentSession()).not.toBeNull();
    // Depuis l'iPhone : on retire le Mac.
    jar = iphone;
    const s = await currentSession();
    const [macDev] = await sql<{ id: string }[]>`select id from auth_devices where id::text <> ${s!.device} order by created_at desc limit 1`;
    expect((await security(req("/api/auth/security", { action: "revoke", id: macDev.id }))).status).toBe(200);
    jar = mac;
    expect(await currentSession()).toBeNull();
    // Le Mac retiré n'est plus de confiance : il retombe dans les règles des inconnus.
    // Déconnexion générale depuis l'iPhone : l'ancien jeton de l'iPhone ne vaut plus, le nouveau oui.
    jar = iphone;
    const r = await security(req("/api/auth/security", { action: "logout-others" }));
    expect(r.status).toBe(200);
    expect(await currentSession()).toBeNull();
    jar = { ...iphone, ...cookiesOf(r) };
    expect(await currentSession()).not.toBeNull();
    iphone = jar;
  });

  it("changement de mot de passe : exige l'actuel, puis l'ancien ne fonctionne plus", async () => {
    jar = iphone;
    expect((await security(req("/api/auth/security", { action: "password", current: "faux", next: "nouveau-mot-de-passe-1" }))).status).toBe(401);
    const r = await security(req("/api/auth/security", { action: "password", current: PW, next: "nouveau-mot-de-passe-1" }));
    expect(r.status).toBe(200);
    iphone = { ...iphone, ...cookiesOf(r) };
    expect((await tryLogin(PW, { cookies: { khq_device: iphone.khq_device } })).status).toBe(401);
    expect((await tryLogin("nouveau-mot-de-passe-1", { cookies: { khq_device: iphone.khq_device } })).status).toBe(200);
  });
});
