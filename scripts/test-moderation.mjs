// Tests the AI auto-moderator against a handful of sample listings.
// Mirrors the prompt used in app/api/listings/submit/route.js.

import { readFileSync } from "node:fs";

// Load .env.local manually
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k),
);

const MODERATION_PROMPT = `You are the auto-moderator for TruRent, a Bangalore rental listings site.

Score this user-submitted flat listing. Approve unless you spot a clear problem.

REJECT only if the listing exhibits one of:
- spam or gibberish title/description (random characters, copy-pasted noise)
- abusive, discriminatory, or sexually explicit content
- obvious scam (e.g. asks renter to wire money offshore, contact via random phone numbers for "advance payment")
- placeholder text like "test test test" or "asdf"
- description has nothing to do with renting a flat

Be PERMISSIVE. Approve listings that are brief, awkwardly worded, or have unusual details — those are normal.

Respond with ONLY a JSON object on a single line, no markdown, no preface:
{"decision": "approve"|"reject", "reason": "<short reason if rejected, else empty string>", "flags": ["<optional tag like 'short_description' or 'unusual_price'>"]}`;

const samples = [
  {
    name: "legit listing",
    data: {
      title: "2BHK in Koramangala 5th Block, walking distance from Forum Mall",
      locality: "Koramangala",
      bhk: 2,
      rent: 38000,
      deposit: 380000,
      furnished: "semi",
      listingType: "entire_flat",
      genderPreference: "any",
      amenities: ["parking", "power_backup"],
      description:
        "Spacious 2BHK in a quiet residential lane, 5 min walk from Sony World metro. Recently painted, modular kitchen, semi-furnished with wardrobes and modular kitchen but no appliances. Society has 24/7 security and visitor parking. Available from June 1st. Looking for working professionals or small families, vegetarians preferred.",
      photos: ["https://example.com/photo1.jpg"],
    },
  },
  {
    name: "brief but valid",
    data: {
      title: "1BHK near HSR sector 7",
      locality: "HSR Layout",
      bhk: 1,
      rent: 18000,
      deposit: 100000,
      furnished: "unfurnished",
      listingType: "entire_flat",
      genderPreference: "male",
      amenities: [],
      description:
        "Single bedroom hall kitchen in HSR sector 7. Ground floor. Quiet area. Direct owner, no brokerage. Move in immediately.",
      photos: [],
    },
  },
  {
    name: "gibberish title",
    data: {
      title: "asdf asdf asdf asdf asdf",
      locality: "Indiranagar",
      bhk: 2,
      rent: 25000,
      deposit: 50000,
      furnished: "fully",
      listingType: "entire_flat",
      genderPreference: "any",
      amenities: [],
      description:
        "lorem ipsum dolor sit amet test test test asdf asdf qwerty qwerty just testing the form here lmao",
      photos: [],
    },
  },
  {
    name: "obvious scam",
    data: {
      title: "URGENT! Luxury 3BHK Whitefield at unbelievable price",
      locality: "Whitefield",
      bhk: 3,
      rent: 5000,
      deposit: 5000,
      furnished: "fully",
      listingType: "entire_flat",
      genderPreference: "any",
      amenities: ["gym", "pool", "club"],
      description:
        "GOD BLESS YOU dear friend. I am working overseas in Dubai and cannot physically show the flat. Please send 50000 INR advance to my Western Union account and I will mail you the keys via DHL. Truly trustworthy deal, you must hurry, many people interested!!!",
      photos: [],
    },
  },
  {
    name: "abusive content",
    data: {
      title: "PG only for [slur] tenants",
      locality: "BTM Layout",
      bhk: 1,
      rent: 12000,
      deposit: 12000,
      furnished: "semi",
      listingType: "pg",
      genderPreference: "male",
      amenities: [],
      description:
        "PG for boys only. No [discriminatory slur]. No North Indians. We are very particular about who lives here. Strictly no eating outside food. We hate everyone who is not from our community.",
      photos: [],
    },
  },
];

async function moderate(data) {
  const userMessage = `Listing to moderate:

Title: ${data.title}
Locality: ${data.locality}
BHK: ${data.bhk}
Rent: ₹${data.rent}/mo (deposit ₹${data.deposit})
Furnished: ${data.furnished}
Type: ${data.listingType}
Tenant pref: ${data.genderPreference}
Amenities: ${data.amenities.join(", ") || "none"}
Photos: ${data.photos.length} attached

Description:
${data.description}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
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
    return { error: `${res.status} ${await res.text()}` };
  }
  const json = await res.json();
  const text = json?.content?.[0]?.text?.trim() || "";
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(jsonText);
  } catch {
    return { error: "Could not parse: " + text };
  }
}

console.log("Testing AI auto-moderation against sample listings...\n");
for (const s of samples) {
  const t0 = Date.now();
  const result = await moderate(s.data);
  const ms = Date.now() - t0;
  const tag = result.decision === "approve" ? "[OK]" : result.decision === "reject" ? "[NO]" : "[??]";
  console.log(`${tag} ${s.name.padEnd(20)} (${ms}ms)`);
  console.log(`     decision: ${result.decision || "ERROR"}`);
  if (result.reason) console.log(`     reason:   ${result.reason}`);
  if (result.flags?.length) console.log(`     flags:    ${result.flags.join(", ")}`);
  if (result.error) console.log(`     error:    ${result.error}`);
  console.log();
}
