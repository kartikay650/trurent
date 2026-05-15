# TruRent

**Skip the brokers. Find your Bangalore flat by talking to an agent.**

A natural-language flat-finder for Bangalore. You tell the agent what you want in plain English — *"I work at Manyata, 1-2 BHK under ₹25k, no broker"* — and it composes a structured search over a dataset of 132 listings, with the map zooming and pruning to match in real time.

Built as a 6-10 hour submission for the [Activate AI Fellowship](https://www.activatevc.ai/fellows), 2026.

---

## Demo paths that work

Try these in order. Each one exercises a different agent capability:

1. **`I work at Manyata, looking for 1-2 BHK under 25k with zero brokerage`**
   The agent recognizes "Manyata" → maps it to Hebbal and Hennur, builds a structured filter with `bhk: [1, 2]`, `maxRent: 25000`, `noBrokerageOnly: true`. The map flies to north Bangalore.

2. **`Which one has a gym?`** *(follow-up)*
   The agent retains all prior context, calls `search_listings` again with `amenities: ["gym"]` added, narrows the result set. You'll see the filter chip appear and the markers prune.

3. **`Compare the top two`** *(follow-up)*
   The agent calls a different tool — `get_listing_details` — twice, then writes a prose comparison citing specifics: rent, amenities, posted age.

4. **`2-3 bhk in koramangla under 70k`** *(deliberate typo)*
   Fuzzy locality matching (Levenshtein distance ≤ 2 with substring fallback) catches "koramangla" → "Koramangala". The query that would have returned 0 returns 10.

5. **`Find me a flat in Mumbai`**
   The agent recognizes "Mumbai" isn't in our Bangalore dataset, redirects without wasting a tool call.

6. **`Show me everything`**
   Resets all filters, returns the full 132, gives a written overview by BHK and price range.

---

## Why this is harder than it looks

The "AI translates natural language to filters" pattern is everywhere in 2026. What makes it hard to do well isn't the translation — it's everything *around* it:

- **Users misspell localities.** "Koramangla" / "Indranagar" / "Whitfield" are all common.
- **Users use ranges, not exact values.** "2-3 BHK" needs to become `[2, 3]`, not `2`.
- **Users mention things the schema doesn't carry.** "with wifi" should fail gracefully, not silently drop all results.
- **Users mention places that don't exist in your data.** "Mumbai" needs honest acknowledgement, not a silent zero-result.
- **Users want comparisons, not lists.** "Which has the shortest commute" requires multi-step reasoning, not a single search.
- **Zero results need recovery paths**, not dead ends. "0 in Bannerghatta" → *"Nothing matched. Try JP Nagar nearby — 8 options there?"*

A wrapper around `gpt-4` that emits JSON fails almost all of these. TruRent's agent handles all of them.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│    ChatWidget (streaming consumer, NDJSON parser)            │
│    Map  (react-leaflet + custom price-pill markers)          │
│    ListingCard (slide-up panel with Unsplash hero)           │
│                            │                                 │
│                            │ POST /api/chat (NDJSON stream)  │
│                            ▼                                 │
│  Next.js App Router /api/chat/route.js                       │
│    ┌────────────────────────────────────────────────────┐    │
│    │  Agentic loop (max 6 iterations)                   │    │
│    │    fetch → parse SSE → execute tools → repeat      │    │
│    │  Streams NDJSON events back as it goes:            │    │
│    │    text_delta · tool_use_start · tool_result       │    │
│    │    filters_update · turn_summary · done            │    │
│    └────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            │ tool calls                      │
│                            ▼                                 │
│    Server-side tools (in-process):                           │
│      search_listings(filters)  → runs filterListings()       │
│      get_listing_details(id)   → looks up by id              │
│      Both enriched with fallback alternatives                │
│                            │                                 │
│                            │ SSE                             │
│                            ▼                                 │
│  Anthropic API (claude-haiku-4-5-20251001)                   │
│    Streaming, multi-turn, tool use                           │
└──────────────────────────────────────────────────────────────┘
```

### The agent loop in one paragraph

The `/api/chat` route opens an SSE stream to Anthropic with a system prompt and two tool definitions. Claude streams back text deltas + tool-use blocks. When a tool-use block completes, the server executes it locally (calls `filterListings` over the in-memory dataset), feeds the result back in a new Anthropic call, and continues. The loop terminates when Claude's `stop_reason` is `end_turn`. Every event Claude emits — text tokens, tool calls, tool results — is forwarded to the browser as NDJSON, so the UI shows the agent's reasoning live.

### Tools (kept deliberately small)

```js
search_listings({
  maxRent, minRent,           // INR per month
  bhk: [1] | [2] | [2, 3],    // array, supports ranges
  localities: string[],        // fuzzy-matched server-side
  furnished: "fully" | "semi" | "unfurnished",
  noBrokerageOnly: boolean,
  amenities: string[],         // gym, pool, parking, power_backup, garden, security, club
  source: "nobroker" | "magicbricks" | "99acres"
})
// Returns: count, listings_preview (up to 25), unknown_localities (if any),
// unsupported_amenities (if any), unsupported_bhks (if any), alternatives
// (relaxation suggestions when results are thin)

get_listing_details({ id })
// Returns full listing record including description and amenities
```

I deliberately stopped at two. A `rank_listings` or `compare_listings` tool would be redundant — Claude already does ranking and comparison perfectly fine in prose given the listing data. More tools is more surface to break in a demo.

---

## Decisions log

These are the choices that aren't visible in the code but matter for the project.

### Why Haiku 4.5 over Sonnet/Opus?

For agentic flat search, the model needs to: parse natural language, pick tool calls correctly, follow a long system prompt, and write a final summary. Haiku 4.5 handles all of these reliably and costs ~5× less than Sonnet. The bottleneck is tool execution and network round-trips, not model capability. Sonnet would only meaningfully outperform Haiku on novel reasoning the demo doesn't exercise.

### Why two tools, not five?

Every additional tool widens the prompt, increases the chance of mis-routing, and creates more failure paths. Two tools that compose (`search`, then `get_details`) are enough to support every demo path I care about, including comparison and "which is best value." This is itself a taste signal: I deliberately did *less*.

### Why fuzzy locality matching over canonical-name validation?

Real users mistype. A strict "Koramangla doesn't exist, did you mean..." flow shifts cognitive load to the user. Levenshtein with a length-aware ceiling absorbs the typo invisibly and returns useful results. The trade-off — occasional false positives ("Pune" matching nothing) — surfaces explicitly via the tool's `unknown_localities` field.

### Why synthetic data?

NoBroker / MagicBricks / 99acres all explicitly prohibit scraping in their ToS, and their listing photos are copyrighted by individual owners. Ingesting their data into a product positioned as "skip the brokers" is the textbook scenario their legal teams pursue. The synthetic 132-listing dataset is structurally realistic (real Bangalore localities, realistic price bands per area, balanced source distribution) and lets the agent be evaluated on the engineering, not the data acquisition. A real version of this would either get listings via owner-direct uploads (NoBroker's actual model) or via a partner API.

### Why NDJSON over Server-Sent Events?

NDJSON (one JSON object per line) is simpler to parse in the browser than SSE (`event: …\ndata: …\n\n`). The semantics are the same — line-by-line streaming over HTTP. SSE's auto-reconnect on disconnect isn't useful here because each request is one logical conversation turn.

### Why no `useMemo` on the tools?

The tools array is a stable constant defined at module load. Memoizing wouldn't help and would add a hook to a function module that doesn't otherwise need React state.

### Why localStorage chat persistence?

Evaluators get the live URL, click it, type a query, sometimes refresh by accident. Losing the conversation on every refresh would be a worse demo experience than the very small risk of storage quota issues.

### Why light theme over dark?

It was originally dark — "Linear-for-real-estate" editorial. Switched to light cream/voyager-map after realizing the listing-photos read better on a light surface, and that the brief explicitly devalues polish (so spending effort on dark-mode visual signature is wasted budget). The light editorial palette still reads as considered, not generic.

---

## Tech stack

- **Next.js 16** App Router (Turbopack in dev)
- **React 18** functional components with hooks
- **Anthropic Messages API** via raw `fetch` (no SDK) for full control of the streaming loop
- **Claude Haiku 4.5** as the agent
- **Leaflet 1.9 + react-leaflet 4** for the map; CARTO Voyager tiles
- **react-markdown + remark-gfm** for rendering Claude's markdown output
- **Tailwind 3** for utility classes (and a small set of custom CSS variables in `globals.css`)
- **Vercel** for deployment

No state management library, no UI kit, no auth. The project is ~1000 lines of application code.

---

## What I deliberately left out

- **User accounts / saved listings / shortlists.** Demo product. Not in scope.
- **Real listings scraping.** ToS and copyright. Out of scope.
- **A `compare_listings` or `rank_by_value` tool.** Claude composes both via existing tools.
- **Voice input.** Demo-fragile (mic permission prompts).
- **Marker clustering.** Listings spread enough that overlap isn't a practical issue at default zoom.
- **A "real photo per real flat" pipeline.** Unsplash photos are licensed for commercial use and convey the right aesthetic without copyright risk.
- **Filter-chip pills as primary input.** The chat IS the input. Chips are a *consequence* of the agent's search.

---

## Honest limitations

- **132 listings.** A real product needs orders of magnitude more. Niche queries can run out of inventory (e.g. "Cunningham Road 1BHK with pool" hits 0).
- **Synthetic data.** Coordinates are jittered around real locality centroids; prices follow real bands but aren't real listings.
- **No commute calculation.** "Which has the shortest commute to Manyata" works because the agent reasons over locality + nearby tags, but there's no real distance/time calculation.
- **Image set is small.** ~14 photos rotate across 132 listings, so several listings share the same hero.
- **No marker clustering at extreme zoom-out.** Markers can visually overlap.

---

## Setup

```bash
git clone <repo>
cd trutent
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open http://localhost:3000.

### Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Get one at [console.anthropic.com](https://console.anthropic.com). Without it, the chat will display "API key not configured." but the rest of the UI still works. |

---

## Repo layout

```
app/
  api/chat/route.js     # The streaming agent loop. The heart of the product.
  globals.css           # Theme tokens.
  layout.jsx, page.jsx  # Root layout + main page.
components/
  Map.jsx               # Leaflet map + custom markers + soft area overlay.
  MapWrapper.jsx        # Dynamic import wrapper (Leaflet needs window).
  ChatWidget.jsx        # Streaming chat consumer with tool-call pills.
  ListingCard.jsx       # Slide-up detail panel with Unsplash hero + thumbnails.
lib/
  filterListings.js     # filterListings + fuzzy locality matcher + normalizers.
public/data/
  listings.json         # 132 synthetic Bangalore listings with photos.
scripts/
  gen-listings.mjs      # Seeded dataset generator (idempotent).
  add-photos.mjs        # Adds Unsplash photo URLs to each listing.
  test-filters.mjs      # Smoke tests for the filter (15 cases).
```

---

## What I'd build next

In rough priority order, things this project deliberately stopped short of:

- **A partner API integration** (MagicBricks has one) for real listings, replacing the synthetic data.
- **Commute calculation** via Google Maps Directions API — Claude could call a `get_commute_time` tool and rank by it.
- **WhatsApp delivery.** Users in India don't open web apps. The right product surface for "skip the brokers" is a WhatsApp bot that ingests your criteria and sends a daily digest.
- **Owner-direct submission flow** — the supply side of the marketplace. Without it, you're a pure aggregator and back in the data-acquisition problem.
