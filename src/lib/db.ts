import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

const DATABASE_URL = process.env.DATABASE_URL || "";

let client: SqlClient | null = null;

export const hasDatabase = Boolean(DATABASE_URL);

function createClient(): SqlClient | null {
  if (!DATABASE_URL) return null;
  if (client) return client;

  client = postgres(DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: DATABASE_URL.includes("sslmode=require") ? "require" : undefined
  });

  return client;
}

async function emptySqlResult<T extends any[] = any[]>(): Promise<T> {
  console.warn("DATABASE_URL missing. Returning empty SQL result.");
  return [] as unknown as T;
}

type SqlTag = {
  <T extends any[] = any[]>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;

  unsafe: <T extends any[] = any[]>(
    query: string,
    values?: unknown[]
  ) => Promise<T>;

  begin: <T>(
    fn: (tx: any) => Promise<T>
  ) => Promise<T>;

  end: () => Promise<void>;
};

export const sql: SqlTag = Object.assign(
  async <T extends any[] = any[]>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> => {
    const db = createClient();

    if (!db) {
      return emptySqlResult<T>();
    }

    const rows = await (db as any)(strings, ...values);
    return rows as T;
  },
  {
    unsafe: async <T extends any[] = any[]>(
      query: string,
      values: unknown[] = []
    ): Promise<T> => {
      const db = createClient();

      if (!db) {
        return emptySqlResult<T>();
      }

      const rows = await (db as any).unsafe(query, values);
      return rows as T;
    },

    begin: async <T>(
      fn: (tx: any) => Promise<T>
    ): Promise<T> => {
      const db = createClient();

      if (!db) {
        throw new Error("DATABASE_URL is missing. Cannot start transaction.");
      }

      const result = await (db as any).begin(fn);
      return result as unknown as T;
    },

    end: async (): Promise<void> => {
      if (!client) return;

      await client.end();
      client = null;
    }
  }
);

export function getSql(): SqlTag {
  return sql;
}

export async function dbQuery<T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const rows = await sql<T[]>(strings, ...values);
  return rows;
}

export async function closeDb(): Promise<void> {
  await sql.end();
}

export default sql;