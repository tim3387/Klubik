// Moteur des missions, de bout en bout sur une vraie base Postgres et le vrai fichier CRM importé.
// Le modèle est remplacé par un FAUX client scripté (aucun appel réseau, aucun coût) : ces tests vérifient
// l'orchestration (délégation, reprise, plafonds, validations), pas la qualité des réponses des agents.
// KLUBIK_TEST_DB = base jetable (ENTIÈREMENT VIDÉE) · KLUBIK_XLSX = fichier de prospection
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB = process.env.KLUBIK_TEST_DB ?? "";
const XLSX = process.env.KLUBIK_XLSX ?? "";
const dispo = !!DB && !!XLSX && existsSync(XLSX);
if (dispo) process.env.DATABASE_URL = DB;

type Reply = Anthropic.Beta.BetaMessage;
type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
let n = 0;
const reply = (stop_reason: Reply["stop_reason"], content: unknown[], usage: Partial<Anthropic.Beta.BetaUsage> = {}): Reply =>
  ({
    id: `msg_${++n}`, type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: null, ...usage },
  }) as unknown as Reply;
const text = (t: string) => ({ type: "text", text: t, citations: null });
const toolUse = (name: string, input: unknown) => ({ type: "tool_use", id: `toolu_${++n}`, name, input });
const agentOf = (p: Params) => {
  const names = (p.tools ?? []).map((t) => (t as { name: string }).name);
  if (names.includes("deleguer")) return "kung";
  if (names.includes("crm_proposer_mise_a_jour")) return "popi";
  if (names.includes("brouillon_enregistrer")) return "bililou";
  return "jojo";
};
const turn = (p: Params) => p.messages.filter((m) => m.role === "assistant").length;
const lastUser = (p: Params) => JSON.stringify(p.messages.filter((m) => m.role === "user").at(-1)?.content);

describe.skipIf(!dispo)("moteur des missions (faux modèle, vraie base)", () => {
  let sql: import("@/lib/db").Sql;
  let M: {
    db: typeof import("@/lib/db"); runner: typeof import("@/lib/engine/runner"); worker: typeof import("@/lib/engine/worker");
    repo: typeof import("@/lib/crm/repo"); actions: typeof import("@/lib/actions");
  };
  let clubNote: { id: number; nom: string };
  let clubNeuf: { id: number; nom: string };

  async function conversation(agent: string, msg: string) {
    const [c] = await sql<{ id: string }[]>`insert into conversations (agent_id, title) values (${agent}, ${msg}) returning id`;
    await sql`insert into chat_messages (conversation_id, role, content) values (${c.id}, 'user', ${msg})`;
    const taskId = await M.runner.createRootTask(sql, { agentId: agent as never, conversationId: c.id, text: msg });
    return { conv: c.id, taskId };
  }
  async function drain(llm: import("@/lib/engine/llm").LlmClient) {
    let i = 0;
    while (await M.worker.processOne(llm)) if (++i > 50) throw new Error("boucle infinie");
    return i;
  }

  beforeAll(async () => {
    M = {
      db: await import("@/lib/db"), runner: await import("@/lib/engine/runner"), worker: await import("@/lib/engine/worker"),
      repo: await import("@/lib/crm/repo"), actions: await import("@/lib/actions"),
    };
    sql = M.db.getSql();
    await sql.unsafe("drop schema public cascade; create schema public;");
    await sql.unsafe(readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
    const { parseWorkbook } = await import("@/lib/crm/xlsx-import");
    const wb = await parseWorkbook(readFileSync(XLSX), path.basename(XLSX));
    await M.repo.importWorkbook(sql, wb, readFileSync(XLSX).toString("base64"));
    expect((await M.repo.verifyImport(sql, wb)).ok).toBe(true);
    const clubs = await M.repo.loadClubs(sql);
    const c1 = clubs.find((c) => c.data["Statut"] === "En échange")!;
    const c2 = clubs.find((c) => c.data["Statut"] === "À contacter" && c.data["Instagram exact"])!;
    clubNote = { id: c1.id, nom: String(c1.data["Club"]) };
    clubNeuf = { id: c2.id, nom: String(c2.data["Club"]) };
  }, 120_000);

  afterAll(async () => { await sql?.end(); });

  it("Kung délègue à Popi et Jojo en parallèle, attend leurs résultats puis répond dans la conversation", async () => {
    const calls: string[] = [];
    const vus: Record<string, { model: string; effort: unknown; fallbacks: boolean }> = {};
    const llm = {
      async create(p: Params) {
        const r = await script(p);
        return { ...r, model: p.model } as Reply; // l'API renvoie le modèle réellement utilisé
      },
    };
    const script = async (p: Params): Promise<Reply> => {
        const a = agentOf(p), t = turn(p);
        calls.push(`${a}${t}`);
        vus[a] = { model: p.model, effort: (p as { output_config?: { effort?: string } }).output_config?.effort, fallbacks: "fallbacks" in p };
        if (a === "kung" && t === 0)
          return reply("tool_use", [text("Je lance l'équipe."), toolUse("deleguer", { agent: "popi", consigne: "Prépare une note de test." }), toolUse("deleguer", { agent: "jojo", consigne: "Cherche des infos sur le club." })]);
        if (a === "kung") {
          expect(lastUser(p)).toContain("Résultat de Popi");
          expect(lastUser(p)).toContain("Résultat de Jojo");
          return reply("end_turn", [text("Synthèse de Kung : tout est prêt.")]);
        }
        if (a === "popi" && t === 0)
          return reply("tool_use", [
            toolUse("crm_proposer_mise_a_jour", { club_id: clubNote.id, nom_attendu: clubNote.nom.slice(0, 6), type: "note", resume: "Note de test moteur" }),
            toolUse("brouillon_enregistrer", { club_id: clubNote.id }), // outil interdit à Popi
          ]);
        if (a === "popi") {
          expect(lastUser(p)).toContain("PROPOSITION ENREGISTRÉE");
          expect(lastUser(p)).toContain("Outil non autorisé");
          return reply("end_turn", [text("Popi : proposition prête.")]);
        }
        if (a === "jojo" && t === 0) return reply("pause_turn", [text("Recherche en cours…")], { server_tool_use: { web_search_requests: 3, web_fetch_requests: 0 } as never });
        return reply("end_turn", [text("Jojo : 3 accroches sourcées.")]);
    };
    const { conv, taskId } = await conversation("kung", "Prépare le club X");
    await drain(llm);
    expect(calls.sort()).toEqual(["jojo0", "jojo1", "kung0", "kung1", "popi0", "popi1"]);
    const tasks = await sql<{ agent_id: string; status: string; parent_id: string | null }[]>`select agent_id, status, parent_id from tasks where root_id = ${taskId}`;
    expect(tasks.map((t) => `${t.agent_id}:${t.status}`).sort()).toEqual(["jojo:done", "kung:done", "popi:done"]);
    const msgs = await sql<{ role: string; content: string }[]>`select role, content from chat_messages where conversation_id = ${conv} order by id`;
    expect(msgs.filter((m) => m.role === "agent").at(-1)?.content).toBe("Synthèse de Kung : tout est prêt.");
    // Modèles par défaut : Sonnet 5.5 (Kung, Jojo), Haiku 5.5 (Popi, sans repli serveur qu'il n'accepte pas).
    expect(vus.kung).toEqual({ model: "claude-sonnet-5-5", effort: "medium", fallbacks: true });
    expect(vus.jojo).toEqual({ model: "claude-sonnet-5-5", effort: "medium", fallbacks: true });
    expect(vus.popi).toEqual({ model: "claude-haiku-5-5", effort: "low", fallbacks: false });
    // Coût réel affiché à la fin : 4 appels Sonnet (1000 in / 200 out) + 2 Haiku + 3 recherches.
    const attendu = 4 * (1000 * 2 + 200 * 10) / 1e6 + 2 * (1000 * 0.1 + 200 * 0.5) / 1e6 + 0.03;
    expect(msgs.at(-1)?.content).toBe(`Coût de la mission : ${attendu.toFixed(3)} $ · Sonnet 5.5 ×4, Haiku 5.5 ×2 · 3 recherches web`);
    expect(msgs.filter((m) => m.role === "event").map((m) => m.content).join("\n")).toMatch(/Kung → Popi[\s\S]*mise à jour du CRM/);
    const [act] = await sql<{ status: string; kind: string }[]>`select status, kind from actions where root_id = ${taskId}`;
    expect(act).toMatchObject({ kind: "crm_update", status: "pending" });
    const [u] = await sql<{ n: number; s: number; cost: string }[]>`select count(*)::int n, sum(web_searches)::int s, sum(cost_usd)::text cost from usage_log`;
    expect(u.n).toBe(6);
    expect(u.s).toBe(3);
    expect(Number(u.cost)).toBeCloseTo(attendu, 6);
    // Rien n'a été écrit dans le CRM tant que Timothé n'a pas validé.
    expect(String((await M.repo.getClub(sql, clubNote.id))!.data["Notes"] ?? "")).not.toContain("Note de test moteur");
  });

  it("la validation écrit le CRM (verrou de version + journal) ; une 2e décision est refusée", async () => {
    const [a] = await sql<{ id: string }[]>`select id from actions where kind = 'crm_update' and status = 'pending'`;
    const avant = (await M.repo.getClub(sql, clubNote.id))!;
    const r = await M.actions.decide(sql, a.id, "approve");
    expect(r.ok).toBe(true);
    const apres = (await M.repo.getClub(sql, clubNote.id))!;
    expect(apres.version).toBe(avant.version + 1);
    expect(String(apres.data["Notes"])).toContain("Note de test moteur");
    const [j] = await sql<{ n: number }[]>`select count(*)::int n from crm_journal where club_id = ${clubNote.id}`;
    expect(j.n).toBe(1);
    expect((await M.actions.decide(sql, a.id, "approve")).ok).toBe(false);
  });

  it("une proposition devenue obsolète (club modifié entre-temps) n'est pas appliquée", async () => {
    const llm = {
      async create(p: Params) {
        return turn(p) === 0
          ? reply("tool_use", [toolUse("crm_proposer_mise_a_jour", { club_id: clubNote.id, nom_attendu: clubNote.nom.slice(0, 6), type: "note", resume: "Seconde note" })])
          : reply("end_turn", [text("ok")]);
      },
    };
    await conversation("popi", "note");
    await drain(llm);
    const [a] = await sql<{ id: string }[]>`select id from actions where status = 'pending' and kind = 'crm_update'`;
    const c = (await M.repo.getClub(sql, clubNote.id))!;
    await M.repo.applyChanges(sql, { clubId: c.id, expectedVersion: c.version, changes: { "Prochain pas": "modif concurrente" }, kind: "test", summary: "test", actionId: null as never });
    const r = await M.actions.decide(sql, a.id, "approve");
    expect(r.ok).toBe(false);
    const [st] = await sql<{ status: string }[]>`select status from actions where id = ${a.id}`;
    expect(st.status).toBe("failed");
    expect(String((await M.repo.getClub(sql, clubNote.id))!.data["Notes"])).not.toContain("Seconde note");
  });

  it("brouillon de Bililou : jamais envoyé ; « J'ai envoyé » enregistre le premier contact selon les règles", async () => {
    const llm = {
      async create(p: Params) {
        return turn(p) === 0
          ? reply("tool_use", [toolUse("brouillon_enregistrer", { club_id: clubNeuf.id, canal: "Instagram", destinataire: "@club", type_message: "premier-contact", texte: "Bonjour, message de test pour le moteur." })])
          : reply("end_turn", [text("Brouillon prêt.")]);
      },
    };
    await conversation("bililou", "Écris au club");
    await drain(llm);
    const [a] = await sql<{ id: string; status: string }[]>`select id, status from actions where kind = 'message_draft'`;
    expect(a.status).toBe("pending");
    const r = await M.actions.decide(sql, a.id, "sent");
    expect(r.ok).toBe(true);
    const c = (await M.repo.getClub(sql, clubNeuf.id))!;
    expect(c.data["Statut"]).toBe("Contacté");
    const { todayUtc, iso } = await import("@/lib/crm/rules");
    expect(c.data["Date 1er contact"]).toBe(iso(todayUtc()));
  });

  it("erreur réseau : la tâche est remise en file avec délai, puis reprend et se termine", async () => {
    let fois = 0;
    const llm = {
      async create() {
        if (fois++ === 0) throw new Anthropic.APIConnectionError({ message: "réseau coupé" });
        return reply("end_turn", [text("Réponse après reprise.")]);
      },
    };
    const { taskId } = await conversation("kung", "Point du jour");
    await drain(llm);
    let [t] = await sql<{ status: string; attempts: number; error: string }[]>`select status, attempts, error from tasks where id = ${taskId}`;
    expect(t).toMatchObject({ status: "ready", attempts: 1 });
    expect(t.error).toContain("Nouvel essai");
    await sql`update tasks set not_before = now() where id = ${taskId}`;
    await drain(llm);
    [t] = await sql`select status, attempts, error from tasks where id = ${taskId}`;
    expect(t).toMatchObject({ status: "done", attempts: 0 });
  });

  it("serveur arrêté en pleine étape : la tâche est reprise à l'expiration du bail ; abandon après 5 interruptions", async () => {
    const { taskId } = await conversation("kung", "Tâche interrompue");
    for (let i = 0; i < 5; i++) {
      const t = await M.runner.claimNext(sql);
      expect(t?.id).toBe(taskId);
      expect(t?.attempts).toBe(i);
      await sql`update tasks set locked_until = now() - interval '1 minute' where id = ${taskId}`; // « crash »
    }
    const llm = { async create(): Promise<Reply> { throw new Error("ne doit pas être appelé"); } };
    await drain(llm);
    const [t] = await sql<{ status: string; error: string; conversation_id: string }[]>`select status, error, conversation_id from tasks where id = ${taskId}`;
    expect(t.status).toBe("failed");
    const [m] = await sql<{ content: string }[]>`select content from chat_messages where conversation_id = ${t.conversation_id} order by id desc limit 1`;
    expect(m.content).toContain("n'a pas pu terminer");
  });

  it("échec d'un agent délégué : Kung est réveillé avec l'erreur au lieu d'attendre indéfiniment", async () => {
    const llm = {
      async create(p: Params) {
        const a = agentOf(p);
        if (a === "jojo") throw new Error("panne inattendue"); // non réessayable
        if (turn(p) === 0) return reply("tool_use", [toolUse("deleguer", { agent: "jojo", consigne: "Cherche trois accroches sourcées." })]);
        expect(lastUser(p)).toContain("Échec de Jojo");
        return reply("end_turn", [text("Jojo a échoué, voici ce que je sais.")]);
      },
    };
    const { taskId } = await conversation("kung", "Analyse");
    await drain(llm);
    const rows = await sql<{ agent_id: string; status: string }[]>`select agent_id, status from tasks where root_id = ${taskId} order by created_at`;
    expect(rows.map((r) => `${r.agent_id}:${r.status}`)).toEqual(["kung:done", "jojo:failed"]);
  });

  it("plafond par mission : la mission s'arrête avant tout appel et Timothé est prévenu", async () => {
    const { saveSettings } = await import("@/lib/settings");
    expect((await saveSettings(sql, { missionBudget: 0 })).ok).toBe(true); // réglé depuis l'app, effet immédiat
    try {
      const llm = { async create(): Promise<Reply> { throw new Error("ne doit pas être appelé"); } };
      const { taskId, conv } = await conversation("kung", "Mission coûteuse");
      await drain(llm);
      const [t] = await sql<{ status: string; error: string }[]>`select status, error from tasks where id = ${taskId}`;
      expect(t.status).toBe("failed");
      expect(t.error).toContain("Plafond par mission");
      const [m] = await sql<{ content: string }[]>`select content from chat_messages where conversation_id = ${conv} order by id desc limit 1`;
      expect(m.content).toContain("Plafond par mission");
    } finally {
      await saveSettings(sql, { missionBudget: 3 });
    }
  });

  it("capture d'écran : envoyée au modèle, transmise par Kung à Bililou ; identifiant inconnu refusé", async () => {
    // Petite image PNG réelle (1×1) enregistrée comme le ferait l'iPhone.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const [conv] = await sql<{ id: string }[]>`insert into conversations (agent_id, title) values ('kung', 'capture') returning id`;
    const [m] = await sql<{ id: string }[]>`insert into chat_messages (conversation_id, role, content) values (${conv.id}, 'user', 'Le club m''a répondu, regarde') returning id`;
    const [att] = await sql<{ id: string }[]>`insert into attachments (conversation_id, message_id, media_type, size, sha256, bytes)
      values (${conv.id}, ${m.id}, 'image/png', ${png.length}, 'x', ${png}) returning id::text`;
    const taskId = await M.runner.createRootTask(sql, { agentId: "kung", conversationId: conv.id, text: "Le club m'a répondu, regarde", deep: true });
    const vus: Record<string, Params> = {};
    const images = (p: Params) => JSON.stringify(p.messages).match(/"type":"base64","media_type":"image\/png","data":"iVBOR/g)?.length ?? 0;
    const llm = {
      async create(p: Params) {
        const a = agentOf(p), t = turn(p);
        vus[`${a}${t}`] = p;
        if (a === "kung" && t === 0) return reply("tool_use", [
          toolUse("deleguer", { agent: "bililou", consigne: "Analyse la réponse du club et propose une réponse.", captures: [att.id.slice(0, 8)] }),
          toolUse("deleguer", { agent: "popi", consigne: "Enregistre la réponse visible sur la capture.", captures: ["deadbeef"] }),
        ]);
        if (a === "kung") {
          expect(lastUser(p)).toContain("Captures introuvables : deadbeef");
          return reply("end_turn", [text("Voici l'analyse.")]);
        }
        return reply("end_turn", [text("Analyse : refus poli.")]);
      },
    };
    await drain(llm);
    expect(vus.kung0.model).toBe("claude-opus-5-5"); // réflexion approfondie demandée
    expect((vus.kung0 as { output_config?: { effort?: string } }).output_config?.effort).toBe("high");
    expect(images(vus.kung0)).toBe(1);
    expect(JSON.stringify(vus.kung0.messages)).toContain(`#${att.id.slice(0, 8)}`);
    expect(images(vus.bililou0)).toBe(1); // Bililou voit bien la capture
    expect(vus.bililou0.model).toBe("claude-sonnet-5-5"); // le mode approfondi ne concerne que Kung
    expect(vus.popi0).toBeUndefined(); // délégation refusée : capture inconnue
    // La transcription stockée ne contient qu'une référence, pas l'image (pas de copies en base).
    const [t] = await sql<{ transcript: unknown }[]>`select transcript from tasks where id = ${taskId}`;
    expect(JSON.stringify(t.transcript)).not.toContain("iVBOR");
    expect(JSON.stringify(t.transcript)).toContain(att.id);
    // Capture purgée (durée de conservation dépassée) : remplacée par une mention, pas d'erreur.
    const { purgeOld, hydrate } = await import("@/lib/attachments");
    await sql`update attachments set created_at = now() - interval '400 days' where id = ${att.id}`;
    expect(await purgeOld(sql, 180)).toBe(1);
    const h = await hydrate(sql, t.transcript as never);
    expect(JSON.stringify(h)).toContain("expirée");
  });

  it("export Excel : le fichier d'origine est reconstruit avec les valeurs à jour de la base", async () => {
    const { buildWorkbook } = await import("@/lib/crm/xlsx-export");
    const { parseWorkbook } = await import("@/lib/crm/xlsx-import");
    const clubs = await M.repo.loadClubs(sql);
    const [arch] = await sql<{ file_base64: string; clubs: any }[]>`select file_base64, sheets -> 'Clubs' as clubs from crm_import_archive`;
    const { buffer, ajoutes, cellules } = await buildWorkbook(arch.file_base64, arch.clubs, clubs);
    expect(ajoutes).toEqual([]);
    expect(cellules).toBeGreaterThan(3);
    // Seul l'onglet Clubs a changé dans le fichier : tout le reste est identique octet pour octet.
    const JSZip = (await import("jszip")).default;
    const [a, b] = await Promise.all([JSZip.loadAsync(readFileSync(XLSX)), JSZip.loadAsync(buffer)]);
    expect(Object.keys(b.files).sort()).toEqual(Object.keys(a.files).sort());
    const differents: string[] = [];
    for (const f of Object.keys(a.files)) if (!a.files[f].dir && (await a.file(f)!.async("string")) !== (await b.file(f)!.async("string"))) differents.push(f);
    expect(differents).toEqual(["xl/worksheets/sheet7.xml"]);
    writeFileSync(path.join(path.dirname(XLSX), "..", "export-test.xlsx"), buffer);
    const relu = await parseWorkbook(buffer, "export.xlsx");
    expect(Object.keys(relu.sheets).sort()).toEqual(Object.keys((await parseWorkbook(readFileSync(XLSX), "o.xlsx")).sheets).sort());
    expect(relu.formulaHeaders.length).toBe(9);
    const byId = new Map(relu.clubs.map((c) => [c.id, c.data]));
    const ecarts: string[] = [];
    for (const c of clubs) for (const [k, v] of Object.entries(c.data)) if (JSON.stringify(byId.get(c.id)?.[k] ?? null) !== JSON.stringify(v ?? null)) ecarts.push(`${c.id}·${k}`);
    expect(ecarts.slice(0, 10)).toEqual([]);
    expect(String(byId.get(clubNote.id)?.["Notes"])).toContain("Note de test moteur");
    expect(byId.get(clubNeuf.id)?.["Statut"]).toBe("Contacté");
  }, 120_000);
});
