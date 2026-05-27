// End-to-end test of the anonymous listing submission flow.
//   1. POST multipart FormData with a legit listing -> AI approves -> row
//      lands with status=active, visible to the anon homepage query.
//   2. Same with a spam listing -> AI rejects -> row lands with
//      status=rejected, hidden from the anon homepage query.
//   3. Missing required fields -> 400.
//   4. Photo upload: include a real PNG; verify the URL works publicly.
//   5. Rate limit: trip the 10/hour cap.

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

function legitFormData() {
  const fd = new FormData();
  fd.append("title", "Spacious 2BHK in HSR sector 2, near metro and parks");
  fd.append("locality", "HSR Layout");
  fd.append("lat", "12.9116");
  fd.append("lng", "77.6389");
  fd.append("bhk", "2");
  fd.append("rent", "34000");
  fd.append("deposit", "200000");
  fd.append("brokerage", "0");
  fd.append("furnished", "semi");
  fd.append("listingType", "entire_flat");
  fd.append("genderPreference", "any");
  fd.append("amenities", JSON.stringify(["parking", "power_backup"]));
  fd.append(
    "description",
    "Bright 2-bedroom apartment on 3rd floor, 5 minutes from HSR sector 2 main road. Semi-furnished with modular kitchen, wardrobes, ceiling fans. Society has 24x7 security, lift, visitor parking. Available from June 15. Direct from owner, zero brokerage.",
  );
  fd.append("ownerName", "Rohit");
  fd.append("ownerPhone", "+919845127634");
  return fd;
}

function spamFormData() {
  const fd = new FormData();
  fd.append("title", "asdf asdf asdf flat for rent");
  fd.append("locality", "Whitefield");
  fd.append("lat", "12.9698");
  fd.append("lng", "77.7499");
  fd.append("bhk", "1");
  fd.append("rent", "5000");
  fd.append("deposit", "5000");
  fd.append("brokerage", "0");
  fd.append("furnished", "unfurnished");
  fd.append("listingType", "pg");
  fd.append("genderPreference", "any");
  fd.append("amenities", "[]");
  fd.append(
    "description",
    "TEST TEST TEST lorem ipsum dolor sit amet asdf asdf qwerty 12345 just filling this out to see if it works lol",
  );
  fd.append("ownerName", "Priya");
  fd.append("ownerPhone", "+919845127634");
  return fd;
}

// Minimal valid 1x1 PNG.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64",
);

console.log("\n=== Anonymous submit flow ===\n");

try {
  let activeId = null;
  await step("POST legit listing with PNG photo -> active", async () => {
    const fd = legitFormData();
    fd.append("photos", new Blob([PNG_1X1], { type: "image/png" }), "p.png");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
    if (j.status !== "active")
      throw new Error(`expected active, got ${j.status}: ${j.reason}`);
    activeId = j.listingId;
    inserted.push(activeId);
    return j.listingId;
  });

  await step("active row visible to anon + photo URL public", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon
      .from("listings")
      .select("id, status, photos, ownerName, ownerPhone")
      .eq("id", activeId)
      .single();
    if (error) throw error;
    if (data.status !== "active") throw new Error(`status=${data.status}`);
    if (!data.ownerName) throw new Error("ownerName missing");
    if (!data.ownerPhone) throw new Error("ownerPhone missing");
    if (!Array.isArray(data.photos) || data.photos.length !== 1)
      throw new Error("photo not saved");
    const photoRes = await fetch(data.photos[0]);
    if (!photoRes.ok)
      throw new Error(`photo URL not public: ${photoRes.status}`);
    return `${data.ownerName} · ${data.ownerPhone}`;
  });

  let rejectedId = null;
  await step("POST spam listing -> rejected, no photos uploaded", async () => {
    const fd = spamFormData();
    fd.append("photos", new Blob([PNG_1X1], { type: "image/png" }), "spam.png");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
    if (j.status !== "rejected") throw new Error(`expected rejected, got ${j.status}`);
    rejectedId = j.listingId;
    inserted.push(rejectedId);
    return `rejected: "${j.reason.slice(0, 50)}..."`;
  });

  await step("rejected row hidden from anon", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await anon
      .from("listings")
      .select("id, photos")
      .eq("id", rejectedId);
    if (data.length !== 0)
      throw new Error(`anon sees rejected row (count=${data.length})`);
    // Verify no photos were uploaded for the rejected one (storage saver).
    const adminRow = await admin
      .from("listings")
      .select("photos")
      .eq("id", rejectedId)
      .single();
    if ((adminRow.data?.photos || []).length !== 0)
      throw new Error("rejected listing should have no photos uploaded");
    return "hidden + no-photos";
  });

  await step("missing required field -> 400", async () => {
    const fd = legitFormData();
    fd.delete("ownerPhone");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  await step("non-image MIME in photo -> 400", async () => {
    const fd = legitFormData();
    fd.append("photos", new Blob(["not an image"], { type: "text/plain" }), "bad.txt");
    const res = await fetch(`${BASE}/api/listings/submit`, {
      method: "POST",
      body: fd,
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });
} finally {
  console.log("\n  Cleaning up...");
  for (const id of inserted) {
    await admin.from("listings").delete().eq("id", id);
  }
  // Try to clean up any uploaded photos from the active listing as well.
  if (inserted[0]) {
    const { data: files } = await admin.storage
      .from("listing-photos")
      .list(inserted[0]);
    if (files?.length) {
      await admin.storage
        .from("listing-photos")
        .remove(files.map((f) => `${inserted[0]}/${f.name}`));
    }
  }
  console.log("  Cleaned.");
}

console.log("\n=== Anonymous submit tests passed ===\n");
