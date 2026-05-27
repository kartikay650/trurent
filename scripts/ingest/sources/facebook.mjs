// Facebook source — scaffolded but DISABLED by default.
//
// Why this isn't on by default
// ----------------------------
// Facebook actively blocks anonymous scraping. To pull posts from public
// groups you need:
//   1. A real session cookie (logged-in user with group membership)
//   2. A browser-like UA + accept-language headers
//   3. Often Playwright/Puppeteer, not plain fetch — FB serves a JS-only shell
//      to non-browser clients these days
//
// This module is wired into the pipeline so we have a slot for FB, but it
// no-ops until you set both of:
//
//   FB_SESSION_COOKIE   — the value of the `c_user`+`xs` cookie (or a full
//                          cookie header) from a logged-in browser session
//   FB_GROUP_IDS         — comma-separated list of group ids/URLs to crawl
//
// When set, this calls a small helper (`scripts/ingest/shared/fb-fetch.mjs`,
// not included in this commit) that drives Playwright headless. That helper
// is out of scope for the initial scaffold — adding it pulls in ~150MB of
// Chromium and is brittle enough to warrant its own iteration.

import { daysAgoFromUnix } from "../shared/util.mjs";

export const id = "facebook";

export async function fetchPosts() {
  const cookie = process.env.FB_SESSION_COOKIE;
  const groups = (process.env.FB_GROUP_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!cookie || groups.length === 0) {
    console.log(
      "  [fb] skipped — set FB_SESSION_COOKIE and FB_GROUP_IDS to enable.",
    );
    console.log(
      "  [fb] (the actual fetcher requires Playwright; not wired yet.)",
    );
    return [];
  }

  console.log(`  [fb] would crawl ${groups.length} groups, but the Playwright`);
  console.log(`  [fb] fetcher isn't built yet. Skipping.`);
  return [];
}

// preFilter / rawText / normalize follow the same shape as Reddit so the
// pipeline can call them without source-specific branches once posts arrive.

export function preFilter(post) {
  const text = `${post.title || ""}\n${post.body || ""}`.toLowerCase();
  if (text.length < 50) return false;
  if (!/\b(bhk|bedroom|studio|flat|apartment|room|pg)\b/.test(text)) return false;
  if (!/(₹|\brs\.?\b|rupees|\b\d{1,2}k\b|\blakh\b|\brent\b|\bdeposit\b)/.test(text))
    return false;
  return true;
}

export function rawText(post) {
  return `Title: ${post.title || "(no title)"}\n\nBody:\n${post.body || "(no body)"}`;
}

export function normalize(post, parsed) {
  const id = `fb_${post.id}`;
  return {
    id,
    title: parsed.title || `${parsed.bhk}BHK ${parsed.locality}`,
    locality: parsed.locality,
    rent: parsed.rent,
    deposit: parsed.deposit ?? parsed.rent * 10,
    brokerage: parsed.brokerage ?? parsed.rent,
    bhk: parsed.bhk,
    furnished: parsed.furnished || "semi",
    listingType: parsed.listingType || "room",
    genderPreference: parsed.genderPreference || "any",
    amenities: Array.isArray(parsed.amenities) ? parsed.amenities : [],
    nearby: [],
    source: "facebook",
    sourceUrl: post.permalink || null,
    sourceAuthor: post.author || null,
    sourceSubreddit: post.groupName || null, // reuse this column for FB group label
    description:
      parsed.description ||
      (post.body || post.title || "").slice(0, 240).replace(/\s+/g, " "),
    postedDaysAgo: post.created_utc ? daysAgoFromUnix(post.created_utc) : 0,
    postedAt: post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : new Date().toISOString(),
    photos: Array.isArray(post.photos) ? post.photos.slice(0, 5) : [],
    hasRealPhotos: Array.isArray(post.photos) && post.photos.length > 0,
    locationQuery: parsed.location_query || parsed.locality,
    _seedKey: id,
  };
}
