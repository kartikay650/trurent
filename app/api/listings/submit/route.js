// Anonymous listing submission with AI auto-moderation.
//
// Flow:
//   1. Read multipart FormData (text fields + photo files).
//   2. Validate everything server-side.
//   3. Ask Claude Haiku to moderate -> approve | reject + reason.
//   4. If approved: upload photos to Storage via service role, then insert
//      the row with status=active. If rejected: insert with status=rejected
//      and skip photo upload entirely.
//   5. Return the decision so the client can show the right UI.
//
// No authentication wall — the AI catches fakes. Renters reach owners via
// the phone/WhatsApp number on the row.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const ALLOWED_LOCALITIES = new Set([
  "Koramangala", "Indiranagar", "HSR Layout", "Whitefield", "Bellandur",
  "Sarjapur Road", "Marathahalli", "BTM Layout", "Jayanagar", "JP Nagar",
  "Banashankari", "Bannerghatta Road", "Hebbal", "Yelahanka", "Electronic City",
  "Bommanahalli", "Hennur", "Frazer Town", "Cunningham Road", "Richmond Town",
  "Ulsoor", "Domlur", "Malleshwaram", "Rajajinagar", "Vijayanagar",
  "RT Nagar", "Old Airport Road", "CV Raman Nagar", "Kasturi Nagar",
  "Kalyan Nagar", "Brookefield", "Hoodi", "Kadugodi", "Mahadevapura",
  "KR Puram", "Banaswadi", "Kammanahalli", "HBR Layout", "Munnekollal",
  "Varthur", "Kasavanahalli", "AECS Layout",
]);

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB each
const MAX_PHOTOS = 5;

// Bangalore bounding box for pin validation. Anything outside this is
// almost certainly a misclick or someone gaming the form.
const BLR_BOUNDS = { minLat: 12.7, maxLat: 13.2, minLng: 77.4, maxLng: 77.85 };

const LOCALITY_GEO = {
  Koramangala: [12.9352, 77.6245], Indiranagar: [12.9719, 77.6412],
  "HSR Layout": [12.9116, 77.6389], Whitefield: [12.9698, 77.7499],
  Bellandur: [12.9260, 77.6762], "Sarjapur Road": [12.9010, 77.6961],
  Marathahalli: [12.9591, 77.6971], "BTM Layout": [12.9165, 77.6101],
  Jayanagar: [12.9250, 77.5938], "JP Nagar": [12.8958, 77.5855],
  Banashankari: [12.9141, 77.5467], "Bannerghatta Road": [12.8735, 77.5985],
  Hebbal: [13.0358, 77.5970], Yelahanka: [13.1005, 77.5963],
  "Electronic City": [12.8399, 77.6770], Bommanahalli: [12.8958, 77.6401],
  Hennur: [13.0358, 77.6490], "Frazer Town": [12.9833, 77.6167],
  "Cunningham Road": [12.9833, 77.5933], "Richmond Town": [12.9600, 77.6010],
  Ulsoor: [12.9833, 77.6219], Domlur: [12.9591, 77.6390],
  Malleshwaram: [13.0023, 77.5667], Rajajinagar: [12.9906, 77.5530],
  Vijayanagar: [12.9719, 77.5310], "RT Nagar": [13.0212, 77.5917],
  "Old Airport Road": [12.9606, 77.6489], "CV Raman Nagar": [12.9855, 77.6601],
  "Kasturi Nagar": [13.0100, 77.6550], "Kalyan Nagar": [13.0200, 77.6490],
  Brookefield: [12.9698, 77.7200], Hoodi: [12.9855, 77.7100],
  Kadugodi: [12.9855, 77.7667], Mahadevapura: [12.9940, 77.7010],
  "KR Puram": [13.0094, 77.7053], Banaswadi: [13.0118, 77.6534],
  Kammanahalli: [13.0167, 77.6394], "HBR Layout": [13.0218, 77.6360],
  Munnekollal: [12.9569, 77.7039], Varthur: [12.9404, 77.7466],
  Kasavanahalli: [12.8990, 77.6814], "AECS Layout": [12.9750, 77.7080],
};

export async function POST(request) {
  // Anti-spam: 10 submissions / hour / IP.
  const ip = clientIp(request);
  const rl = rateLimit(`listing-submit:${ip}`, {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions from this IP. Try again later." },
      { status: 429 },
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const v = validatePayload(formData);
  if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });

  const photoFiles = collectPhotoFiles(formData);
  if (photoFiles.error) {
    return NextResponse.json({ error: photoFiles.error }, { status: 400 });
  }

  // AI moderation — fail-open on Anthropic errors (better to let an unusual
  // listing through than block the whole submission flow on a flake).
  const decision = await moderateWithClaude(v.data, photoFiles.files.length).catch(
    (err) => {
      console.error("AI moderation failed, defaulting to approve:", err.message);
      return { decision: "approve", reason: "moderation-skipped" };
    },
  );

  const now = new Date().toISOString();
  const status = decision.decision === "reject" ? "rejected" : "active";
  const listingId = `own_${cryptoRandom()}`;

  // Only upload photos for approved listings — saves storage on rejected ones.
  let photoUrls = [];
  if (status === "active" && photoFiles.files.length > 0) {
    try {
      photoUrls = await uploadPhotos(listingId, photoFiles.files);
    } catch (err) {
      console.error("Photo upload failed:", err);
      // Don't fail the whole submission; just record without photos.
    }
  }

  const row = {
    id: listingId,
    title: v.data.title,
    locality: v.data.locality,
    rent: v.data.rent,
    deposit: v.data.deposit || v.data.rent * 10,
    brokerage: v.data.brokerage || 0,
    bhk: v.data.bhk,
    lat: v.data.lat,
    lng: v.data.lng,
    geoSource: "owner_pin",
    furnished: v.data.furnished,
    listingType: v.data.listingType,
    genderPreference: v.data.genderPreference,
    amenities: v.data.amenities,
    nearby: [],
    source: "owner",
    sourceUrl: null,
    sourceAuthor: null,
    sourceSubreddit: null,
    description: v.data.description,
    postedDaysAgo: 0,
    postedAt: now,
    photos: photoUrls,
    hasRealPhotos: photoUrls.length > 0,
    sqft: v.data.sqft ?? null,
    societyName: v.data.societyName || null,
    ownerName: v.data.ownerName,
    ownerPhone: v.data.ownerPhone,
    ownerWhatsapp: v.data.ownerPhone, // same number; renters get one CTA
    verifiedAt: status === "active" ? now : null,
    lastSeenAt: now,
    status,
    rejectionReason: status === "rejected" ? decision.reason : null,
  };

  const { error } = await supabaseAdmin.from("listings").insert([row]);
  if (error) {
    // Log the full Supabase error server-side (column names, SQL state, etc.)
    // but return a generic message to the client to avoid schema leakage.
    console.error("Insert failed:", error);
    return NextResponse.json(
      { error: "Could not save listing. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status,
    listingId,
    reason: decision.reason,
  });
}

// --------- validation ----------------------------------------------------

function validatePayload(fd) {
  const title = String(fd.get("title") || "").trim();
  if (title.length < 8 || title.length > 200)
    return { error: "Title must be 8-200 chars" };

  const locality = String(fd.get("locality") || "");
  if (!ALLOWED_LOCALITIES.has(locality))
    return { error: "Pick a locality from the supported list" };

  const rent = parseInt(fd.get("rent"), 10);
  if (!rent || rent < 5000 || rent > 500000)
    return { error: "Rent must be 5000-500000" };

  const bhk = parseInt(fd.get("bhk"), 10);
  if (!Number.isInteger(bhk) || bhk < 1 || bhk > 10)
    return { error: "BHK must be 1-10" };

  const lat = parseFloat(fd.get("lat"));
  const lng = parseFloat(fd.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return { error: "Drop a pin on the map" };
  if (
    lat < BLR_BOUNDS.minLat || lat > BLR_BOUNDS.maxLat ||
    lng < BLR_BOUNDS.minLng || lng > BLR_BOUNDS.maxLng
  ) {
    return { error: "Pin must be inside Bangalore" };
  }

  const description = String(fd.get("description") || "").trim();
  if (description.length < 30 || description.length > 5000)
    return { error: "Description must be 30-5000 chars" };

  const furnished = String(fd.get("furnished") || "");
  if (!["fully", "semi", "unfurnished"].includes(furnished))
    return { error: "Invalid furnished value" };

  const listingType = String(fd.get("listingType") || "");
  if (!["entire_flat", "room", "pg"].includes(listingType))
    return { error: "Invalid listingType" };

  const genderPreference = String(fd.get("genderPreference") || "");
  if (!["any", "male", "female"].includes(genderPreference))
    return { error: "Invalid genderPreference" };

  const ownerName = String(fd.get("ownerName") || "").trim();
  if (ownerName.length < 2 || ownerName.length > 80)
    return { error: "Owner name must be 2-80 chars" };

  const ownerPhone = String(fd.get("ownerPhone") || "").trim();
  if (!/^\+\d{10,15}$/.test(ownerPhone))
    return { error: "Phone must be a valid international number, e.g. +91xxxxxxxxxx" };

  let amenities = [];
  try {
    amenities = JSON.parse(fd.get("amenities") || "[]");
    if (!Array.isArray(amenities)) amenities = [];
  } catch {
    amenities = [];
  }

  // Optional fields.
  let sqft = null;
  if (fd.get("sqft")) {
    const s = parseInt(fd.get("sqft"), 10);
    if (!Number.isInteger(s) || s < 100 || s > 10000)
      return { error: "Square footage must be 100-10000" };
    sqft = s;
  }

  const societyName = String(fd.get("societyName") || "").trim().slice(0, 120);

  return {
    data: {
      title,
      locality,
      lat: +lat.toFixed(5),
      lng: +lng.toFixed(5),
      rent,
      deposit: parseInt(fd.get("deposit"), 10) || 0,
      brokerage: parseInt(fd.get("brokerage"), 10) || 0,
      bhk,
      furnished,
      listingType,
      genderPreference,
      amenities,
      description,
      ownerName,
      ownerPhone,
      sqft,
      societyName,
    },
  };
}

function collectPhotoFiles(fd) {
  const all = fd.getAll("photos").filter((p) => p && typeof p === "object" && "arrayBuffer" in p);
  if (all.length > MAX_PHOTOS)
    return { error: `Max ${MAX_PHOTOS} photos` };
  for (const f of all) {
    if (!ALLOWED_IMAGE_MIME.has(f.type))
      return { error: `Unsupported image type: ${f.type || "unknown"}` };
    if (f.size > MAX_PHOTO_BYTES)
      return { error: `Photo too large (max ${MAX_PHOTO_BYTES / 1024 / 1024}MB)` };
  }
  return { files: all };
}

// --------- storage upload ------------------------------------------------

async function uploadPhotos(listingId, files) {
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    const path = `${listingId}/photo-${i}.${ext}`;
    const arrayBuf = await file.arrayBuffer();
    const { error } = await supabaseAdmin.storage
      .from("listing-photos")
      .upload(path, arrayBuf, {
        contentType: file.type,
        upsert: true,
        cacheControl: "31536000",
      });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    const { data: pub } = supabaseAdmin.storage
      .from("listing-photos")
      .getPublicUrl(path);
    urls.push(pub.publicUrl);
  }
  return urls;
}

// --------- AI moderation -------------------------------------------------

const MODERATION_PROMPT = `You are the auto-moderator for TruRent, a Bangalore rental listings site.

Score this user-submitted flat listing. Approve unless you spot a clear problem.

REJECT only if the listing exhibits one of:
- spam or gibberish title/description (random characters, copy-pasted noise)
- abusive, discriminatory, or sexually explicit content
- obvious scam (e.g. asks renter to wire money offshore, contact via random phone numbers for "advance payment")
- placeholder text like "test test test" or "asdf"
- description has nothing to do with renting a flat
- contact info missing or clearly fake (e.g. obviously invalid phone like 0000000000)

Be PERMISSIVE. Approve listings that are brief, awkwardly worded, or have unusual details — those are normal.

Respond with ONLY a JSON object on a single line, no markdown, no preface:
{"decision": "approve"|"reject", "reason": "<short reason if rejected, else empty string>", "flags": ["<optional tag>"]}`;

async function moderateWithClaude(data, photoCount) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const userMessage = `Listing to moderate:

Title: ${data.title}
Locality: ${data.locality}
Pin: ${data.lat}, ${data.lng}
BHK: ${data.bhk}${data.bhk >= 5 ? " (5 or more)" : ""}
Sqft: ${data.sqft ?? "not provided"}
Society: ${data.societyName || "not provided"}
Rent: ₹${data.rent}/mo (deposit ₹${data.deposit})
Furnished: ${data.furnished}
Type: ${data.listingType}
Tenant pref: ${data.genderPreference}
Amenities: ${data.amenities.join(", ") || "none"}
Photos: ${photoCount} attached
Owner name: ${data.ownerName}
Owner phone: ${data.ownerPhone}

Description:
${data.description}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: MODERATION_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.content?.[0]?.text?.trim() || "";

  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned non-JSON: " + text.slice(0, 200));
  }

  const decision = parsed.decision === "reject" ? "reject" : "approve";
  return {
    decision,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    flags: Array.isArray(parsed.flags) ? parsed.flags : [],
  };
}

function cryptoRandom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
