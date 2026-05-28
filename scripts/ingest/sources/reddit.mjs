// Reddit source. Targets Bangalore-specific rental subs with EXHAUSTIVE
// pagination — paginate until we hit posts older than MAX_AGE_DAYS, not just
// the first 3 pages.
//
// We deliberately stay narrow (no India-wide subs); going broad dilutes yield.
//
// Auth: Reddit closed unauthenticated .json access. We use OAuth with the
// "password" grant (script-app type) — needs REDDIT_CLIENT_ID,
// REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD env vars. If those
// aren't set, we fall back to the public .json endpoints (will 403 in CI
// but might still work locally if Reddit ever loosens up again).

import { USER_AGENT } from "../shared/env.mjs";
import { sleep, daysAgoFromUnix } from "../shared/util.mjs";

const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS || "120", 10);

// ---- Reddit OAuth (script-app password grant) -----------------------------

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getRedditToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  if (!clientId || !clientSecret || !username || !password) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error(
      `[reddit] OAuth token request failed (${res.status}): ${t.slice(0, 200)}`,
    );
    return null;
  }
  const json = await res.json();
  if (!json.access_token) {
    console.error("[reddit] OAuth response missing access_token:", json);
    return null;
  }
  cachedToken = json.access_token;
  // Subtract 60s as safety margin against clock skew.
  cachedTokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  console.log(
    `[reddit] OAuth token acquired, valid for ${json.expires_in}s`,
  );
  return cachedToken;
}

// Per-feed pagination cap. 30 pages × 100 posts = 3000 posts theoretical max
// per feed, plenty even for the most active subs.
const MAX_PAGES_PER_FEED = 30;

// Bangalore-focused feeds only. Order is roughly highest-signal first.
const FEEDS = [
  // Specialty subs: exhaust their entire 120-day window
  { type: "feed", subreddit: "bangalorerentals", sort: "new" },
  { type: "feed", subreddit: "bangalorerentals", sort: "top", t: "year" },
  { type: "feed", subreddit: "BangaloreFlatsRental", sort: "new" },
  { type: "feed", subreddit: "BangaloreFlatsRental", sort: "top", t: "year" },

  // r/bangalore and r/Bengaluru are huge general subs; precise search-mode only
  { type: "search", subreddit: "bangalore", q: "rent BHK", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "looking for tenant", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "available for rent", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "flat for rent", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "flatmate needed", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "room available rent", sort: "new" },
  { type: "search", subreddit: "Bengaluru", q: "rent BHK", sort: "new" },
  { type: "search", subreddit: "Bengaluru", q: "available for rent", sort: "new" },
  { type: "search", subreddit: "Bengaluru", q: "flatmate needed", sort: "new" },
];

function buildUrl(feed, after, host) {
  // host is "www.reddit.com" (unauth fallback) or "oauth.reddit.com" (auth).
  // Endpoints serve identical JSON.
  if (feed.type === "search") {
    const u = new URL(`https://${host}/r/${feed.subreddit}/search.json`);
    u.searchParams.set("q", feed.q);
    u.searchParams.set("restrict_sr", "1");
    u.searchParams.set("sort", feed.sort);
    u.searchParams.set("limit", "100");
    if (after) u.searchParams.set("after", after);
    return u.toString();
  }
  const u = new URL(
    `https://${host}/r/${feed.subreddit}/${feed.sort}.json`,
  );
  u.searchParams.set("limit", "100");
  if (feed.t) u.searchParams.set("t", feed.t);
  if (after) u.searchParams.set("after", after);
  return u.toString();
}

// Paginate until we hit MAX_PAGES_PER_FEED, posts older than cutoff,
// or Reddit gives us no `after` token.
async function exhaustFeed(feed, cutoffUnix, token) {
  const host = token ? "oauth.reddit.com" : "www.reddit.com";
  const baseHeaders = { "User-Agent": USER_AGENT };
  if (token) baseHeaders["Authorization"] = `Bearer ${token}`;

  const posts = [];
  let after = null;
  let pagesPulled = 0;
  let stopReason = "max_pages";

  for (let page = 0; page < MAX_PAGES_PER_FEED; page++) {
    const url = buildUrl(feed, after, host);
    let res;
    try {
      res = await fetch(url, { headers: baseHeaders });
    } catch (e) {
      stopReason = `fetch_err:${e.message}`;
      break;
    }
    if (res.status === 429) {
      console.log(`    [feed] rate-limited; sleeping 30s`);
      await sleep(30000);
      page -= 1;
      continue;
    }
    if (!res.ok) {
      stopReason = `http_${res.status}`;
      break;
    }
    const json = await res.json();
    const children = json?.data?.children || [];
    if (children.length === 0) {
      stopReason = "empty_page";
      break;
    }
    pagesPulled += 1;

    let pageHasFresh = false;
    for (const c of children) {
      const p = c.data;
      if (!p?.id) continue;
      if (p.created_utc >= cutoffUnix) pageHasFresh = true;
      posts.push(p);
    }

    // If THIS WHOLE PAGE is older than cutoff, we've gone past the window
    if (!pageHasFresh) {
      stopReason = "past_window";
      break;
    }
    after = json?.data?.after;
    if (!after) {
      stopReason = "no_after";
      break;
    }
    await sleep(1500);
  }
  return { posts, pagesPulled, stopReason };
}

export const id = "reddit";

export async function fetchPosts() {
  const token = await getRedditToken();
  if (!token) {
    console.log(
      "[reddit] No OAuth credentials — Reddit closed unauthenticated access; " +
        "set REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD to enable scraping",
    );
  }
  console.log(
    `[reddit] Pulling ${FEEDS.length} feeds via ${token ? "oauth.reddit.com" : "www.reddit.com (unauth, likely to 403)"}, window=${MAX_AGE_DAYS}d, max ${MAX_PAGES_PER_FEED} pages/feed`,
  );
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86400;
  const seen = new Map();

  for (const feed of FEEDS) {
    const label =
      feed.type === "search"
        ? `r/${feed.subreddit} search "${feed.q}"`
        : `r/${feed.subreddit} ${feed.sort}${feed.t ? "/" + feed.t : ""}`;
    process.stdout.write(`  ${label.padEnd(50)} `);
    const { posts, pagesPulled, stopReason } = await exhaustFeed(feed, cutoff, token);
    let added = 0;
    for (const p of posts) {
      if (p.created_utc < cutoff) continue;
      if (seen.has(p.id)) continue;
      seen.set(p.id, p);
      added += 1;
    }
    console.log(
      `${posts.length.toString().padStart(4)} fetched, ${added.toString().padStart(3)} new in window  (pages=${pagesPulled}, stop=${stopReason})`,
    );
    await sleep(1500);
  }

  return [...seen.values()];
}

export function preFilter(post) {
  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const text = `${title}\n${body}`;
  if (text.length < 50) return false;
  if (text.length > 6000) return false;
  if (post.removed_by_category || post.banned_by) return false;
  const t = (post.selftext || "").trim();
  if (t === "[deleted]" || t === "[removed]") return false;
  if (!/\b(bhk|bedroom|studio|flat|apartment|room|pg)\b/.test(text)) return false;
  if (
    !/(₹|\brs\.?\b|rupees|\b\d{1,2}k\b|\blakh\b|\brent\b|\bdeposit\b)/.test(text)
  )
    return false;
  const ttl = post.title || "";
  if (/^\s*\[(advice|help|discussion|rant|question|update)\]/i.test(ttl))
    return false;
  if (/(scam|warning|fraud|complaint|nightmare|cheated)/i.test(ttl))
    return false;
  if (
    /^(is it|how to|why is|why are|why do|anyone know|anyone else|does anyone|need advice|seeking advice)/i.test(
      ttl,
    )
  )
    return false;
  if (
    /^(looking for|need a|searching for|wanted|where to find|wtb|in search of)/i.test(
      ttl.trim(),
    )
  )
    return false;
  return true;
}

export function rawText(post) {
  return `Title: ${post.title}\n\nBody:\n${post.selftext || "(no body)"}`;
}

// Extract photos directly from Reddit post (gallery / preview / direct).
export function extractPhotos(post) {
  const photos = [];
  const seen = new Set();
  function add(url) {
    if (!url || seen.has(url)) return;
    const clean = url.replace(/&amp;/g, "&");
    seen.add(clean);
    photos.push(clean);
  }
  if (post.gallery_data?.items && post.media_metadata) {
    for (const item of post.gallery_data.items) {
      const meta = post.media_metadata[item.media_id];
      if (meta?.s?.u) add(meta.s.u);
    }
  }
  if (post.preview?.images) {
    for (const img of post.preview.images) {
      if (img.source?.url) add(img.source.url);
    }
  }
  if (/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(post.url || "")) add(post.url);
  return photos.length > 0 ? photos.slice(0, 5) : null;
}

// Shape a parsed extraction + raw post into a canonical Listing row.
export function normalize(post, parsed) {
  const id = `rdt_${post.id}`;
  const redditPhotos = extractPhotos(post);
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
    source: "reddit",
    sourceUrl: `https://www.reddit.com${post.permalink}`,
    sourceAuthor: post.author,
    sourceSubreddit: post.subreddit,
    description:
      parsed.description ||
      (post.selftext || post.title).slice(0, 240).replace(/\s+/g, " "),
    postedDaysAgo: daysAgoFromUnix(post.created_utc),
    postedAt: new Date(post.created_utc * 1000).toISOString(),
    // Only carry real photos extracted from the post. Stock/AI photos used to
    // be filled in here as a fallback, but the UI now renders an honest
    // "no photos" state when this array is empty.
    photos: redditPhotos || [],
    hasRealPhotos: !!redditPhotos,
    locationQuery: parsed.location_query || parsed.locality, // used by geocoder
    _seedKey: id, // used by geocoder fallback jitter
  };
}
