// Source-agnostic ingestion pipeline.
//
// A "source" is a module exporting:
//   id           string  unique source identifier
//   fetchPosts() async () => RawPost[]
//   preFilter(post) returns boolean (cheap regex filter before LLM cost)
//   rawText(post)   returns string (what we feed to Haiku)
//   normalize(post, parsed) returns a partial Listing row
//                            (must include locationQuery + _seedKey
//                            for the geocoder)
//
// The pipeline runs fetch → preFilter → Haiku → validate → geocode → dedupe
// → upsert. Each stage is logged. Stats are returned so the orchestrator
// can record a scrape_meta row.

import { sleep } from "./util.mjs";
import { extractListing, validateParsed } from "./extract.mjs";
import { geocodeListing } from "./geocode.mjs";
import { findSoftDuplicate, preferred } from "./dedupe.mjs";
import { upsertListings, readActiveListings, supabase } from "./supabase.mjs";
import { inBangalore } from "./locality.mjs";

// How long a scraped (non-owner) listing stays "active" without being touched
// by a fresh scrape. Reddit posts age out of the 120-day fetch window faster
// than this, so this gives renters one expiry sweep instead of two.
const SCRAPED_LISTING_TTL_DAYS = 90;

export async function runSource(source) {
  const stats = {
    source: source.id,
    fetched: 0,
    preFiltered: 0,
    extracted: 0,
    kept: 0,
    geocodedByNominatim: 0,
    duplicates: 0,
    rejectedByValidation: 0,
    rejectedByGeo: 0,
  };

  console.log(`\n========================================`);
  console.log(`[1/4] fetching from source: ${source.id}`);
  console.log(`========================================`);
  const posts = await source.fetchPosts();
  stats.fetched = posts.length;
  console.log(`     ${posts.length} posts pulled\n`);

  console.log(`[2/4] pre-filtering`);
  const candidates = posts.filter(source.preFilter);
  stats.preFiltered = candidates.length;
  console.log(`     ${candidates.length} / ${posts.length} pass\n`);

  console.log(`[3/4] LLM extraction (Claude Haiku 4.5)`);
  const extracted = []; // Array<{ post, parsed }>
  let i = 0;
  for (const post of candidates) {
    i += 1;
    const previewText = (post.title || post.body || "").slice(0, 56);
    process.stdout.write(
      `  [${i}/${candidates.length}] ${previewText.padEnd(58)} `,
    );
    let parsed;
    try {
      parsed = await extractListing(source.rawText(post));
    } catch (e) {
      console.log(`ERR ${String(e.message).slice(0, 60)}`);
      stats.rejectedByValidation += 1;
      await sleep(1500);
      continue;
    }
    const valid = validateParsed(parsed);
    if (!valid) {
      console.log(`skip (${(parsed?.reason || "invalid").slice(0, 70)})`);
      stats.rejectedByValidation += 1;
      await sleep(100);
      continue;
    }
    stats.extracted += 1;
    console.log(
      `KEEP ${valid.locality} ${valid.bhk}BHK ₹${valid.rent} [${valid.listingType}]`,
    );
    extracted.push({ post, parsed: valid });
    await sleep(100);
  }

  console.log(`\n[4/4] geocoding + dedupe + upsert`);
  // Pull existing active listings ONCE (cheap query, used for soft-dedup)
  const existing = await readActiveListings();
  console.log(`     ${existing.length} existing listings for dedup check`);

  const listings = [];
  for (let j = 0; j < extracted.length; j++) {
    const { post, parsed } = extracted[j];
    const partial = source.normalize(post, parsed);
    const seedKey = partial._seedKey || partial.id;
    const geo = await geocodeListing(
      { location_query: partial.locationQuery, locality: partial.locality },
      seedKey,
    );
    if (!inBangalore(geo.lat, geo.lng)) {
      stats.rejectedByGeo += 1;
      continue;
    }
    if (geo.geoSource === "nominatim") stats.geocodedByNominatim += 1;

    const listing = {
      ...partial,
      lat: geo.lat,
      lng: geo.lng,
      geoSource: geo.geoSource,
      // Stamp an explicit expiry so the homepage can hide stale rows even if
      // a future scrape run doesn't see this post again (e.g. Reddit deleted
      // it, or it aged out of our 120-day fetch window).
      expiresAt: new Date(
        Date.now() + SCRAPED_LISTING_TTL_DAYS * 86400 * 1000,
      ).toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    delete listing.locationQuery;
    delete listing._seedKey;

    // Cross-source dedup: skip if a higher-priority source already has this
    const dup = findSoftDuplicate(listing, existing);
    if (dup && preferred(dup, listing).id === dup.id) {
      stats.duplicates += 1;
      continue;
    }
    listings.push(listing);
    existing.push(listing); // dedupe within this batch too
  }

  if (listings.length > 0) {
    const { error } = await upsertListings(listings);
    if (error) {
      console.error("upsert failed:", error.message);
    } else {
      stats.kept = listings.length;
      console.log(`     upserted ${listings.length} listings`);
    }
  }

  // Sweep: any non-owner row whose expiresAt is now in the past gets marked
  // status='expired'. Renters won't see it on the map. Owner submissions are
  // skipped — they're managed manually by the submitter / admin.
  const { data: swept, error: sweepErr } = await supabase
    .from("listings")
    .update({ status: "expired" })
    .lt("expiresAt", new Date().toISOString())
    .neq("source", "owner")
    .eq("status", "active")
    .select("id");
  if (sweepErr) {
    console.error("expiry sweep failed:", sweepErr.message);
  } else if (swept && swept.length > 0) {
    console.log(`     expired ${swept.length} stale listings`);
    stats.expiredStale = swept.length;
  } else {
    stats.expiredStale = 0;
  }

  console.log(`\n--- ${source.id} stats ---`);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  return { stats, listings };
}
