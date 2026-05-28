// Supabase client + listing upsert helpers, used by every source.

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./env.mjs";

// supabase-js constructs a RealtimeClient eagerly. RealtimeClient needs a
// WebSocket implementation at construction time, even when nobody ever
// subscribes to a channel. Node 22+ has native WebSocket. Node 20 doesn't,
// and the constructor throws "Node.js 20 detected without native WebSocket".
//
// We don't use realtime here (REST queries only), but to make this resilient
// to any Node version we detect the missing global and hand the `ws` package
// in as a transport. `ws` is in dependencies; if it isn't installed for any
// reason we fall through with a clear error rather than an opaque crash.
let realtimeOpts;
if (typeof globalThis.WebSocket === "undefined") {
  try {
    const wsMod = await import("ws");
    realtimeOpts = { transport: wsMod.default };
    console.log("[supabase] using ws transport (no native WebSocket)");
  } catch (e) {
    console.error(
      "[supabase] no native WebSocket AND no `ws` package installed. " +
      "Install `ws` (npm i ws) or run on Node >= 22.",
    );
    throw e;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: realtimeOpts,
});

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
