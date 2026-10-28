// Envoi vers le stockage externe : la taille (Content-Length) doit toujours être annoncée, car Backblaze B2 refuse
// un envoi « par morceaux » (HTTP 411). Le serveur Next.js remplace fetch par une version qui envoie par morceaux :
// on simule ce remplacement pour vérifier que l'envoi n'en dépend pas. Aucune base ni réseau externe nécessaires.
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { putObject } from "@/lib/backup/s3";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("envoi S3", () => {
  it("annonce la taille et envoie le contenu exact, même si fetch est remplacé", async () => {
    // fetch « à la Next.js » : reconstruit la requête à partir d'un flux (envoi par morceaux, sans Content-Length).
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (input instanceof Request && input.body) {
        return realFetch(input.url, { method: input.method, headers: input.headers, body: input.body, duplex: "half" } as RequestInit);
      }
      const body = init?.body ? new Blob([init.body as BlobPart]).stream() : undefined;
      return realFetch(input, { ...init, body, duplex: "half" } as RequestInit);
    }) as typeof fetch;
    let seen: { headers: http.IncomingHttpHeaders; body: Buffer } | null = null;
    const srv = http.createServer((req, res) => {
      const parts: Buffer[] = [];
      req.on("data", (d) => parts.push(d));
      req.on("end", () => {
        seen = { headers: req.headers, body: Buffer.concat(parts) };
        if (!req.headers["content-length"]) { res.writeHead(411); return res.end("<Code>MissingContentLength</Code>"); }
        res.end();
      });
    }).listen(0);
    const port = (srv.address() as { port: number }).port;
    const data = Buffer.from(Array.from({ length: 50_000 }, (_, i) => i % 251));
    await putObject({ endpoint: `http://127.0.0.1:${port}`, region: "eu-central-003", bucket: "b", accessKeyId: "k", secretAccessKey: "s", prefix: "p/" }, "p/2026/x.khqbk", data);
    srv.close();
    expect(seen!.headers["content-length"]).toBe(String(data.length));
    expect(seen!.headers["transfer-encoding"]).toBeUndefined();
    expect(seen!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=k\/\d{8}\/eu-central-003\/s3\/aws4_request/);
    expect(seen!.body.equals(data)).toBe(true);
  });

  it("remonte une erreur lisible si le stockage refuse", async () => {
    const srv = http.createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(403); res.end("<Code>AccessDenied</Code>"); }); }).listen(0);
    const port = (srv.address() as { port: number }).port;
    await expect(putObject({ endpoint: `http://127.0.0.1:${port}`, region: "r", bucket: "b", accessKeyId: "k", secretAccessKey: "s", prefix: "" }, "x.khqbk", Buffer.from("x")))
      .rejects.toThrow(/HTTP 403 .*AccessDenied/);
    srv.close();
  });
});
