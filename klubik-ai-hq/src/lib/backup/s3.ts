// Stockage externe compatible S3 (Backblaze B2 recommandé : 10 Go gratuits ; aussi Cloudflare R2, Scaleway…).
// La clé d'accès conseillée n'a PAS le droit de supprimer : un serveur compromis ne peut pas effacer les sauvegardes.
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

export async function putObject(c: S3Config, key: string, body: Buffer): Promise<void> {
  await check(await client(c).fetch(url(c, key), {
    method: "PUT", body: new Uint8Array(body), headers: { "content-type": "application/octet-stream" },
  }), "Envoi vers le stockage externe");
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
