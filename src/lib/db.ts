import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

let client: SqlClient | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url || null;
}

export function getSql(): SqlClient | null {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (client) {
    return client;
  }

  const isLocal =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1");

  client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isLocal ? false : ("require" as any)
  });

  return client;
}

export function requireSql(): SqlClient {
  const sql = getSql();

  if (!sql) {
    throw new Error("DATABASE_URL is missing");
  }

  return sql;
}

export async function pingDatabase(): Promise<{
  ok: boolean;
  mode: "POSTGRES" | "NO_DATABASE";
  error?: string;
}> {
  const sql = getSql();

  if (!sql) {
    return {
      ok: false,
      mode: "NO_DATABASE",
      error: "DATABASE_URL is missing"
    };
  }

  try {
    await sql`select 1 as ok`;

    return {
      ok: true,
      mode: "POSTGRES"
    };
  } catch (error) {
    return {
      ok: false,
      mode: "POSTGRES",
      error: error instanceof Error ? error.message : "UNKNOWN_DATABASE_ERROR"
    };
  }
}