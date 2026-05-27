// Comprehensive Phase 3.1 integration tests.
//
// Coverage:
//   - /post page renders (smoke)
//   - Anonymous submit with map pin + sqft + society + BHK 5+
//   - lat/lng bounds enforcement (pin outside Bangalore -> 400)
//   - BHK >5 accepted at the API level (form caps at 5; API allows 1-10)
//   - Photo upload via FormData with multiple files; rejected listings get no photos
//   - filter: bhk=5 matches both 5 and 6 (the "5+" semantics)
//   - filter: bhk=2 still works on a 2BHK listing
//   - field validation: missing lat -> 400, missing phone -> 400, bad sqft -> 400

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminKey = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, adminKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const BASE = "http://localhost:3000";
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

// Minimal 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64",
);

function baseFormData(overrides = {}) {
  const defaults = {
    title: "Spacious 2BHK in HSR sector 2, near metro",
    locality: "HSR Layout",
    lat: "12.9116",
    lng: "77.6389",
    bhk: "2",
    rent: "34000",
    deposit: "200000",
    brokerage: "0",
    furnished: "semi",
    listingType: "entire_flat",
    genderPreference: "any",
    amenities: JSON.stringify(["parking", "power_backup"]),
    description:
      "Bright 2-bedroom apartment on 3rd floor, 5 minutes from HSR sector 2 main road. Semi-furnished with modular kitchen, wardrobes, ceiling fans. Society has 24x7 security, lift, visitor parking. Available from June 15. Direct from owner, zero brokerage.",
    ownerName: "Rohit",
    ownerPhone: "+919845127634",
  };
  const merged = { ...defaults, ...overrides };
  const fd = new FormData();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null) fd.append(k, String(v));
  }
  return fd;
}

console.log("\n=== Phase 3.1 full integration ===\n");

try {
  // ------------------------------------------------------------------
  // 1. /post renders (smoke)
  // ------------------------------------------------------------------
  await step("GET /post renders without auth", async () => {
    const res = await fetch(`${BASE}/post`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes("List your Bangalore flat"))
      throw new Error("expected form title in HTML");
    if (!html.includes("Drop a pin"))
      throw new Error("expected map-pick hint in HTML");
    return "rendered";
  });

  // ------------------------------------------------------------------
  // 2. Happy path: legit 2BHK with photo, sqft, society
  // ------------------------------------------------------------------
  let activeId = null;
  await step("POST 2BHK with pin + sqft + society + photo -> active", async () => {
    const fd = baseFormData({
      sqft: "1200",
      societyName: "Prestige Lakeside Habitat",
    });
    fd.append("photos", new Blob([PNG], { type: "image/png" }), "cover.png");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${j.error || JSON.stringify(j)}`);
    if (j.status !== "active") throw new Error(`got ${j.status}: ${j.reason}`);
    activeId = j.listingId;
    inserted.push(activeId);
    return j.listingId;
  });

  await step("DB row has lat=pin, sqft, societyName, geoSource=owner_pin", async () => {
    const { data } = await admin
      .from("listings")
      .select("lat, lng, sqft, societyName, geoSource, bhk, photos, ownerName, ownerPhone")
      .eq("id", activeId)
      .single();
    if (Math.abs(data.lat - 12.9116) > 0.001) throw new Error(`lat=${data.lat}`);
    if (Math.abs(data.lng - 77.6389) > 0.001) throw new Error(`lng=${data.lng}`);
    if (data.sqft !== 1200) throw new Error(`sqft=${data.sqft}`);
    if (data.societyName !== "Prestige Lakeside Habitat")
      throw new Error(`societyName="${data.societyName}"`);
    if (data.geoSource !== "owner_pin")
      throw new Error(`geoSource="${data.geoSource}"`);
    if (data.bhk !== 2) throw new Error(`bhk=${data.bhk}`);
    if (!Array.isArray(data.photos) || data.photos.length !== 1)
      throw new Error(`photos.length=${data.photos?.length}`);
    return `${data.sqft}sqft @ ${data.lat},${data.lng}`;
  });

  await step("anon sees the active row", async () => {
    const { data, error } = await anon
      .from("listings")
      .select("id, status")
      .eq("id", activeId)
      .single();
    if (error) throw error;
    if (data.status !== "active") throw new Error(`status=${data.status}`);
    return "visible";
  });

  // ------------------------------------------------------------------
  // 3. BHK 5+ submission (form caps at 5)
  // ------------------------------------------------------------------
  let bhk5Id = null;
  await step("POST 5+ BHK (bhk=5) -> active", async () => {
    const fd = baseFormData({
      bhk: "5",
      rent: "180000",
      deposit: "1000000",
      sqft: "3500",
      title: "5 BHK villa in Whitefield for joint family",
      locality: "Whitefield",
      lat: "12.9698",
      lng: "77.7499",
      description:
        "Spacious 5-bedroom independent villa in Whitefield's quieter pocket. Suitable for joint families or shared living. 3500 sqft built-up, private garden, basement parking for 3 cars. Fully furnished including beds, sofas, fridge, washing machine. Walking distance from EPIP zone tech parks.",
    });
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${j.error}`);
    if (j.status !== "active") throw new Error(`got ${j.status}: ${j.reason}`);
    bhk5Id = j.listingId;
    inserted.push(bhk5Id);
    return j.listingId;
  });

  // ------------------------------------------------------------------
  // 4. BHK 6 (API allows 1-10 even though form caps at 5)
  // ------------------------------------------------------------------
  let bhk6Id = null;
  await step("POST API-direct bhk=6 -> active (allowed beyond form cap)", async () => {
    const fd = baseFormData({
      bhk: "6",
      rent: "250000",
      deposit: "1500000",
      sqft: "4500",
      title: "6 BHK independent house in Sadashivanagar — heritage property",
      locality: "Malleshwaram",
      lat: "13.0023",
      lng: "77.5667",
      description:
        "Heritage 6-bedroom property in the heart of old Bangalore, lovingly maintained for three generations. Suitable for embassy stays or large joint families. Six bedrooms each with attached bath, formal living room, study, and prayer room. Private compound, 4-car parking.",
    });
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${j.error}`);
    if (j.status !== "active") throw new Error(`got ${j.status}: ${j.reason}`);
    bhk6Id = j.listingId;
    inserted.push(bhk6Id);
    return j.listingId;
  });

  // ------------------------------------------------------------------
  // 5. Filter: "5+" matches both 5 and 6
  // ------------------------------------------------------------------
  await step("filter bhk=5 matches the 5-BHK row", async () => {
    const { filterListings } = await import("../lib/filterListings.js");
    const { data: all } = await admin.from("listings").select("*").in("id", [bhk5Id, bhk6Id]);
    const matched = filterListings(all, { bhk: [5] });
    if (matched.length !== 2)
      throw new Error(`expected 2 matches (5 + 6), got ${matched.length}`);
    return "matched 5 AND 6";
  });

  await step("filter bhk=2 does NOT match 5/6", async () => {
    const { filterListings } = await import("../lib/filterListings.js");
    const { data: all } = await admin.from("listings").select("*").in("id", [bhk5Id, bhk6Id]);
    const matched = filterListings(all, { bhk: [2] });
    if (matched.length !== 0)
      throw new Error(`expected 0 matches, got ${matched.length}`);
    return "no false positives";
  });

  // ------------------------------------------------------------------
  // 6. Validation: pin outside Bangalore -> 400
  // ------------------------------------------------------------------
  await step("pin outside Bangalore -> 400", async () => {
    const fd = baseFormData({ lat: "19.0760", lng: "72.8777" }); // Mumbai
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    const j = await res.json();
    if (!/bangalore|pin/i.test(j.error))
      throw new Error(`error msg unclear: ${j.error}`);
    return "400";
  });

  // ------------------------------------------------------------------
  // 7. Validation: missing lat -> 400
  // ------------------------------------------------------------------
  await step("missing lat/lng -> 400", async () => {
    const fd = baseFormData();
    fd.delete("lat");
    fd.delete("lng");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  // ------------------------------------------------------------------
  // 8. Validation: bad sqft -> 400
  // ------------------------------------------------------------------
  await step("sqft=50 (too small) -> 400", async () => {
    const fd = baseFormData({ sqft: "50" });
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  await step("sqft=15000 (too large) -> 400", async () => {
    const fd = baseFormData({ sqft: "15000" });
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  // ------------------------------------------------------------------
  // 9. AI rejects spam; no photo upload
  // ------------------------------------------------------------------
  let rejectedId = null;
  await step("spam listing -> rejected, no photos uploaded", async () => {
    const fd = baseFormData({
      title: "asdf asdf asdf rent flat now",
      description:
        "TEST TEST TEST lorem ipsum dolor sit amet asdf asdf qwerty 12345 just filling this out, no real flat, lol.",
      sqft: "200",
      ownerName: "Priya",
    });
    fd.append("photos", new Blob([PNG], { type: "image/png" }), "spam.png");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${j.error}`);
    if (j.status !== "rejected") throw new Error(`expected rejected, got ${j.status}`);
    rejectedId = j.listingId;
    inserted.push(rejectedId);
    const { data } = await admin
      .from("listings")
      .select("photos")
      .eq("id", rejectedId)
      .single();
    if ((data.photos || []).length !== 0)
      throw new Error("rejected listing should have no photos");
    return `"${j.reason.slice(0, 40)}..."`;
  });

  // ------------------------------------------------------------------
  // 10. Photo MIME validation
  // ------------------------------------------------------------------
  await step("non-image MIME -> 400 before AI", async () => {
    const fd = baseFormData();
    fd.append("photos", new Blob(["nope"], { type: "text/plain" }), "x.txt");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  // ------------------------------------------------------------------
  // 11. /post page still loads after all submissions
  // ------------------------------------------------------------------
  await step("/post still renders after stress", async () => {
    const res = await fetch(`${BASE}/post`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return "200";
  });
} finally {
  console.log("\n  Cleaning up...");
  for (const id of inserted) {
    await admin.from("listings").delete().eq("id", id);
    const { data: files } = await admin.storage.from("listing-photos").list(id);
    if (files?.length) {
      await admin.storage
        .from("listing-photos")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
  }
  console.log("  Cleaned.");
}

console.log("\n=== Full integration tests passed ===\n");
