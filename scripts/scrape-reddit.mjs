// Scrape real Bangalore rental posts from Reddit and turn them into listings.
//
// Pipeline:
//   1. Wide PullPush fetch across many subreddit/query pairs + all-Reddit search.
//   2. Local pre-filter: drop posts that obviously aren't listings, before LLM cost.
//   3. Claude Haiku 4.5 extraction: { is_listing, locality, rent, bhk, ... }.
//   4. Nominatim geocoding: turn "Koramangala 5th Block near Sony Signal" into
//      real lat/lng. Fall back to locality centroid + jitter if Nominatim misses.
//   5. Post-validation: sanity-check rent range, locality, coords-in-Bangalore.
//   6. Write public/data/listings.json.
//
// Run: node scripts/scrape-reddit.mjs
// Resume: cached raw posts at scripts/.cache/reddit-raw.json so re-runs skip the fetch.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in environment.");
  console.error("Try: export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env.local | cut -d= -f2)");
  process.exit(1);
}

const USER_AGENT = "TruRentBangaloreFlatBot/1.0 (https://github.com/kartikay650/trurent; project demo)";

// ---------- search targets ----------
// Wide net. Many will overlap; dedupe by post id.

const TARGETS = [
  // r/bangalore — main local sub
  { subreddit: "bangalore", q: "rent BHK", size: 250 },
  { subreddit: "bangalore", q: "looking for tenant", size: 200 },
  { subreddit: "bangalore", q: "available for rent", size: 200 },
  { subreddit: "bangalore", q: "flat for rent", size: 200 },
  { subreddit: "bangalore", q: "house for rent", size: 200 },
  { subreddit: "bangalore", q: "1BHK 2BHK 3BHK rent", size: 200 },
  { subreddit: "bangalore", q: "rent koramangala", size: 100 },
  { subreddit: "bangalore", q: "rent indiranagar", size: 100 },
  { subreddit: "bangalore", q: "rent HSR", size: 100 },
  { subreddit: "bangalore", q: "rent whitefield", size: 100 },
  { subreddit: "bangalore", q: "rent bellandur", size: 100 },
  { subreddit: "bangalore", q: "rent marathahalli", size: 100 },
  { subreddit: "bangalore", q: "rent sarjapur", size: 100 },
  { subreddit: "bangalore", q: "rent jayanagar", size: 100 },
  { subreddit: "bangalore", q: "rent hebbal", size: 100 },
  { subreddit: "bangalore", q: "deposit no brokerage", size: 100 },

  // r/IndianRealEstate — wider, sometimes has Bangalore listings
  { subreddit: "IndianRealEstate", q: "bangalore rent BHK", size: 200 },
  { subreddit: "IndianRealEstate", q: "bangalore flat available", size: 100 },

  // smaller niche subs
  { subreddit: "indianapartments", q: "bangalore rent", size: 100 },
  { subreddit: "BangaloreRealEstate", q: "rent", size: 200 },
  { subreddit: "bengaluru", q: "rent BHK", size: 200 },
  { subreddit: "BLR", q: "rent", size: 50 },

  // global search (no subreddit restriction), to catch posts in obscure subs
  { subreddit: null, q: "bangalore 2BHK rent", size: 200 },
  { subreddit: null, q: "bangalore 1BHK rent", size: 200 },
  { subreddit: null, q: "bangalore 3BHK rent", size: 200 },
  { subreddit: null, q: "koramangala available rent", size: 100 },
  { subreddit: null, q: "indiranagar available rent", size: 100 },
  { subreddit: null, q: "HSR layout available rent", size: 100 },
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

// Bangalore metro bbox: roughly 12.75–13.25 lat, 77.40–77.85 lng
const IN_BANGALORE = (lat, lng) =>
  lat >= 12.75 && lat <= 13.3 && lng >= 77.4 && lng <= 77.85;

// ---------- utilities ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededJitter(seed) {
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
  const seed = hashOf(seedKey);
  const picks = [];
  for (let k = 0; picks.length < 3 && k < UNSPLASH_PHOTOS.length * 2; k++) {
    const id = UNSPLASH_PHOTOS[(seed + k * 7) % UNSPLASH_PHOTOS.length];
    if (!picks.includes(id)) picks.push(id);
  }
  return picks.map(
    (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`,
  );
}

function daysAgo(unixSeconds) {
  const now = Date.now() / 1000;
  return Math.max(1, Math.floor((now - unixSeconds) / 86400));
}

// ---------- stage 1: PullPush fetch ----------

async function fetchPosts() {
  console.log(`\n[1/4] Fetching from ${TARGETS.length} PullPush queries`);
  console.log(`      User-Agent: ${USER_AGENT}\n`);
  const seen = new Map();
  for (const t of TARGETS) {
    const url = new URL("https://api.pullpush.io/reddit/search/submission/");
    if (t.subreddit) url.searchParams.set("subreddit", t.subreddit);
    url.searchParams.set("q", t.q);
    url.searchParams.set("size", String(t.size));
    url.searchParams.set("sort", "desc");
    url.searchParams.set("sort_type", "created_utc");

    const label = `${t.subreddit ? "r/" + t.subreddit : "(all)"}  "${t.q}"`;
    process.stdout.write(`  ${label.padEnd(60)} `);
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      const json = await res.json();
      const posts = Array.isArray(json?.data) ? json.data : [];
      let added = 0;
      for (const p of posts) {
        if (!p?.id) continue;
        if (seen.has(p.id)) continue;
        seen.set(p.id, p);
        added += 1;
      }
      console.log(`${posts.length} got, ${added} new`);
    } catch (e) {
      console.log(`FAILED ${e.message}`);
    }
    await sleep(800);
  }
  return [...seen.values()];
}

// ---------- stage 2: local pre-filter ----------

function looksLikeListing(post) {
  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const text = `${title}\n${body}`;
  if (text.length < 60) return false;
  if (text.length > 6000) return false;

  // Must mention BHK / studio / flat / PG
  if (!/\b(bhk|bedroom|studio|flat|apartment|pg|room)\b/.test(text)) return false;

  // Must mention bangalore or a known locality
  const mentionsBlr =
    /\b(bangalore|bengaluru|blr)\b/.test(text) ||
    Object.keys(LOCALITY_GEO).some((l) => text.includes(l.toLowerCase()));
  if (!mentionsBlr) return false;

  // Must have something that looks like a price
  if (!/(₹|\brs\.?\b|\brupees\b|\b\d{1,2}k\b|\blakh\b|\brent\b|\bdeposit\b)/.test(text))
    return false;

  // Skip obvious wanted/discussion patterns in the TITLE
  // (we want OFFERS — someone has a flat available — not WANTEDs)
  const t = post.title || "";
  if (/^\s*\[(advice|help|discussion|rant|question|update)\]/i.test(t)) return false;
  if (/(scam|warning|fraud|complaint|nightmare|cheated)/i.test(t)) return false;
  if (/^(is it|how to|why is|why are|why do|anyone know|anyone else|does anyone)/i.test(t))
    return false;

  return true;
}

// ---------- stage 3: LLM extraction ----------

const EXTRACT_PROMPT = `You parse Reddit posts and decide if each is a Bangalore rental LISTING (someone OFFERING a flat to rent, with a price). If yes, extract structured data. If no, say why.

Strict JSON only. No prose. No markdown.

Either:
{ "is_listing": false, "reason": "short reason" }

Or:
{
  "is_listing": true,
  "title": "short clean title, e.g. '2BHK in Koramangala 5th Block'",
  "locality": "ONE Bangalore neighbourhood, EXACT spelling from this list (or 'Unknown'):
Koramangala, Indiranagar, HSR Layout, Whitefield, Bellandur, Sarjapur Road, Marathahalli, BTM Layout, Jayanagar, JP Nagar, Banashankari, Bannerghatta Road, Hebbal, Yelahanka, Electronic City, Bommanahalli, Singasandra, Hennur, Frazer Town, Shivajinagar, Cunningham Road, Richmond Town, Ulsoor, Domlur, Malleshwaram, Rajajinagar, Sadashivanagar, Basaveshwara Nagar, Vijayanagar, Mysore Road, Nagarbhavi, Jalahalli, Peenya, Nayandahalli, Kengeri, RT Nagar, Old Airport Road, CV Raman Nagar, Kasturi Nagar, Pai Layout, Kalyan Nagar, Brookefield, Hoodi, Kadugodi, Hoskote, Mahadevapura, Devanahalli",
  "location_query": "the most SPECIFIC address-like string from the post, suitable for geocoding. e.g. 'Koramangala 5th Block, near Sony Signal' or 'HSR Layout Sector 2, 27th Main'. Just the locality alone is fine if no specifics. NO city name needed (we'll append Bangalore automatically).",
  "rent": integer (INR per month, REQUIRED, must be 5000-200000),
  "deposit": integer (INR, omit if not stated),
  "brokerage": integer (INR, 0 if zero/no broker/direct owner, omit if not stated),
  "bhk": integer (1, 2, or 3, REQUIRED for non-PG listings),
  "furnished": "fully" | "semi" | "unfurnished" (omit if unclear),
  "amenities": array, only from this exact list: gym, pool, parking, power_backup, garden, security, club. Omit field if none mentioned.,
  "description": "1-2 sentence summary of what's available, cleaned up from the post"
}

Mark is_listing: false when:
- The post is asking for help, complaining about a scam, sharing experience, discussing market trends, or a "looking for a flat" (wanted) ad.
- The post is about buying/purchasing/investing, not renting.
- Rent isn't stated or is clearly outside 5000-200000 INR/month.
- BHK can't be determined for what is clearly a flat (PG/room with shared occupants is okay to keep if rent is per-person and the locality is clear, but mark as 1).
- The flat isn't in Bangalore.

Be strict. Only mark is_listing: true when you're confident this is a real offer with a price.`;

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
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      const text = json?.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(1000);
    }
  }
}

// ---------- stage 4: Nominatim geocoding ----------
// Free, no API key, 1 req/sec cap per their usage policy.

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

async function geocode(query) {
  const fullQuery = `${query}, Bangalore, Karnataka, India`;
  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(fullQuery)}&format=json&limit=1&countrycodes=in`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = parseFloat(arr[0].lat);
    const lng = parseFloat(arr[0].lon);
    if (!IN_BANGALORE(lat, lng)) return null;
    return { lat, lng, display: arr[0].display_name };
  } catch {
    return null;
  }
}

// ---------- main ----------

async function main() {
  mkdirSync("scripts/.cache", { recursive: true });
  const rawCachePath = "scripts/.cache/reddit-raw.json";

  let posts;
  if (existsSync(rawCachePath)) {
    posts = JSON.parse(readFileSync(rawCachePath, "utf8"));
    console.log(`[1/4] Loaded ${posts.length} posts from cache: ${rawCachePath}`);
  } else {
    posts = await fetchPosts();
    writeFileSync(rawCachePath, JSON.stringify(posts, null, 2));
    console.log(`\n[1/4] Cached ${posts.length} raw posts to ${rawCachePath}`);
  }

  console.log(`\n[2/4] Local pre-filter`);
  const candidates = posts.filter(looksLikeListing);
  console.log(`      ${candidates.length} / ${posts.length} candidates survive`);

  console.log(`\n[3/4] LLM extraction (Claude Haiku 4.5)`);
  const extracted = []; // [{post, parsed}]
  let i = 0;
  for (const post of candidates) {
    i += 1;
    const titlePreview = (post.title || "").slice(0, 56);
    process.stdout.write(`  [${i}/${candidates.length}] ${titlePreview.padEnd(58)} `);
    let parsed;
    try {
      parsed = await callHaiku(post);
    } catch (e) {
      console.log(`HAIKU ERR ${e.message.slice(0, 60)}`);
      await sleep(1500);
      continue;
    }

    if (!parsed?.is_listing) {
      console.log(`skip (${parsed?.reason || "not listing"})`);
      await sleep(120);
      continue;
    }
    if (!parsed.rent || parsed.rent < 5000 || parsed.rent > 200000) {
      console.log(`skip (bad rent ${parsed.rent})`);
      await sleep(120);
      continue;
    }
    if (![1, 2, 3].includes(parsed.bhk)) {
      console.log(`skip (bad bhk ${parsed.bhk})`);
      await sleep(120);
      continue;
    }
    if (!LOCALITY_GEO[parsed.locality]) {
      console.log(`skip (unknown locality "${parsed.locality}")`);
      await sleep(120);
      continue;
    }
    console.log(`KEEP ${parsed.locality} ${parsed.bhk}BHK ₹${parsed.rent}`);
    extracted.push({ post, parsed });
    await sleep(120);
  }

  console.log(`\n[4/4] Geocoding via Nominatim (rate-limited 1 req/sec)`);
  const listings = [];
  for (let j = 0; j < extracted.length; j++) {
    const { post, parsed } = extracted[j];
    process.stdout.write(`  [${j + 1}/${extracted.length}] ${parsed.location_query?.slice(0, 60) || parsed.locality} ... `);
    const geo = await geocode(parsed.location_query || parsed.locality);
    await sleep(1100); // Nominatim usage policy: max 1/sec

    let lat, lng, geoSource;
    if (geo) {
      lat = +geo.lat.toFixed(5);
      lng = +geo.lng.toFixed(5);
      geoSource = "nominatim";
      console.log(`pinned (${lat}, ${lng})`);
    } else {
      const [baseLat, baseLng] = LOCALITY_GEO[parsed.locality];
      const id = `rdt_${post.id}`;
      lat = +(baseLat + seededJitter(id)).toFixed(5);
      lng = +(baseLng + seededJitter(id + "x")).toFixed(5);
      geoSource = "locality_centroid";
      console.log(`centroid fallback (${lat}, ${lng})`);
    }

    if (!IN_BANGALORE(lat, lng)) {
      console.log(`  -> rejected: coords outside Bangalore`);
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
        (post.selftext || post.title).slice(0, 220).replace(/\s+/g, " "),
      postedDaysAgo: daysAgo(post.created_utc),
      photos: pickPhotos(id),
    });
  }

  // ---------- final verification ----------
  console.log(`\n=== Verification ===`);
  console.log(`Total kept: ${listings.length}`);
  const byLoc = {};
  const byBhk = { 1: 0, 2: 0, 3: 0 };
  let geocoded = 0;
  let rentMin = Infinity, rentMax = -Infinity;
  for (const l of listings) {
    byLoc[l.locality] = (byLoc[l.locality] || 0) + 1;
    byBhk[l.bhk] = (byBhk[l.bhk] || 0) + 1;
    if (l.geoSource === "nominatim") geocoded += 1;
    if (l.rent < rentMin) rentMin = l.rent;
    if (l.rent > rentMax) rentMax = l.rent;
  }
  console.log(`Geocoded by Nominatim:  ${geocoded} / ${listings.length}`);
  console.log(`BHK distribution: 1BHK ${byBhk[1]}, 2BHK ${byBhk[2]}, 3BHK ${byBhk[3]}`);
  console.log(`Rent range: ₹${rentMin} – ₹${rentMax}`);
  console.log(`\nLocality coverage:`);
  for (const [loc, n] of Object.entries(byLoc).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${loc.padEnd(24)} ${n}`);
  }

  const outPath = "public/data/listings.json";
  writeFileSync(
    outPath,
    "[\n" + listings.map((l) => "  " + JSON.stringify(l)).join(",\n") + "\n]\n",
  );
  console.log(`\nWrote ${outPath} (${listings.length} listings).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
