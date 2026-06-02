// Haiku-based extraction. Source-agnostic: takes the raw text of a post and
// returns either {is_listing: false, reason} or a structured listing object.

import { ANTHROPIC_API_KEY } from "./env.mjs";
import { sleep } from "./util.mjs";
import { KNOWN_LOCALITIES } from "./locality.mjs";

const LOCALITY_LIST_STR = KNOWN_LOCALITIES.join(", ");

const EXTRACT_PROMPT = `You parse posts about Bangalore flats and decide if each is a rental LISTING (someone OFFERING a flat or a room, with a price). Extract structured data only if yes.

OFFERS vs WANTEDs (this is the most important distinction):
- OFFER = "I have a room available" / "Sublet my flat" / "Tenant needed" / "Flatmate replacement" / "2BHK for rent" → KEEP
- WANTED = "Looking for a flat" / "Need a place" / "Searching for an apartment" → REJECT
- DISCUSSION / RANT / QUESTION / SCAM ALERT / [RENTED OUT] / [SOLD] / market trends → REJECT
- SALE listings (apartment for purchase) → REJECT (we only do rentals)

Strict JSON only. No prose. No markdown.

Either:
{ "is_listing": false, "reason": "short reason" }

Or:
{
  "is_listing": true,
  "title": "short clean title, e.g. '2BHK in Koramangala 5th Block'",
  "locality": "ONE Bangalore neighbourhood from this EXACT list. Use 'Unknown' if the post mentions any area NOT on this list (do NOT pick the alphabetically-closest name). The list:
${LOCALITY_LIST_STR}",
  "location_query": "most SPECIFIC address-like string from the post, suitable for geocoding. e.g. 'Koramangala 5th Block, near Sony Signal' or 'HSR Layout Sector 2, 27th Main'. NO city name needed.",
  "rent": integer (INR/month, REQUIRED, must be 5000-500000. If the post says 'X per person' or 'X for the room' that IS the rent),
  "deposit": integer (INR, omit if not stated),
  "bhk": integer 1-10. 1 for single rooms / studios / PGs / shared rooms. 2 and up only when the whole flat is being offered. Record the actual number — a 5BHK villa is 5, not 3.,
  "listingType": "entire_flat" | "room" | "pg":
    - "entire_flat" = the WHOLE flat is being offered ("2BHK for rent", "entire flat available")
    - "room" = single room/bed in a shared flat ("1 room in 3BHK", "flatmate needed", "replacement needed")
    - "pg" = paying guest / hostel accommodation,
  "genderPreference": "male" | "female" | "any":
    - "male" if: "male only", "boys only", "gents", "bachelor boys", "male flatmate"
    - "female" if: "female only", "girls only", "ladies", "working women", "female flatmate"
    - "any" if: not mentioned, "no preference", "any gender", "couple friendly", "family",
  "furnished": "fully" | "semi" | "unfurnished" (omit if unclear),
  "amenities": array, only from: gym, pool, parking, power_backup, garden, security, club. Omit field if none mentioned.,
  "description": "1-2 sentence summary of what's available, cleaned up from the post"
}

Be STRICT. Mark is_listing: false when:
- Wanted/looking-for, not an offer
- Complaints, scam alerts, market discussions
- About buying/purchasing/investing, not renting
- Rent missing or outside 5000-200000 INR
- Post explicitly says [RENTED OUT] / [SOLD] / "no longer available"
- Locality cannot be inferred from the canonical list
- Not in Bangalore`;

export async function extractListing(rawText, opts = {}) {
  const userContent = rawText.slice(0, 3500);
  const retries = opts.retries ?? 2;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
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

// Validate a parsed extraction. Returns null if it should be dropped.
export function validateParsed(parsed) {
  if (!parsed?.is_listing) return null;
  if (!parsed.rent || parsed.rent < 5000 || parsed.rent > 500000) return null;
  if (!Number.isInteger(parsed.bhk) || parsed.bhk < 1 || parsed.bhk > 10) return null;
  if (!KNOWN_LOCALITIES.includes(parsed.locality)) return null;
  return parsed;
}
