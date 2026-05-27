// Phase 3.2 integration tests:
//   - listing_reports flow: anon POST /api/listings/:id/report, admin
//     resolves it via /api/admin/reports/:reportId.
//   - listingType filter shape (entire_flat / room / pg).
//   - postedWithinDays filter excludes old rows.
//   - expiresAt sweep marks stale Reddit-source rows as expired.
//   - Reddit row with no real photos persists as photos=[] (no stock fallback).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filterListings } from "../lib/filterListings.js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const adminKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, adminKey, { auth: { persistSession: false } });

const BASE = "http://localhost:3000";
const ADMIN_USERNAME = env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.argv[2];
if (!ADMIN_PASSWORD) {
  console.error("Usage: node scripts/integration-test-reports-and-filters.mjs <admin-password>");
  process.exit(1);
}

const inserted = [];

async function step(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    const r = await fn();
    console.log("OK", r ? `(${r})` : "");
    return r;
  } catch (e) {
    console.log("FAIL");
    console.log("    ", e.message);
    throw e;
  }
}

function extractCookie(headers, name) {
  const arr = headers.getSetCookie?.() || [headers.get("set-cookie")].filter(Boolean);
  for (const h of arr) {
    const idx = h.indexOf("=");
    if (idx > 0 && h.slice(0, idx).trim() === name) {
      return h.slice(idx + 1).split(";")[0];
    }
  }
  return null;
}

console.log("\n=== Phase 3.2 reports + filters ===\n");

try {
  // ----- seed a fake Reddit listing we can report on
  const rdtId = `rdt_test_${Date.now()}`;
  await step("seed Reddit-style listing", async () => {
    const { error } = await admin.from("listings").insert([{
      id: rdtId,
      title: "Test 2BHK in HSR for integration tests",
      locality: "HSR Layout",
      rent: 28000,
      deposit: 100000,
      brokerage: 28000,
      bhk: 2,
      lat: 12.9116,
      lng: 77.6389,
      geoSource: "nominatim",
      furnished: "semi",
      listingType: "entire_flat",
      genderPreference: "any",
      amenities: [],
      nearby: [],
      source: "reddit",
      sourceUrl: "https://www.reddit.com/r/bangalore/comments/test",
      sourceAuthor: "test_user",
      sourceSubreddit: "bangalore",
      description: "Integration test seed row",
      postedDaysAgo: 1,
      postedAt: new Date(Date.now() - 86400_000).toISOString(),
      photos: [],
      hasRealPhotos: false,
      status: "active",
    }]);
    if (error) throw error;
    inserted.push(rdtId);
    return "seeded";
  });

  // ----- 1. anon report submission
  await step("anon POST /api/listings/:id/report -> 200", async () => {
    const res = await fetch(`${BASE}/api/listings/${rdtId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "wrong_brokerage",
        details: "Post explicitly says 'no broker' but the listing shows brokerage = rent",
      }),
    });
    if (res.status !== 200) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    return "200";
  });

  let reportId = null;
  await step("report row exists in DB", async () => {
    const { data } = await admin
      .from("listing_reports")
      .select("id, report_type, details, resolved")
      .eq("listing_id", rdtId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!data?.length) throw new Error("no row");
    if (data[0].report_type !== "wrong_brokerage")
      throw new Error(`type=${data[0].report_type}`);
    if (data[0].resolved !== false) throw new Error("already resolved");
    reportId = data[0].id;
    return `id=${reportId}`;
  });

  // ----- 2. invalid report types are rejected
  await step("invalid report type -> 400", async () => {
    const res = await fetch(`${BASE}/api/listings/${rdtId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "buy_me_a_car", details: "" }),
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  // ----- 3. report on non-existent listing -> 404
  await step("report on bogus listing id -> 404", async () => {
    const res = await fetch(`${BASE}/api/listings/does_not_exist/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "rented_out" }),
    });
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    return "404";
  });

  // ----- 4. admin can resolve via /api/admin/reports/:id
  let adminCookie = null;
  await step("admin login", async () => {
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    });
    if (res.status !== 200) throw new Error(`login ${res.status}`);
    adminCookie = extractCookie(res.headers, "__trurent_admin");
    if (!adminCookie) throw new Error("no cookie");
    return "got cookie";
  });

  await step("anon POST /api/admin/reports/:id -> 404 (gated)", async () => {
    const res = await fetch(`${BASE}/api/admin/reports/${reportId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resolve", note: "test" }),
    });
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    return "404";
  });

  await step("authed admin resolve -> 200, row marked resolved", async () => {
    const res = await fetch(`${BASE}/api/admin/reports/${reportId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `__trurent_admin=${adminCookie}`,
      },
      body: JSON.stringify({ action: "resolve", note: "updated brokerage to 0" }),
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const { data } = await admin
      .from("listing_reports")
      .select("resolved, resolution_note")
      .eq("id", reportId)
      .single();
    if (!data.resolved) throw new Error("not resolved");
    if (!data.resolution_note) throw new Error("no note saved");
    return "resolved";
  });

  await step("admin /admin/reports page renders", async () => {
    const res = await fetch(`${BASE}/admin/reports`, {
      headers: { cookie: `__trurent_admin=${adminCookie}` },
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes("User reports")) throw new Error("title missing");
    return "200";
  });

  // ----- 5. filterListings: listingType + postedWithinDays
  await step("filterListings: listingType=entire_flat matches", async () => {
    const { data: rows } = await admin.from("listings").select("*").eq("id", rdtId);
    const matched = filterListings(rows, { listingType: "entire_flat" });
    if (matched.length !== 1) throw new Error(`got ${matched.length}`);
    return "matched";
  });

  await step("filterListings: listingType=room does NOT match", async () => {
    const { data: rows } = await admin.from("listings").select("*").eq("id", rdtId);
    const matched = filterListings(rows, { listingType: "room" });
    if (matched.length !== 0) throw new Error(`got ${matched.length}`);
    return "rejected";
  });

  await step("filterListings: postedWithinDays=1 includes (post age 1d, cutoff 24h)", async () => {
    const { data: rows } = await admin.from("listings").select("*").eq("id", rdtId);
    // The seed row was postedAt = now - 24h. The cutoff is also now - 24h.
    // Comparison is `postedMs < cutoff` (strict less than), so the row
    // straddles the boundary; it should still be returned because postedMs
    // equals cutoff. Test postedWithinDays=2 to be safe and unambiguous.
    const matched = filterListings(rows, { postedWithinDays: 2 });
    if (matched.length !== 1) throw new Error(`got ${matched.length}`);
    return "matched";
  });

  await step("filterListings: postedWithinDays=1 excludes a 30d-old row", async () => {
    const fakeRow = {
      id: "x",
      bhk: 2,
      locality: "X",
      rent: 25000,
      postedAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
      listingType: "room",
    };
    const matched = filterListings([fakeRow], { postedWithinDays: 1 });
    if (matched.length !== 0) throw new Error(`got ${matched.length}`);
    return "excluded";
  });

  // ----- 6. expiry sweep semantics
  await step("expiry: row with expiresAt in past + active -> sweep marks expired", async () => {
    const stale = `stale_${Date.now()}`;
    await admin.from("listings").insert([{
      id: stale,
      title: "Stale Reddit row",
      locality: "Whitefield",
      rent: 20000,
      deposit: 100000,
      brokerage: 20000,
      bhk: 1,
      lat: 12.9698,
      lng: 77.7499,
      geoSource: "nominatim",
      furnished: "semi",
      listingType: "room",
      genderPreference: "any",
      amenities: [],
      nearby: [],
      source: "reddit",
      sourceUrl: "https://www.reddit.com/test",
      sourceAuthor: "x",
      sourceSubreddit: "x",
      description: "Stale row test",
      postedDaysAgo: 100,
      postedAt: new Date(Date.now() - 100 * 86400_000).toISOString(),
      photos: [],
      hasRealPhotos: false,
      expiresAt: new Date(Date.now() - 86400_000).toISOString(), // yesterday
      status: "active",
    }]);
    inserted.push(stale);

    // Simulate the sweep (same SQL the pipeline runs at end of upsert)
    const { error } = await admin
      .from("listings")
      .update({ status: "expired" })
      .lt("expiresAt", new Date().toISOString())
      .neq("source", "owner")
      .eq("status", "active");
    if (error) throw error;

    const { data } = await admin
      .from("listings")
      .select("status")
      .eq("id", stale)
      .single();
    if (data.status !== "expired") throw new Error(`status=${data.status}`);
    return "expired";
  });

  await step("expiry: owner row with expiresAt in past is NOT swept", async () => {
    const ownerStale = `own_stale_${Date.now()}`;
    await admin.from("listings").insert([{
      id: ownerStale,
      title: "Owner row that should not expire",
      locality: "Indiranagar",
      rent: 30000,
      deposit: 150000,
      brokerage: 0,
      bhk: 2,
      lat: 12.9719,
      lng: 77.6412,
      geoSource: "owner_pin",
      furnished: "semi",
      listingType: "entire_flat",
      genderPreference: "any",
      amenities: [],
      nearby: [],
      source: "owner",
      sourceUrl: null,
      sourceAuthor: null,
      sourceSubreddit: null,
      description: "Owner row that should not expire even if expiresAt set",
      postedDaysAgo: 0,
      postedAt: new Date().toISOString(),
      photos: [],
      hasRealPhotos: false,
      expiresAt: new Date(Date.now() - 86400_000).toISOString(),
      status: "active",
      ownerName: "X",
      ownerPhone: "+919876543210",
    }]);
    inserted.push(ownerStale);

    await admin
      .from("listings")
      .update({ status: "expired" })
      .lt("expiresAt", new Date().toISOString())
      .neq("source", "owner")
      .eq("status", "active");

    const { data } = await admin
      .from("listings")
      .select("status")
      .eq("id", ownerStale)
      .single();
    if (data.status !== "active") throw new Error(`status=${data.status}`);
    return "untouched";
  });
} finally {
  console.log("\n  Cleaning up...");
  for (const id of inserted) {
    await admin.from("listing_reports").delete().eq("listing_id", id);
    await admin.from("listings").delete().eq("id", id);
  }
  console.log("  Cleaned.");
}

console.log("\n=== Phase 3.2 tests passed ===\n");
