// Supabase client + listing upsert helpers, used by every source.

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./env.mjs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function upsertListings(listings) {
  if (listings.length === 0) return { error: null, count: 0 };
  // upsert with onConflict on id (primary key) so re-runs update in place
  const { error } = await supabase
    .from("listings")
    .upsert(listings, { onConflict: "id" });
  return { error, count: listings.length };
}

export async function recordScrapeMeta(stats) {
  return supabase.from("scrape_meta").insert([stats]);
}

// Read existing active listings (used for cross-source dedup)
export async function readActiveListings() {
  const { data, error } = await supabase
    .from("listings")
    .select("id, locality, rent, bhk, postedAt, source");
  if (error) throw new Error(`readActiveListings: ${error.message}`);
  return data || [];
}
