// Streaming agentic loop. Claude can call tools (search_listings, get_listing_details).
// We stream NDJSON events back to the client so the UI can render text + tool calls
// progressively. The loop continues calling Claude until stop_reason is "end_turn".

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filterListings, localityMatches } from "@/lib/filterListings";

// ---- Listings loaded once at module load. Turbopack reloads this on JSON edits. ----
let LISTINGS = [];
try {
  LISTINGS = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/listings.json"), "utf8"),
  );
} catch {
  LISTINGS = [];
}

// Precomputed locality metadata for fallback suggestions.
const LOCALITY_CENTROIDS = (() => {
  const groups = new Map();
  for (const l of LISTINGS) {
    const g = groups.get(l.locality) ?? { lat: 0, lng: 0, n: 0 };
    g.lat += l.lat;
    g.lng += l.lng;
    g.n += 1;
    groups.set(l.locality, g);
  }
  const out = {};
  for (const [loc, g] of groups) {
    out[loc] = { lat: g.lat / g.n, lng: g.lng / g.n, count: g.n };
  }
  return out;
})();
const KNOWN_LOCALITIES = Object.keys(LOCALITY_CENTROIDS);

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function canonicalizeLocality(input) {
  if (!input) return null;
  for (const canon of KNOWN_LOCALITIES) {
    if (localityMatches(input, canon)) return canon;
  }
  return null;
}

function nearbyLocalities(requestedLocs, k = 5) {
  const out = new Set();
  for (const req of requestedLocs || []) {
    const canon = canonicalizeLocality(req);
    if (!canon) continue;
    const target = LOCALITY_CENTROIDS[canon];
    const ranked = Object.entries(LOCALITY_CENTROIDS)
      .filter(([loc]) => loc !== canon)
      .map(([loc, c]) => ({ loc, dist: haversineKm(target, c) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);
    for (const { loc } of ranked) out.add(loc);
  }
  return [...out];
}

// Compute fallback suggestions when a search returns 0 or very few results.
function computeAlternatives(filters) {
  const alts = {};
  const baseRest = { ...filters };

  // 1. Relax price ceiling by 30%
  if (filters.maxRent) {
    const newMax = Math.round(filters.maxRent * 1.3);
    const n = filterListings(LISTINGS, { ...baseRest, maxRent: newMax }).length;
    if (n > 0) alts.if_max_rent_raised_30pct = { new_max_rent: newMax, count: n };
  }

  // 2. Broaden BHK to include adjacent values
  if (Array.isArray(filters.bhk) && filters.bhk.length > 0) {
    const broaden = new Set(filters.bhk);
    for (const b of filters.bhk) {
      if (b - 1 >= 1) broaden.add(b - 1);
      if (b + 1 <= 3) broaden.add(b + 1);
    }
    const arr = [...broaden].sort();
    if (arr.length > filters.bhk.length) {
      const n = filterListings(LISTINGS, { ...baseRest, bhk: arr }).length;
      if (n > 0) alts.if_bhk_broadened = { bhk: arr, count: n };
    }
  }

  // 3. Drop the noBrokerageOnly constraint
  if (filters.noBrokerageOnly) {
    const n = filterListings(LISTINGS, {
      ...baseRest,
      noBrokerageOnly: false,
    }).length;
    if (n > 0) alts.if_brokerage_allowed = { count: n };
  }

  // 4. Drop the amenity constraint(s)
  if (Array.isArray(filters.amenities) && filters.amenities.length > 0) {
    const without = { ...baseRest };
    delete without.amenities;
    const n = filterListings(LISTINGS, without).length;
    if (n > 0)
      alts.if_amenities_dropped = {
        dropped: filters.amenities,
        count: n,
      };
  }

  // 5. Nearby localities that DO have inventory under the same other filters
  if (Array.isArray(filters.localities) && filters.localities.length > 0) {
    const sameFilters = { ...baseRest };
    delete sameFilters.localities;
    const candidates = nearbyLocalities(filters.localities, 6);
    const results = [];
    for (const loc of candidates) {
      const n = filterListings(LISTINGS, {
        ...sameFilters,
        localities: [loc],
      }).length;
      if (n > 0) results.push({ locality: loc, count: n });
    }
    if (results.length > 0) alts.nearby_localities_with_inventory = results.slice(0, 4);
  }

  return Object.keys(alts).length > 0 ? alts : null;
}

// ---- System prompt ----

const SYSTEM_PROMPT = `You are TruRent's flat-finding agent for Bangalore. You have tools that let you actually search and reason over a database of ${LISTINGS.length} real Bangalore rental listings sourced from Reddit posts. Use them. Don't just describe what you'd do, do it.

How you operate:
1. Read what the user wants. If you have enough to search, search immediately.
2. If a detail is genuinely missing (e.g. no area AND no budget AND no BHK), ask ONE concise clarifying question. Otherwise just search with what you have.
3. Use search_listings whenever the user wants to see flats, change filters, or asks anything that needs current data. The map updates automatically with whatever you search for.
4. For comparisons or "which is best", look at the actual listings in your search result and reason in plain language. Cite specific listings by area + rent, not by id.
5. Replies stay short and human. Like a Bangalore local helping a friend.

Locality knowledge (use these spellings):
Koramangala, Indiranagar, HSR Layout, Whitefield, Bellandur, Sarjapur Road, Marathahalli, BTM Layout, Jayanagar, Banashankari, JP Nagar, Bannerghatta Road, Hebbal, Yelahanka, Electronic City, Bommanahalli, Hennur, Frazer Town, Shivajinagar, Cunningham Road, Richmond Town, Ulsoor, Domlur, Malleshwaram, Rajajinagar, Sadashivanagar, Vijayanagar, Mysore Road, RT Nagar, Old Airport Road, CV Raman Nagar, Kasturi Nagar, Kalyan Nagar, Brookefield, Hoodi, Kadugodi, Mahadevapura, Devanahalli.

Tech park → locality mapping:
- Manyata Tech Park → Hebbal, Hennur
- ITPL / EPIP → Whitefield, Brookefield, Mahadevapura
- Outer Ring Road / ORR → Bellandur, Sarjapur Road, Marathahalli
- Electronic City → Electronic City, Bommanahalli
- Cessna / Embassy Tech Village → Bellandur, Sarjapur Road
- MG Road / UB City → Ulsoor, Indiranagar, Domlur

When searching:
- bhk is always an array of integers from {1, 2, 3}. We have NO 4+ BHK listings.
- For "no broker"/"zero brokerage"/"direct owner", set noBrokerageOnly: true.
- For "cheap" with no number, use maxRent: 20000. "Premium" or "luxury" → minRent: 50000.
- amenities are from this EXACT list: gym, pool, parking, power_backup, garden, security, club. Nothing else (no wifi, no AC, no pet-friendly, none of those are in the dataset).

# Handling thin or zero results (THIS IS CRITICAL)

The search_listings tool returns a result object that may include:
- count (how many matched)
- listings_preview (up to 25 matched listings)
- unknown_localities (locality names that aren't in our Bangalore dataset, e.g. "Mumbai", "Pune")
- unsupported_amenities (amenities not in our schema, e.g. "wifi")
- unsupported_bhks (BHK counts we don't carry, e.g. 4)
- alternatives (suggestions for relaxing filters): may contain {if_max_rent_raised_30pct, if_bhk_broadened, if_brokerage_allowed, if_amenities_dropped, nearby_localities_with_inventory}

You MUST react to these intelligently:

- If unknown_localities is present: tell the user we don't cover that area, name the closest Bangalore locality we DO cover, and offer to search there. Don't pretend we have data for it.
- If unsupported_amenities or unsupported_bhks is present: tell the user honestly ("we don't track wifi" / "we don't carry 4 BHK"), then offer the closest we have.
- If count === 0 AND there's an alternatives.nearby_localities_with_inventory: name the top 1-2 nearby localities with their counts, ask if the user wants to look there.
- If count === 0 AND there's an alternatives.if_max_rent_raised_30pct or if_bhk_broadened: name the relaxation and how many it would surface, ask if they want to widen.
- If count === 0 AND no useful alternatives are returned: say honestly that nothing matches and ask the user what they'd flex on.
- If count is low (1-2) and an alternative would surface 5+ more: mention it as an option, but DON'T auto-search. Wait for them.

NEVER just say "I found 0 listings" with no suggestion. NEVER act like everything is fine when the user asked for something we can't deliver.

# Scope (be honest about what this is)

- This product covers Bangalore residential rentals only. If asked about Mumbai/Pune/Hyderabad/anywhere else, say we're Bangalore-only.
- The listings are real Bangalore rental posts sourced from Reddit (r/bangalore, r/IndianRealEstate, r/bengaluru, etc.). Each listing links back to its original Reddit post. Coordinates come from OpenStreetMap geocoding of the address mentioned in each post (or the neighbourhood centroid if no specific address was given). If asked directly, be honest about the data source.
- You can't book viewings, contact landlords, or schedule anything. You search and reason about listings. If asked, say so briefly and steer back.
- If asked off-topic (jokes, weather, general knowledge), give a one-line redirect: something like "I'm just here for Bangalore flats. Want to search?"

When users ask "compare these" or "which has the shortest commute" or "best value of these", call get_listing_details on the specific IDs you saw in the prior search to get full info, then reason about them.

When the user says reset/clear/start over/show everything, call search_listings with no filters at all.

When you finish a tool sequence, write a short final reply. Don't dump JSON. Don't say "I found X listings" without naming a few specifics (areas, rents).`;

// ---- Tool definitions for Claude ----

const TOOLS = [
  {
    name: "search_listings",
    description:
      "Search the Bangalore rental database with structured filters. Returns the total count, the filters that were applied, and up to 25 matching listings (id, title, locality, rent, bhk, furnished, brokerage, amenities, source). The user-facing map updates to show the results of this search automatically.",
    input_schema: {
      type: "object",
      properties: {
        maxRent: {
          type: "number",
          description: "Maximum monthly rent in INR. Omit if user gave no ceiling.",
        },
        minRent: {
          type: "number",
          description: "Minimum monthly rent in INR. Omit if user gave no floor.",
        },
        bhk: {
          type: "array",
          items: { type: "number" },
          description:
            "Allowed BHK counts as an array, e.g. [2] or [2,3]. Always an array, even for a single value.",
        },
        localities: {
          type: "array",
          items: { type: "string" },
          description: "Bangalore neighbourhood names, properly spelled.",
        },
        furnished: {
          type: "string",
          enum: ["fully", "semi", "unfurnished"],
        },
        noBrokerageOnly: {
          type: "boolean",
          description: "True if the user wants zero-brokerage / direct-owner listings only.",
        },
        amenities: {
          type: "array",
          items: { type: "string" },
          description:
            "Required amenities from: gym, pool, parking, power_backup, garden, security, club.",
        },
      },
    },
  },
  {
    name: "get_listing_details",
    description:
      "Fetch the full details of one specific listing by id (e.g. blr_058). Use this when comparing listings or answering specific questions about one flat.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Listing id like blr_058" },
      },
      required: ["id"],
    },
  },
];

// ---- Tool implementations (server side) ----

function shortListing(l) {
  return {
    id: l.id,
    title: l.title,
    locality: l.locality,
    rent: l.rent,
    bhk: l.bhk,
    furnished: l.furnished,
    brokerage: l.brokerage,
    amenities: l.amenities,
    source: l.source,
    postedDaysAgo: l.postedDaysAgo,
  };
}

const SUPPORTED_AMENITIES = new Set([
  "gym",
  "pool",
  "parking",
  "power_backup",
  "garden",
  "security",
  "club",
]);
const SUPPORTED_BHKS = new Set([1, 2, 3]);

function executeTool(name, input) {
  if (name === "search_listings") {
    const filters = input ?? {};
    const matched = filterListings(LISTINGS, filters);

    // Detect localities the user/agent asked for that aren't in our dataset at all
    // (after fuzzy matching). These are NOT in Bangalore or just unknown to us.
    const unknownLocalities = [];
    if (Array.isArray(filters.localities)) {
      for (const loc of filters.localities) {
        if (!canonicalizeLocality(loc)) unknownLocalities.push(loc);
      }
    }

    // Detect amenities outside our supported set (we silently ignore them in the
    // filter, but the agent should know to tell the user).
    const unsupportedAmenities = [];
    if (Array.isArray(filters.amenities)) {
      for (const a of filters.amenities) {
        // alias is normalized inside filterListings; here just check raw membership
        const normalized = String(a).toLowerCase().replace(/[^a-z0-9]/g, "");
        const known = [...SUPPORTED_AMENITIES].some((s) =>
          normalized.includes(s) || s.includes(normalized),
        );
        if (!known) unsupportedAmenities.push(a);
      }
    }

    // Detect BHK requests outside our range (we only have 1/2/3).
    const unsupportedBhks = [];
    if (Array.isArray(filters.bhk)) {
      for (const b of filters.bhk) {
        if (!SUPPORTED_BHKS.has(Number(b))) unsupportedBhks.push(b);
      }
    }

    // Compute fallbacks when results are thin OR something was unrecognized.
    const needAlternatives =
      matched.length < 3 ||
      unknownLocalities.length > 0 ||
      unsupportedBhks.length > 0;
    const alternatives = needAlternatives
      ? computeAlternatives(filters)
      : null;

    const result = {
      count: matched.length,
      total_in_database: LISTINGS.length,
      filters_applied: filters,
      listings_preview: matched.slice(0, 25).map(shortListing),
    };
    if (unknownLocalities.length > 0) {
      result.unknown_localities = unknownLocalities;
      result.note_unknown_localities =
        "These localities are not in our Bangalore dataset (we cover ~25 popular Bangalore neighbourhoods only).";
    }
    if (unsupportedAmenities.length > 0) {
      result.unsupported_amenities = unsupportedAmenities;
      result.supported_amenities = [...SUPPORTED_AMENITIES];
    }
    if (unsupportedBhks.length > 0) {
      result.unsupported_bhks = unsupportedBhks;
      result.note_unsupported_bhks =
        "We only have 1, 2, and 3 BHK listings in the dataset.";
    }
    if (alternatives) result.alternatives = alternatives;

    return { ok: true, filtersUsed: filters, result };
  }
  if (name === "get_listing_details") {
    const id = input?.id;
    const l = LISTINGS.find((x) => x.id === id);
    if (!l) return { ok: false, result: { error: `No listing with id ${id}` } };
    return { ok: true, result: l };
  }
  return { ok: false, result: { error: `Unknown tool: ${name}` } };
}

function toolSummary(name, exec) {
  if (!exec.ok) return "Error";
  if (name === "search_listings") {
    const c = exec.result.count;
    return `Found ${c} ${c === 1 ? "listing" : "listings"}`;
  }
  if (name === "get_listing_details") {
    const r = exec.result;
    return `Loaded ${r.locality} · ₹${(r.rent / 1000).toFixed(0)}k`;
  }
  return "Done";
}

// ---- Streaming response (NDJSON) ----

function ndjsonStream(handler) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      function send(event) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* controller closed */
        }
      }
      try {
        await handler(send);
      } catch (err) {
        send({ type: "error", message: "Something went wrong" });
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });
}

// ---- Anthropic SSE parsing ----
// The SDK does this for you, but we're using raw fetch, so parse the SSE stream ourselves.
// Anthropic emits events as `event: <name>\ndata: <json>\n\n`. We only need the JSON.

async function* parseAnthropicStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = block
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        yield JSON.parse(dataLine.slice(6));
      } catch {
        /* malformed event, skip */
      }
    }
  }
}

// ---- The agent loop ----

const MAX_ITERATIONS = 6;

async function runAgentLoop(messages, send, apiKey) {
  let conv = messages.slice();
  const startTime = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let toolCalls = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: conv,
        tools: TOOLS,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      send({ type: "error", message: "Upstream API error" });
      return;
    }

    // Accumulate this turn's content blocks while streaming text deltas to the client.
    const turnBlocks = [];
    let currentBlock = null;
    let currentInputJson = "";
    let stopReason = null;

    for await (const evt of parseAnthropicStream(upstream.body)) {
      const t = evt.type;

      // Token usage. Anthropic emits input on message_start (final value) and
      // updated output on message_delta (final value at end of stream).
      if (t === "message_start" && evt.message?.usage) {
        tokensIn += evt.message.usage.input_tokens || 0;
      }
      if (t === "message_delta" && evt.usage) {
        tokensOut += evt.usage.output_tokens || 0;
      }

      if (t === "content_block_start") {
        currentBlock = { ...evt.content_block };
        currentInputJson = "";
        if (currentBlock.type === "tool_use") {
          send({
            type: "tool_use_start",
            id: currentBlock.id,
            name: currentBlock.name,
          });
        }
      } else if (t === "content_block_delta") {
        if (evt.delta?.type === "text_delta") {
          const text = evt.delta.text;
          if (currentBlock) currentBlock.text = (currentBlock.text || "") + text;
          send({ type: "text_delta", text });
        } else if (evt.delta?.type === "input_json_delta") {
          currentInputJson += evt.delta.partial_json || "";
        }
      } else if (t === "content_block_stop") {
        if (currentBlock?.type === "tool_use") {
          try {
            currentBlock.input = JSON.parse(currentInputJson || "{}");
          } catch {
            currentBlock.input = {};
          }
        }
        if (currentBlock) turnBlocks.push(currentBlock);
        currentBlock = null;
        currentInputJson = "";
      } else if (t === "message_delta") {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
      }
    }

    conv.push({ role: "assistant", content: turnBlocks });
    send({ type: "assistant_turn_complete", blocks: turnBlocks });

    if (stopReason !== "tool_use") break;

    // Execute each tool_use block and feed results back.
    const toolResults = [];
    for (const block of turnBlocks) {
      if (block.type !== "tool_use") continue;
      toolCalls += 1;

      const exec = executeTool(block.name, block.input);

      // Side effect: when the agent searches, the map should reflect the search.
      if (block.name === "search_listings" && exec.ok) {
        send({ type: "filters_update", filters: exec.filtersUsed });
      }

      send({
        type: "tool_result",
        tool_use_id: block.id,
        name: block.name,
        summary: toolSummary(block.name, exec),
      });

      // Keep the tool result payload bounded so a chatty result can't blow context.
      const payload = JSON.stringify(exec.result);
      const truncated = payload.length > 12000 ? payload.slice(0, 12000) + "...[truncated]" : payload;

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: truncated,
        is_error: !exec.ok,
      });
    }

    conv.push({ role: "user", content: toolResults });
  }

  // One small telemetry blob the UI surfaces under the final assistant message.
  send({
    type: "turn_summary",
    latency_ms: Date.now() - startTime,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    tool_calls: toolCalls,
  });
}

// ---- Route handler ----

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ type: "text_delta", text: "API key not configured." }) +
        "\n" +
        JSON.stringify({ type: "done" }) +
        "\n",
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ type: "error", message: "Bad request" }) +
        "\n" +
        JSON.stringify({ type: "done" }) +
        "\n",
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];

  return new Response(
    ndjsonStream((send) => runAgentLoop(messages, send, apiKey)),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
