// Health + status endpoint. Hit /api/health for a JSON snapshot of:
//   - service ok / not ok
//   - listing count + last scrape timestamp + age
//   - whether the Anthropic API key + Supabase env are configured
//
// Used by uptime monitors and by humans verifying a deploy.

import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();

  // Pull the latest scrape_meta row + listing count from Supabase. Both are
  // cheap queries that go through the public anon key.
  const [{ data: metaRow, error: metaErr }, { count: listingCount, error: countErr }] =
    await Promise.all([
      supabase
        .from("scrape_meta")
        .select("*")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("listings").select("*", { count: "exact", head: true }),
    ]);

  const dbReachable = !metaErr && !countErr;
  const scrapedAt = metaRow?.scrapedAt ? new Date(metaRow.scrapedAt).getTime() : null;
  const ageMs = scrapedAt ? now - scrapedAt : null;
  const ageHours = ageMs != null ? Math.round(ageMs / (60 * 60 * 1000)) : null;
  // Data is stale if it hasn't refreshed in over 36h (cron is daily).
  const stale = ageHours != null && ageHours > 36;

  const status = {
    ok: dbReachable && (listingCount ?? 0) > 0,
    service: "trurent",
    version: "1.1.0",
    listings: {
      count: listingCount ?? 0,
      scrapedAt: metaRow?.scrapedAt ?? null,
      ageHours,
      stale,
      realPhotoCount: metaRow?.realPhotoCount ?? null,
      zeroBrokerageCount: metaRow?.zeroBrokerageCount ?? null,
      bhkDistribution: metaRow?.bhkDistribution ?? null,
      typeDistribution: metaRow?.typeDistribution ?? null,
      genderDistribution: metaRow?.genderDistribution ?? null,
      sourceSubreddits: metaRow?.sourceSubreddits ?? null,
      geocodedCount: metaRow?.geocodedCount ?? null,
    },
    config: {
      anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
      supabaseConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      dbReachable,
    },
    serverTime: new Date(now).toISOString(),
  };

  return new Response(JSON.stringify(status, null, 2), {
    status: status.ok && !stale ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
