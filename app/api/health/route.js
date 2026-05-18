// Health + status endpoint. Hit /api/health for a JSON snapshot of:
//   - service ok / not ok
//   - listing count + last scrape timestamp + age
//   - whether the Anthropic API key is configured
//
// Used by uptime monitors and by humans verifying a deploy.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const meta = readJson("public/data/meta.json");
  const listings = readJson("public/data/listings.json");

  const now = Date.now();
  const scrapedAt = meta?.scrapedAt ? new Date(meta.scrapedAt).getTime() : null;
  const ageMs = scrapedAt ? now - scrapedAt : null;
  const ageHours = ageMs != null ? Math.round(ageMs / (60 * 60 * 1000)) : null;
  // We consider data stale if it hasn't refreshed in over 36h (cron is daily).
  const stale = ageHours != null && ageHours > 36;

  const status = {
    ok: !!listings && Array.isArray(listings) && listings.length > 0,
    service: "trurent",
    version: "1.0.0",
    listings: {
      count: Array.isArray(listings) ? listings.length : 0,
      scrapedAt: meta?.scrapedAt ?? null,
      ageHours,
      stale,
      sourceBreakdown: meta?.sourceSubreddits ?? null,
      bhkDistribution: meta?.bhkDistribution ?? null,
      geocodedCount: meta?.geocodedCount ?? null,
    },
    config: {
      anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
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
