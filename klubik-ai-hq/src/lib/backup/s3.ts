// Stockage externe compatible S3 (Backblaze B2 recommandé : 10 Go gratuits ; aussi Cloudflare R2, Scaleway…).
// La clé d'accès conseillée n'a PAS le droit de supprimer : un serveur compromis ne peut pas effacer les sauvegardes.
import http from "node:http";
import https from "node:https";
import { AwsClient } from "aws4fetch";

export interface S3Config { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix: string }

export function s3Config(): S3Config | null {
  const e = process.env;
  if (!e.BACKUP_S3_ENDPOINT || !e.BACKUP_S3_BUCKET || !e.BACKUP_S3_KEY_ID || !e.BACKUP_S3_SECRET) return null;
  return {
    endpoint: e.BACKUP_S3_ENDPOINT.replace(/\/+$/, ""),
    region: e.BACKUP_S3_REGION || "auto",
    bucket: e.BACKUP_S3_BUCKET,
    accessKeyId: e.BACKUP_S3_KEY_ID,
    secretAccessKey: e.BACKUP_S3_SECRET,
    prefix: (e.BACKUP_S3_PREFIX ?? "klubik-hq/").replace(/^\/+/, ""),
  };
}

const client = (c: S3Config) => new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: c.region });
const url = (c: S3Config, key = "") => `${c.endpoint}/${encodeURIComponent(c.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function check(r: Response, what: string) {
  if (!r.ok) throw new Error(`${what} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

/**
 * Envoi d'un objet. On n'utilise PAS fetch : dans le serveur Next.js, fetch est remplacé par une version qui
 * transmet le contenu par morceaux sans Content-Length, ce que Backblaze B2 refuse (HTTP 411). La requête est
 * signée par aws4fetch puis envoyée avec le module HTTP de Node, taille annoncée.
 */
export async function putObject(c: S3Config, key: string, body: Buffer): Promise<void> {
  const signed = await client(c).sign(url(c, key), {
    method: "PUT", body: new Uint8Array(body), headers: { "content-type": "application/octet-stream" },
  });
  const headers: Record<string, string> = {};
  signed.headers.forEach((v, k) => { headers[k] = v; });
  headers["content-length"] = String(body.length);
  const target = new URL(signed.url);
  const res = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = (target.protocol === "https:" ? https : http).request(target, { method: "PUT", headers }, (r) => {
      const parts: Buffer[] = [];
      r.on("data", (d: Buffer) => parts.push(d));
      r.on("end", () => resolve({ status: r.statusCode ?? 0, text: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(120_000, () => req.destroy(new Error("délai dépassé")));
    req.end(body);
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Envoi vers le stockage externe : HTTP ${res.status} ${res.text.slice(0, 200)}`);
}

export async function getObject(c: S3Config, key: string): Promise<Buffer> {
  const r = await check(await client(c).fetch(url(c, key)), "Lecture du stockage externe");
  return Buffer.from(await r.arrayBuffer());
}

export interface S3Item { key: string; size: number; lastModified: string }

/** Liste les sauvegardes (les plus récentes d'abord). */
export async function listObjects(c: S3Config, max = 200): Promise<S3Item[]> {
  const items: S3Item[] = [];
  let token: string | null = null;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix: c.prefix, "max-keys": "1000" });
    if (token) q.set("continuation-token", token);
    const xml = await (await check(await client(c).fetch(`${url(c)}?${q}`), "Liste du stockage externe")).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const tag = (t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(m[1])?.[1] ?? "";
      const key = tag("Key").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      if (key.endsWith(".khqbk")) items.push({ key, size: Number(tag("Size")), lastModified: tag("LastModified") });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? null : null;
  } while (token);
  return items.sort((a, b) => b.key.localeCompare(a.key)).slice(0, max);
}
