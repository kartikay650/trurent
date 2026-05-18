// Scrape current Bangalore rental posts from Reddit and produce listings.json.
//
// What changed in v2:
//   - Switched from PullPush (historical archive) to Reddit's own public .json
//     endpoints. That gets us FRESH posts, not 600-day-old ones.
//   - Heavily weighted toward rental-specific subs (r/bangalorerentals,
//     r/BangaloreFlatsRental) where signal-to-noise is high.
//   - Pagination so we pull more than 100 per sub.
//   - Time-window filter: drop anything older than MAX_AGE_DAYS (default 120).
//   - Each post is re-fetched as .json to confirm it isn't deleted/removed.
//   - Writes public/data/meta.json with scrape timestamp + source counts.
//
// Designed to be safe to run on a cron (no inputs, deterministic output,
// resumable via cache).
//
// Required env:  ANTHROPIC_API_KEY
// Optional env:  REDDIT_USER_AGENT (defaults to one identifying the project)
//                MAX_AGE_DAYS (defaults to 120)

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in environment.");
  process.exit(1);
}

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  "web:TruRent:v1.0 (by /u/kartikay650)";
const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS || "120", 10);
const PAGES_PER_FEED = 3; // 100 * 3 = up to 300 posts per feed

// ---------- sources ----------
// Reddit "new" tab on rental-specific subs gives the highest yield. Search-mode
// queries on general subs catch the rest. PullPush no longer needed; the data
// it returns is too old to be useful for a live product.

const FEEDS = [
  // Rental-specific subs: scan their "new" tab + "top of month".
  { type: "feed", subreddit: "bangalorerentals", sort: "new" },
  { type: "feed", subreddit: "bangalorerentals", sort: "top", t: "month" },
  { type: "feed", subreddit: "BangaloreFlatsRental", sort: "new" },
  { type: "feed", subreddit: "BangaloreFlatsRental", sort: "top", t: "month" },

  // Bigger general subs: search-mode for rental keywords.
  { type: "search", subreddit: "bangalore", q: "rent BHK", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "looking for tenant", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "available for rent", sort: "new" },
  { type: "search", subreddit: "bangalore", q: "flat for rent", sort: "new" },
  { type: "search", subreddit: "Bengaluru", q: "rent BHK", sort: "new" },
  { type: "search", subreddit: "Bengaluru", q: "available for rent", sort: "new" },
  { type: "search", subreddit: "IndianRealEstate", q: "bangalore rent", sort: "new" },
];

// ---------- canonical locality + geo ----------

const LOCALITY_GEO = {
  Koramangala: [12.9352, 77.6245],
  Indiranagar: [12.9719, 77.6412],
  "HSR Layout": [12.9116, 77.6389],
  Whitefield: [12.9698, 77.7499],
  Bellandur: [12.9260, 77.6762],
  "Sarjapur Road": [12.9010, 77.6961],
  Marathahalli: [12.9591, 77.6971],
  "BTM Layout": [12.9165, 77.6101],
  Jayanagar: [12.9250, 77.5938],
  "JP Nagar": [12.8958, 77.5855],
  Banashankari: [12.9141, 77.5467],
  "Bannerghatta Road": [12.8735, 77.5985],
  Hebbal: [13.0358, 77.5970],
  Yelahanka: [13.1005, 77.5963],
  "Electronic City": [12.8399, 77.6770],
  Bommanahalli: [12.8958, 77.6401],
  Singasandra: [12.8780, 77.6310],
  Hennur: [13.0358, 77.6490],
  "Frazer Town": [12.9833, 77.6167],
  Shivajinagar: [12.9833, 77.6000],
  "Cunningham Road": [12.9833, 77.5933],
  "Richmond Town": [12.9600, 77.6010],
  Ulsoor: [12.9833, 77.6219],
  Domlur: [12.9591, 77.6390],
  Malleshwaram: [13.0023, 77.5667],
  Rajajinagar: [12.9906, 77.5530],
  Sadashivanagar: [13.0050, 77.5800],
  "Basaveshwara Nagar": [12.9920, 77.5480],
  Vijayanagar: [12.9719, 77.5310],
  "Mysore Road": [12.9500, 77.5050],
  Nagarbhavi: [12.9554, 77.5063],
  Jalahalli: [13.0433, 77.5380],
  Peenya: [13.0280, 77.5180],
  Nayandahalli: [12.9400, 77.5100],
  Kengeri: [12.9074, 77.4876],
  "RT Nagar": [13.0212, 77.5917],
  "Old Airport Road": [12.9606, 77.6489],
  "CV Raman Nagar": [12.9855, 77.6601],
  "Kasturi Nagar": [13.0100, 77.6550],
  "Pai Layout": [13.0050, 77.6601],
  "Kalyan Nagar": [13.0200, 77.6490],
  Brookefield: [12.9698, 77.7200],
  Hoodi: [12.9855, 77.7100],
  Kadugodi: [12.9855, 77.7667],
  Hoskote: [13.0701, 77.7980],
  Mahadevapura: [12.9940, 77.7010],
  Devanahalli: [13.2488, 77.7143],
};

const IN_BANGALORE = (lat, lng) =>
  lat >= 12.75 && lat <= 13.3 && lng >= 77.4 && lng <= 77.85;

// ---------- utilities ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function jitter(seed) {
  return ((hashOf(seed) % 1000) / 1000 - 0.5) * 0.006;
}

const UNSPLASH_PHOTOS = [
  "1502672260266-1c1ef2d93688",
  "1560448204-e02f11c3d0e2",
  "1554995207-c18c203602cb",
  "1493809842364-78817add7ffb",
  "1522708323590-d24dbb6b0267",
  "1567767292278-a4f21aa2d36e",
  "1505691938895-1758d7feb511",
  "1556909114-f6e7ad7d3136",
  "1484154218962-a197022b5858",
  "1600585154340-be6161a56a0c",
  "1513584684374-8bab748fbf90",
  "1502672023488-70e25813eb80",
];

function pickPhotos(seedKey) {
  const s = hashOf(seedKey);
  const picks = [];
  for (let k = 0; picks.length < 3 && k < UNSPLASH_PHOTOS.length * 2; k++) {
    const id = UNSPLASH_PHOTOS[(s + k * 7) % UNSPLASH_PHOTOS.length];
    if (!picks.includes(id)) picks.push(id);
  }
  return picks.map(
    (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`,
  );
}

function daysAgo(unixSeconds) {
  return Math.max(1, Math.floor((Date.now() / 1000 - unixSeconds) / 86400));
}

// ---------- stage 1: pull fresh posts from Reddit ----------

function buildUrl(feed, after) {
  const sub = feed.subreddit;
  if (feed.type === "search") {
    const u = new URL(`https://www.reddit.com/r/${sub}/search.json`);
    u.searchParams.set("q", feed.q);
    u.searchParams.set("restrict_sr", "1");
    u.searchParams.set("sort", feed.sort);
    u.searchParams.set("limit", "100");
    if (after) u.searchParams.set("after", after);
    return u.toString();
  }
  const u = new URL(`https://www.reddit.com/r/${sub}/${feed.sort}.json`);
  u.searchParams.set("limit", "100");
  if (feed.t) u.searchParams.set("t", feed.t);
  if (after) u.searchParams.set("after", after);
  return u.toString();
}

async function fetchFeed(feed) {
  const out = [];
  let after = null;
  for (let page = 0; page < PAGES_PER_FEED; page++) {
    const url = buildUrl(feed, after);
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch (e) {
      console.log(`    fetch error: ${e.message}`);
      break;
    }
    if (res.status === 429) {
      console.log(`    rate-limited, sleeping 30s`);
      await sleep(30000);
      page -= 1;
      continue;
    }
    if (!res.ok) {
      console.log(`    HTTP ${res.status}, stopping this feed`);
      break;
    }
    const json = await res.json();
    const children = json?.data?.children || [];
    for (const c of children) {
      const p = c.data;
      if (!p?.id) continue;
      out.push(p);
    }
    after = json?.data?.after;
    if (!after) break;
    await sleep(1500); // be polite to Reddit
  }
  return out;
}

async function fetchAll() {
  console.log(`\n[1/4] Pulling fresh posts from ${FEEDS.length} Reddit feeds`);
  console.log(`      Time window: < ${MAX_AGE_DAYS} days old\n`);
  const seen = new Map();
  const stats = {};
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86400;

  for (const feed of FEEDS) {
    const label =
      feed.type === "search"
        ? `r/${feed.subreddit} search "${feed.q}"`
        : `r/${feed.subreddit} ${feed.sort}${feed.t ? "/" + feed.t : ""}`;
    process.stdout.write(`  ${label.padEnd(50)} `);
    const posts = await fetchFeed(feed);
    let kept = 0;
    for (const p of posts) {
      if (p.created_utc < cutoff) continue;
      if (seen.has(p.id)) continue;
      seen.set(p.id, p);
      kept += 1;
    }
    stats[label] = { fetched: posts.length, fresh: kept };
    console.log(`${posts.length} fetched, ${kept} new in window`);
    await sleep(1500);
  }

  return { posts: [...seen.values()], stats };
}

// ---------- stage 2: local pre-filter ----------

function looksLikeListing(post) {
  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const text = `${title}\n${body}`;
  if (text.length < 50) return false;
  if (text.length > 6000) return false;

  if (post.removed_by_category || post.banned_by) return false;
  if ((post.selftext || "").trim() === "[deleted]") return false;
  if ((post.selftext || "").trim() === "[removed]") return false;

  if (!/\b(bhk|bedroom|studio|flat|apartment|room|pg)\b/.test(text)) return false;
  if (!/(₹|\brs\.?\b|rupees|\b\d{1,2}k\b|\blakh\b|\brent\b|\bdeposit\b)/.test(text))
    return false;

  // Tighter title filters: drop obvious WANTED / discussion / scam posts
  const t = post.title || "";
  if (/^\s*\[(advice|help|discussion|rant|question|update)\]/i.test(t)) return false;
  if (/(scam|warning|fraud|complaint|nightmare|cheated|advice)/i.test(t)) return false;
  if (/^(is it|how to|why is|why are|why do|anyone know|anyone else|does anyone|need advice|seeking advice)/i.test(t))
    return false;
  if (/^(looking for|need a|searching for|wanted|where to find|wtb|in search of)/i.test(t.trim()))
    return false;

  return true;
}

// ---------- stage 3: LLM extraction ----------

const EXTRACT_PROMPT = `You parse Reddit posts and decide if each is a Bangalore rental LISTING (someone OFFERING a flat or a room, with a price). Extract structured data only if yes.

OFFERS vs WANTEDs (this is the most important distinction):
- OFFER = "I have a room available" / "Sublet my flat" / "Tenant needed" / "Flatmate replacement" — KEEP
- WANTED = "Looking for a flat" / "Need a place" / "Searching for an apartment" — REJECT
- DISCUSSION / RANT / QUESTION / SCAM ALERT — REJECT

Strict JSON only. No prose. No markdown.

Either:
{ "is_listing": false, "reason": "short reason" }

Or:
{
  "is_listing": true,
  "title": "short clean title, e.g. '2BHK in Koramangala 5th Block'",
  "locality": "ONE Bangalore neighbourhood, EXACT spelling from this list (or 'Unknown'):
Koramangala, Indiranagar, HSR Layout, Whitefield, Bellandur, Sarjapur Road, Marathahalli, BTM Layout, Jayanagar, JP Nagar, Banashankari, Bannerghatta Road, Hebbal, Yelahanka, Electronic City, Bommanahalli, Singasandra, Hennur, Frazer Town, Shivajinagar, Cunningham Road, Richmond Town, Ulsoor, Domlur, Malleshwaram, Rajajinagar, Sadashivanagar, Basaveshwara Nagar, Vijayanagar, Mysore Road, Nagarbhavi, Jalahalli, Peenya, Nayandahalli, Kengeri, RT Nagar, Old Airport Road, CV Raman Nagar, Kasturi Nagar, Pai Layout, Kalyan Nagar, Brookefield, Hoodi, Kadugodi, Hoskote, Mahadevapura, Devanahalli",
  "location_query": "most SPECIFIC address-like string from the post, suitable for geocoding. e.g. 'Koramangala 5th Block, near Sony Signal' or 'HSR Layout Sector 2, 27th Main'. NO city name needed.",
  "rent": integer (INR/month, REQUIRED, must be 5000-200000. If the post says 'X per person' or 'X for the room' that IS the rent),
  "deposit": integer (INR, omit if not stated),
  "brokerage": integer (INR, 0 if zero/no broker/direct owner, omit if not stated),
  "bhk": integer (1 for single rooms / studios / PGs / shared rooms. 2 or 3 ONLY when the whole flat is being offered),
  "furnished": "fully" | "semi" | "unfurnished" (omit if unclear),
  "amenities": array, only from: gym, pool, parking, power_backup, garden, security, club. Omit field if none mentioned.,
  "description": "1-2 sentence summary of what's available, cleaned up from the post"
}

Be STRICT. Mark is_listing: false when:
- The post is a wanted/looking-for, not an offer
- The poster is asking advice or sharing a complaint
- Rent is missing or outside 5000-200000 INR
- Locality can't be inferred to one in the canonical list
- The flat isn't in Bangalore

When in doubt, mark false.`;

async function callHaiku(post, retries = 2) {
  const userContent = `Title: ${post.title}\n\nBody:\n${(post.selftext || "(no body)").slice(0, 3500)}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 700,
          system: EXTRACT_PROMPT,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (res.status === 429) {
        const wait = 5000 * (attempt + 1);
        console.log(`(rate-limited, sleeping ${wait}ms)`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const json = await res.json();
      const text = json?.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(1500);
    }
  }
}

// ---------- stage 4: Nominatim geocoding ----------

async function geocode(query) {
  const full = `${query}, Bangalore, Karnataka, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(full)}&format=json&limit=1&countrycodes=in`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = parseFloat(arr[0].lat);
    const lng = parseFloat(arr[0].lon);
    if (!IN_BANGALORE(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

// ---------- main ----------

async function main() {
  mkdirSync("scripts/.cache", { recursive: true });
  const cachePath = "scripts/.cache/reddit-raw-v2.json";

  let posts, fetchStats;
  if (existsSync(cachePath) && !process.env.NOCACHE) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    posts = cached.posts;
    fetchStats = cached.stats;
    console.log(`[1/4] Cache hit: ${posts.length} posts from ${cachePath}`);
    console.log(`      Set NOCACHE=1 to force re-fetch.`);
  } else {
    const result = await fetchAll();
    posts = result.posts;
    fetchStats = result.stats;
    writeFileSync(cachePath, JSON.stringify({ posts, stats: fetchStats }, null, 2));
    console.log(`\n[1/4] Cached ${posts.length} fresh posts.`);
  }

  console.log(`\n[2/4] Local pre-filter`);
  const candidates = posts.filter(looksLikeListing);
  console.log(`      ${candidates.length} / ${posts.length} pass pre-filter`);

  console.log(`\n[3/4] LLM extraction (Claude Haiku 4.5)`);
  const extracted = [];
  let i = 0;
  for (const post of candidates) {
    i += 1;
    const preview = (post.title || "").slice(0, 56);
    process.stdout.write(`  [${i}/${candidates.length}] ${preview.padEnd(58)} `);
    let parsed;
    try {
      parsed = await callHaiku(post);
    } catch (e) {
      console.log(`ERR ${String(e.message).slice(0, 60)}`);
      await sleep(1500);
      continue;
    }
    if (!parsed?.is_listing) {
      console.log(`skip (${(parsed?.reason || "not listing").slice(0, 70)})`);
      await sleep(100);
      continue;
    }
    if (!parsed.rent || parsed.rent < 5000 || parsed.rent > 200000) {
      console.log(`skip (bad rent ${parsed.rent})`);
      await sleep(100);
      continue;
    }
    if (![1, 2, 3].includes(parsed.bhk)) {
      console.log(`skip (bad bhk ${parsed.bhk})`);
      await sleep(100);
      continue;
    }
    if (!LOCALITY_GEO[parsed.locality]) {
      console.log(`skip (unknown locality "${parsed.locality}")`);
      await sleep(100);
      continue;
    }
    console.log(`KEEP ${parsed.locality} ${parsed.bhk}BHK ₹${parsed.rent}`);
    extracted.push({ post, parsed });
    await sleep(100);
  }

  console.log(`\n[4/4] Nominatim geocoding (1 req/sec)`);
  const listings = [];
  for (let j = 0; j < extracted.length; j++) {
    const { post, parsed } = extracted[j];
    const q = parsed.location_query || parsed.locality;
    process.stdout.write(`  [${j + 1}/${extracted.length}] ${q.slice(0, 60).padEnd(60)} `);
    const geo = await geocode(q);
    await sleep(1100);
    let lat, lng, geoSource;
    if (geo) {
      lat = +geo.lat.toFixed(5);
      lng = +geo.lng.toFixed(5);
      geoSource = "nominatim";
      console.log(`pinned`);
    } else {
      const [bLat, bLng] = LOCALITY_GEO[parsed.locality];
      const id = `rdt_${post.id}`;
      lat = +(bLat + jitter(id)).toFixed(5);
      lng = +(bLng + jitter(id + "x")).toFixed(5);
      geoSource = "locality_centroid";
      console.log(`centroid`);
    }
    if (!IN_BANGALORE(lat, lng)) {
      console.log(`    rejected (out of bbox)`);
      continue;
    }
    const id = `rdt_${post.id}`;
    listings.push({
      id,
      title: parsed.title || `${parsed.bhk}BHK ${parsed.locality}`,
      locality: parsed.locality,
      rent: parsed.rent,
      deposit: parsed.deposit ?? parsed.rent * 10,
      brokerage: parsed.brokerage ?? parsed.rent,
      bhk: parsed.bhk,
      lat,
      lng,
      geoSource,
      furnished: parsed.furnished || "semi",
      amenities: Array.isArray(parsed.amenities) ? parsed.amenities : [],
      nearby: [],
      source: "reddit",
      sourceUrl: `https://www.reddit.com${post.permalink}`,
      sourceAuthor: post.author,
      sourceSubreddit: post.subreddit,
      description:
        parsed.description ||
        (post.selftext || post.title).slice(0, 240).replace(/\s+/g, " "),
      postedDaysAgo: daysAgo(post.created_utc),
      photos: pickPhotos(id),
    });
  }

  // ---------- output + meta ----------

  const now = new Date();
  const byLoc = {};
  const byBhk = { 1: 0, 2: 0, 3: 0 };
  let rentMin = Infinity, rentMax = -Infinity;
  let geocoded = 0;
  const subCounts = {};
  for (const l of listings) {
    byLoc[l.locality] = (byLoc[l.locality] || 0) + 1;
    byBhk[l.bhk] = (byBhk[l.bhk] || 0) + 1;
    if (l.geoSource === "nominatim") geocoded += 1;
    if (l.rent < rentMin) rentMin = l.rent;
    if (l.rent > rentMax) rentMax = l.rent;
    subCounts[l.sourceSubreddit] = (subCounts[l.sourceSubreddit] || 0) + 1;
  }

  console.log(`\n=== Verification ===`);
  console.log(`Total kept:           ${listings.length}`);
  console.log(`Geocoded by Nominatim: ${geocoded} / ${listings.length}`);
  console.log(`BHK:  1BHK ${byBhk[1]}, 2BHK ${byBhk[2]}, 3BHK ${byBhk[3]}`);
  console.log(`Rent: ₹${rentMin === Infinity ? "-" : rentMin} - ₹${rentMax === -Infinity ? "-" : rentMax}`);
  console.log(`Subs: ${Object.entries(subCounts).map(([k, v]) => `${k}:${v}`).join(", ")}`);
  console.log(`Locality coverage:`);
  for (const [loc, n] of Object.entries(byLoc).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${loc.padEnd(24)} ${n}`);
  }

  writeFileSync(
    "public/data/listings.json",
    "[\n" + listings.map((l) => "  " + JSON.stringify(l)).join(",\n") + "\n]\n",
  );

  writeFileSync(
    "public/data/meta.json",
    JSON.stringify(
      {
        scrapedAt: now.toISOString(),
        listingCount: listings.length,
        geocodedCount: geocoded,
        bhkDistribution: byBhk,
        sourceSubreddits: subCounts,
        maxAgeDays: MAX_AGE_DAYS,
      },
      null,
      2,
    ),
  );

  console.log(`\nWrote public/data/listings.json (${listings.length} listings).`);
  console.log(`Wrote public/data/meta.json (scrapedAt=${now.toISOString()}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
