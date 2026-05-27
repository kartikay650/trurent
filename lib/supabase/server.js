// Server-only Supabase admin client. Uses the service-role key to bypass
// RLS — strictly server-side. Never import this from a "use client" file:
// Next.js would refuse to bundle SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_
// prefix), but the dependency graph should make the boundary obvious anyway.

import { createClient as createAdminClient } from "@supabase/supabase-js";

export const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
