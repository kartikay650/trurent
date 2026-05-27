// Orchestrator. Runs all enabled sources sequentially.
// Sources can be enabled/disabled via the SOURCES env var:
//   SOURCES=reddit              run only Reddit
//   SOURCES=reddit,olx          run Reddit + OLX
//   (default: all available sources in this build)
//
// Records one scrape_meta row at the end with aggregated stats.

import "./shared/env.mjs"; // side-effect: load .env.local
import { runSource } from "./shared/pipeline.mjs";
import { recordScrapeMeta, supabase } from "./shared/supabase.mjs";
import * as reddit from "./sources/reddit.mjs";
import * as facebook from "./sources/facebook.mjs";

// Source registry. Facebook is wired in but skips itself unless env vars
// are set (see sources/facebook.mjs).
const ALL_SOURCES = {
  reddit,
  facebook,
};

async function main() {
  const requested = (process.env.SOURCES || Object.keys(ALL_SOURCES).join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const sources = requested
    .map((name) => ALL_SOURCES[name])
    .filter(Boolean);

  if (sources.length === 0) {
    console.error(`No valid sources to run. Available: ${Object.keys(ALL_SOURCES).join(", ")}`);
    process.exit(1);
  }

  console.log(`Running sources: ${sources.map((s) => s.id).join(", ")}\n`);
  const aggregate = {
    fetched: 0,
    preFiltered: 0,
    extracted: 0,
    kept: 0,
    geocodedByNominatim: 0,
    duplicates: 0,
    rejectedByValidation: 0,
    rejectedByGeo: 0,
    bySource: {},
  };

  for (const source of sources) {
    try {
      const { stats } = await runSource(source);
      aggregate.bySource[source.id] = stats;
      for (const k of [
        "fetched",
        "preFiltered",
        "extracted",
        "kept",
        "geocodedByNominatim",
        "duplicates",
        "rejectedByValidation",
        "rejectedByGeo",
      ]) {
        aggregate[k] += stats[k] || 0;
      }
    } catch (e) {
      console.error(`Source ${source.id} failed:`, e.message);
      aggregate.bySource[source.id] = { error: e.message };
    }
  }

  // Aggregate stats from the DB for the meta row
  const { count: totalActive } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true });
  const { data: typeDist } = await supabase
    .from("listings")
    .select("listingType");
  const { data: bhkDist } = await supabase
    .from("listings")
    .select("bhk");

  const typeBreakdown = { entire_flat: 0, room: 0, pg: 0 };
  for (const r of typeDist || [])
    if (r.listingType in typeBreakdown) typeBreakdown[r.listingType] += 1;
  const bhkBreakdown = { 1: 0, 2: 0, 3: 0 };
  for (const r of bhkDist || []) if (r.bhk in bhkBreakdown) bhkBreakdown[r.bhk] += 1;

  console.log(`\n========================================`);
  console.log(`Aggregate run summary`);
  console.log(`========================================`);
  for (const [k, v] of Object.entries(aggregate)) {
    if (k !== "bySource") console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log(`\nDB now contains ${totalActive} total listings`);
  console.log(`  Types: ${JSON.stringify(typeBreakdown)}`);
  console.log(`  BHKs:  ${JSON.stringify(bhkBreakdown)}`);

  const { error: metaErr } = await recordScrapeMeta({
    scrapedAt: new Date().toISOString(),
    listingCount: totalActive,
    geocodedCount: aggregate.geocodedByNominatim,
    realPhotoCount: 0, // not tracked here, recomputed by app
    zeroBrokerageCount: 0,
    bhkDistribution: bhkBreakdown,
    typeDistribution: typeBreakdown,
    genderDistribution: {},
    sourceSubreddits: aggregate.bySource,
    maxAgeDays: parseInt(process.env.MAX_AGE_DAYS || "120", 10),
  });

  if (metaErr) {
    console.error("Failed to record scrape_meta:", metaErr.message);
  } else {
    console.log(`\nRecorded scrape_meta row.`);
  }

  // Backup: write a JSON snapshot of all listings (committed to git for
  // version history + disaster recovery if Supabase becomes unreachable).
  try {
    const { writeFileSync } = await import("node:fs");
    const { data } = await supabase
      .from("listings")
      .select("*")
      .order("postedAt", { ascending: false });
    if (data) {
      writeFileSync(
        "public/data/listings.json",
        "[\n" + data.map((l) => "  " + JSON.stringify(l)).join(",\n") + "\n]\n",
      );
      console.log(`Wrote backup snapshot to public/data/listings.json (${data.length} rows).`);
    }
  } catch (e) {
    console.error("Snapshot write failed:", e.message);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
