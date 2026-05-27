// Applies a SQL migration file directly via the Supabase pooler.
// Usage: node scripts/apply-migration.mjs scripts/migrations/<file>.sql

import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k),
);

const password = process.env.SUPABASE_DB_PASSWORD || env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("Missing SUPABASE_DB_PASSWORD (env or .env.local)");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <sql-file>");
  process.exit(1);
}

// Derive project ref from URL and build pooler connection string.
const refMatch = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)\./);
if (!refMatch) {
  console.error("Could not derive project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const ref = refMatch[1];

const connectionString =
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
  `@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;

const sql = readFileSync(file, "utf8");
console.log(`Applying ${file} (${sql.length} bytes)...`);

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  console.log("Connected to Supabase.");
  await client.query(sql);
  console.log("Migration applied successfully.");
} catch (err) {
  console.error("Migration failed:");
  console.error(err.message);
  if (err.detail) console.error("Detail:", err.detail);
  if (err.hint) console.error("Hint:", err.hint);
  process.exit(1);
} finally {
  await client.end();
}
