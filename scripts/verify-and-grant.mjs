// Verifies migration 0002 took effect, then grants admin role to the user.
// Usage: SUPABASE_DB_PASSWORD=<pwd> node scripts/verify-and-grant.mjs

import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k),
);

const ADMIN_EMAIL = process.argv[2] || process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.error("Usage: node scripts/verify-and-grant.mjs <admin-email>");
  console.error("       OR set ADMIN_EMAIL in env.");
  process.exit(1);
}

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("Set SUPABASE_DB_PASSWORD in env.");
  process.exit(1);
}

const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const connectionString =
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
  `@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;

const client = new pg.Client({ connectionString });
await client.connect();

try {
  console.log("=== Verifying migration ===\n");

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='listings'
      AND column_name IN ('status','submittedBy','ownerEmail','ownerWhatsapp',
                          'verifiedAt','lastSeenAt','flaggedReasons','rejectionReason')
    ORDER BY column_name
  `);
  console.log("New listings columns present:",
    cols.rows.map((r) => r.column_name).join(", "));

  const tbl = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name='profiles'
  `);
  console.log("profiles table exists:", tbl.rows.length === 1);

  const pol = await client.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='listings'
    ORDER BY policyname
  `);
  console.log("listings RLS policies:");
  for (const r of pol.rows) console.log("  -", r.policyname);

  const bucket = await client.query(`
    SELECT id FROM storage.buckets WHERE id='listing-photos'
  `);
  console.log("listing-photos bucket exists:", bucket.rows.length === 1);

  console.log("\n=== Granting admin to", ADMIN_EMAIL, "===\n");
  const user = await client.query(
    `SELECT id, email FROM auth.users WHERE email = $1`,
    [ADMIN_EMAIL],
  );

  if (user.rows.length === 0) {
    console.log("No auth.users row yet for that email.");
    console.log("Sign in once via /post, then re-run this script (or:");
    console.log(`  UPDATE public.profiles SET role='admin' WHERE id=(SELECT id FROM auth.users WHERE email='${ADMIN_EMAIL}');`);
    console.log(")");
  } else {
    const uid = user.rows[0].id;
    await client.query(
      `INSERT INTO public.profiles (id, email, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (id) DO UPDATE SET role='admin'`,
      [uid, ADMIN_EMAIL],
    );
    console.log("Admin granted to", ADMIN_EMAIL, "(", uid, ")");
  }
} finally {
  await client.end();
}
