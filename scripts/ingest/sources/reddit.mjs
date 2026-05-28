// Reddit source — RSS-based.
//
// Reddit closed the public .json endpoints (every variant returns 403 from
// any IP / UA we've tested) and their OAuth API now requires a paid tier we
// don't have. The one path Reddit hasn't shut down is the per-subreddit RSS
// (Atom XML) feed at /r/<sub>/new.rss + the per-subreddit search.rss.
//
// Each feed gives 25 entries. With ~13 narrow rental-focused feeds that's
// ~325 candidates per run — more than enough yield for a daily refresh.
// We don't lose much: the JSON path used to paginate to 30 pages, but the
// signal density past page 1 was negligible for these niche subs.
//
// What RSS gives us:
//   - id          (parsed from <id>t3_xyz</id>)
//   - title
//   - body text   (HTML inside <content>, decoded + tag-stripped here)
//   - author
//   - subreddit
//   - permalink + canonical URL
//   - published timestamp (ISO -> unix)
//   - preview image URLs (we grep for preview.redd.it in the body HTML)
//
// What we lose vs JSON: gallery metadata, removed/banned flags, comment
// counts. None of those matter for our use case.

import { USER_AGENT } from "../shared/env.mjs";
import { sleep, daysAgoFromUnix } from "../shared/util.mjs";

const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS || "120", 10);

// Bangalore-focused feeds only. Order is roughly highest-signal first.
const FEEDS = [
  // Specialty subs: pull the new tab directly
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

function buildFeedUrl(feed) {
  if (feed.type === "search") {
    const u = new URL(`https://www.reddit.com/r/${feed.subreddit}/search.rss`);
    u.searchParams.set("q", feed.q);
    u.searchParams.set("restrict_sr", "1");
    u.searchParams.set("sort", feed.sort);
    return u.toString();
  }
  const u = new URL(
    `https://www.reddit.com/r/${feed.subreddit}/${feed.sort}.rss`,
  );
  if (feed.t) u.searchParams.set("t", feed.t);
  return u.toString();
}

// --------- Atom XML parsing (no deps) -----------------------------------

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#32;/g, " ")
    .replace(/&#x([\da-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    // &amp; MUST run last so we don't double-decode entities of the form &amp;lt;
    .replace(/&amp;/g, "&");
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Reddit's RSS appends a "submitted by /u/X [link] [comments]" trailer.
// Strip it so Claude sees just the body the user actually wrote.
function stripRedditBoilerplate(text) {
  return text
    .replace(/\s*submitted by\s*\/u\/\S+\s*\[link\]\s*\[comments\]\s*$/i, "")
    .trim();
}

function firstMatch(re, str) {
  const m = re.exec(str);
  return m ? m[1] : null;
}

function parseAtom(xml) {
  const out = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];

    const idRaw = firstMatch(/<id>([^<]+)<\/id>/, block) || "";
    const id = idRaw.replace(/^t3_/, "");
    if (!id) continue;

    const title = decodeEntities(firstMatch(/<title>([\s\S]*?)<\/title>/, block) || "");
    const linkHref = firstMatch(/<link[^>]*href="([^"]+)"/, block) || null;
    const permalink = linkHref ? new URL(linkHref).pathname : null;
    const author =
      firstMatch(/<author>[\s\S]*?<name>\/u\/([^<]+)<\/name>/, block) ||
      firstMatch(/<author>[\s\S]*?<name>([^<]+)<\/name>/, block) ||
      null;
    const subreddit = firstMatch(/<category[^>]*term="([^"]+)"/, block);
    const publishedIso =
      firstMatch(/<published>([^<]+)<\/published>/, block) ||
      firstMatch(/<updated>([^<]+)<\/updated>/, block);
    const created_utc = publishedIso
      ? Math.floor(new Date(publishedIso).getTime() / 1000)
      : 0;

    const contentRaw = firstMatch(/<content[^>]*>([\s\S]*?)<\/content>/, block) || "";
    const contentHtml = decodeEntities(contentRaw);
    // Capture preview.redd.it image URLs (decoded HTML still has them).
    const imageUrls = [
      ...contentHtml.matchAll(/https:\/\/preview\.redd\.it\/[^\s"'<>)]+/g),
    ].map((m) => m[0]);

    const selftext = stripRedditBoilerplate(htmlToText(contentHtml));

    out.push({
      id,
      title,
      selftext,
      author,
      subreddit,
      permalink,
      url: linkHref,
      created_utc,
      _rssImageUrls: imageUrls,
    });
  }
  return out;
}

// --------- Feed fetching -------------------------------------------------

async function fetchFeed(feed) {
  const url = buildFeedUrl(feed);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/xml, text/xml, */*",
      },
    });
  } catch (e) {
    return { posts: [], stopReason: `fetch_err:${e.message}` };
  }
  if (res.status === 429) {
    return { posts: [], stopReason: "rate_limited_429" };
  }
  if (!res.ok) {
    return { posts: [], stopReason: `http_${res.status}` };
  }
  const xml = await res.text();
  const posts = parseAtom(xml);
  return { posts, stopReason: posts.length > 0 ? "ok" : "empty_feed" };
}

// --------- Exports (consumed by the source-agnostic pipeline) -----------

export const id = "reddit";

export async function fetchPosts() {
  console.log(
    `[reddit] Pulling ${FEEDS.length} feeds via RSS, window=${MAX_AGE_DAYS}d`,
  );
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86400;
  const seen = new Map();

  for (const feed of FEEDS) {
    const label =
      feed.type === "search"
        ? `r/${feed.subreddit} search "${feed.q}"`
        : `r/${feed.subreddit} ${feed.sort}${feed.t ? "/" + feed.t : ""}`;
    process.stdout.write(`  ${label.padEnd(50)} `);
    const { posts, stopReason } = await fetchFeed(feed);
    let added = 0;
    for (const p of posts) {
      if (p.created_utc && p.created_utc < cutoff) continue;
      if (seen.has(p.id)) continue;
      seen.set(p.id, p);
      added += 1;
    }
    console.log(
      `${posts.length.toString().padStart(4)} fetched, ${added.toString().padStart(3)} new in window  (stop=${stopReason})`,
    );
    // Be nice to Reddit — 1.5s between feeds.
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

// Pull preview-quality image URLs we captured from the RSS content.
export function extractPhotos(post) {
  if (!Array.isArray(post._rssImageUrls) || post._rssImageUrls.length === 0) {
    return null;
  }
  const seen = new Set();
  const out = [];
  for (const u of post._rssImageUrls) {
    const clean = u.replace(/&amp;/g, "&");
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 5) break;
  }
  return out.length > 0 ? out : null;
}

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
    sourceUrl: post.url || `https://www.reddit.com${post.permalink || ""}`,
    sourceAuthor: post.author,
    sourceSubreddit: post.subreddit,
    description:
      parsed.description ||
      (post.selftext || post.title).slice(0, 240).replace(/\s+/g, " "),
    postedDaysAgo: post.created_utc ? daysAgoFromUnix(post.created_utc) : 1,
    postedAt: post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : new Date().toISOString(),
    photos: redditPhotos || [],
    hasRealPhotos: !!redditPhotos,
    locationQuery: parsed.location_query || parsed.locality,
    _seedKey: id,
  };
}
