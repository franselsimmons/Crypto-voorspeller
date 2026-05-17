import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

declare global {
  // eslint-disable-next-line no-var
  var __tradeOptimizerSql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__tradeOptimizerSql ??
  postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: databaseUrl.includes("sslmode=require") ? "require" : undefined
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__tradeOptimizerSql = sql;
}