import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "db", "schema.sql");

if (!fs.existsSync(schemaPath)) {
  console.error(`Schema niet gevonden: ${schemaPath}`);
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, "utf8");

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: databaseUrl.includes("sslmode=require") ? "require" : undefined
});

async function main() {
  console.log("Database migratie gestart...");

  await sql.unsafe(schema);

  console.log("Database migratie klaar.");
  await sql.end();
}

main().catch(async error => {
  console.error("Database migratie mislukt:");
  console.error(error);
  await sql.end({ timeout: 1 });
  process.exit(1);
});