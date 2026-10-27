import postgres from "postgres";

// Connexion Postgres côté serveur uniquement (Supabase : chaîne « Session pooler » ou directe).
declare global {
  // eslint-disable-next-line no-var
  var __klubikSql: postgres.Sql | undefined;
}

export function getSql(): postgres.Sql {
  if (!globalThis.__klubikSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquant (variable d'environnement côté serveur).");
    globalThis.__klubikSql = postgres(url, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idle_timeout: 30,
      prepare: false, // compatible avec le pooler Supabase (mode transaction)
      ssl: url.includes("localhost") || url.includes("/tmp") || url.includes("127.0.0.1") ? false : "require",
      onnotice: () => {},
    });
  }
  return globalThis.__klubikSql;
}

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** Connexion ou transaction : pour les lectures utilisables dans les deux contextes. */
export type Q = postgres.Sql | postgres.TransactionSql;
