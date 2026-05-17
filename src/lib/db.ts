import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

const DATABASE_URL = process.env.DATABASE_URL || "";

let client: SqlClient | null = null;

export const hasDatabase = Boolean(DATABASE_URL);

function createClient(): SqlClient | null {
  if (!DATABASE_URL) {
    return null;
  }

  if (client) {
    return client;
  }

  client = postgres(DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: DATABASE_URL.includes("sslmode=require")
      ? "require"
      : undefined
  });

  return client;
}

async function emptySqlResult() {
  console.warn("DATABASE_URL missing. Returning empty SQL result.");
  return [];
}

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>;
  unsafe: (query: string, values?: unknown[]) => Promise<any[]>;
  begin: <T>(fn: (tx: SqlClient) => Promise<T>) => Promise<T>;
  end: () => Promise<void>;
};

export const sql: SqlTag = Object.assign(
  async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const db = createClient();

    if (!db) {
      return emptySqlResult();
    }

    return db(strings, ...values);
  },
  {
    unsafe: async (query: string, values: unknown[] = []) => {
      const db = createClient();

      if (!db) {
        return emptySqlResult();
      }

      return db.unsafe(query, values);
    },

    begin: async <T>(fn: (tx: SqlClient) => Promise<T>) => {
      const db = createClient();

      if (!db) {
        throw new Error("DATABASE_URL is missing. Cannot start transaction.");
      }

      return db.begin(fn);
    },

    end: async () => {
      if (!client) return;

      await client.end();
      client = null;
    }
  }
);

export async function dbQuery<T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const rows = await sql(strings, ...values);
  return rows as T[];
}

export async function closeDb() {
  await sql.end();
}

export default sql;