// Applique db/schema.sql (idempotent). Usage : DATABASE_URL=… npm run db:migrate
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant.");
  process.exit(1);
}
const local = url.includes("localhost") || url.includes("/tmp") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: local ? false : "require", prepare: false, onnotice: () => {} });
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
console.log("Schéma appliqué. Tables :", tables.map((t) => t.table_name).join(", "));
await sql.end();
