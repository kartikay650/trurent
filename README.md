# TruRent

**Skip the brokers. Find your Bangalore flat by talking to an agent.**

> **Live:** [trurent-five.vercel.app](https://trurent-five.vercel.app/)

TruRent is an AI-powered rental search for Bangalore. Tell the agent what you want in plain English and it searches over real, current listings scraped from Reddit, with the map zooming and pruning as it works. Every listing links back to the original post so you can contact the person who put it up.

Every day at 3am IST, a cron job rescrapes Reddit, regenerates the dataset, and the site picks up the new data automatically.

---

## How it works for renters

Open the site, talk to the agent. Try things like:

1. **`I work at Manyata, looking for 1-2 BHK under 25k with zero brokerage`**
   The agent knows that Manyata maps to Hebbal and Hennur, builds the filter, the map flies there.

2. **`Which one has a gym?`** *(as a follow-up)*
   It remembers everything from the previous turn and just adds an amenity. Filter chips update, markers prune.

3. **`Compare the top two`**
   The agent calls a different tool (`get_listing_details`) on the two listings and writes a real comparison citing rent, amenities, etc.

4. **`2-3 bhk in koramangla under 70k`** *(deliberate typo)*
   Fuzzy locality matching catches the typo. Returns results that strict matching would miss.

5. **`Find me a flat in Mumbai`**
   The agent is Bangalore-only and redirects politely. Doesn't waste a tool call.

6. **`Show me everything`**
   Resets, shows all current listings, gives a written breakdown by BHK and price.

There's also a manual **Filters** button next to the count for renters who prefer toggling chips over chatting. Both interfaces feed the same filter state.

---

## What's actually hard about a rental search agent

The "natural language → structured filters" pattern is everywhere. What makes it hard to do well isn't the translation, it's everything *around* it:

- **Renters misspell localities.** "Koramangla", "Indranagar", "Whitfield" are normal.
- **Renters use ranges.** "2-3 BHK" must become `[2, 3]`, not be guessed.
- **Renters mention things the schema doesn't carry.** "with wifi" should fail gracefully, not silently drop all results.
- **Renters mention places that don't exist in the dataset.** "Mumbai" needs an honest "we're Bangalore-only", not a confusing zero-result.
- **Renters want comparisons, not lists.** "Which has the shortest commute" requires multi-step reasoning, not a single search.
- **Zero results need recovery paths**, not dead ends. "0 in Bannerghatta" → *"Nothing matched there. Try JP Nagar nearby (8 options)?"*

A wrapper around `gpt-4` that emits JSON fails almost all of these. TruRent's agent handles all of them.

---

## Architecture

```
Browser
  ChatWidget   (streaming NDJSON consumer with tool-call pills)
  FilterPanel  (manual chip-based filtering)
  Map          (react-leaflet, custom price-pill markers)
  ListingCard  (slide-up panel with Reddit attribution)
                     |
                     | POST /api/chat (NDJSON stream)
                     v
Next.js App Router /api/chat/route.js
  Agentic loop (max 6 iterations)
    fetch -> parse SSE -> execute tools -> loop
  Streams NDJSON events back as it goes:
    text_delta, tool_use_start, tool_result,
    filters_update, turn_summary, done
                     |
                     | tool calls run server-side
                     v
  search_listings(filters)   runs filterListings()
  get_listing_details(id)    looks up by id
                     |
                     | SSE
                     v
Anthropic API (claude-haiku-4-5-20251001)
  Streaming, multi-turn, tool use


[Daily refresh, separate cron]
  GitHub Actions @ 21:30 UTC
       |
       v
  scripts/scrape-reddit.mjs
    Reddit JSON endpoints  ->  local pre-filter
    ->  Haiku 4.5 extraction  ->  Nominatim geocoding
       |
       v
  public/data/listings.json + meta.json
       |
       | auto-commit + push
       v
  Vercel redeploys
```

### The agent loop

`/api/chat` opens an SSE stream to Anthropic with a system prompt and two tool definitions. Claude streams back text deltas and tool-use blocks. When a tool-use block completes, the server runs it locally (calls `filterListings` over the in-memory dataset), feeds the result back in a new Anthropic call, and continues. The loop ends when Claude's `stop_reason` is `end_turn`. Every event Claude emits is forwarded to the browser as NDJSON, so the UI shows the agent's reasoning live.

### Tools (deliberately small)

```js
search_listings({
  maxRent, minRent,            // INR per month
  bhk: [1] | [2] | [2, 3],     // array, supports ranges
  localities: string[],         // fuzzy-matched server-side
  furnished: "fully" | "semi" | "unfurnished",
  noBrokerageOnly: boolean,
  amenities: string[]
})
// Returns: count, listings_preview, unknown_localities (if any),
// unsupported_amenities (if any), unsupported_bhks (if any),
// alternatives (relaxation suggestions when results are thin)

get_listing_details({ id })
// Returns the full listing record
```

Two tools cover every UX pattern: search, follow-up, comparison, "which is best". Adding more tools widens the prompt and creates failure modes without adding capability.

### The scraper

```
1. Pull from Reddit's public JSON endpoints (no auth):
     r/bangalorerentals (49k subs)  - primary
     r/BangaloreFlatsRental (11k)   - primary
     r/bangalore, r/Bengaluru       - secondary, search-mode
2. Time-window filter: keep posts < 120 days old.
3. Local regex pre-filter to drop obvious non-listings.
4. Claude Haiku 4.5 extraction with a strict offer-vs-wanted prompt.
   Returns structured JSON or {is_listing: false}.
5. Nominatim geocoding of the post's mentioned address.
   Falls back to neighbourhood centroid + jitter if Nominatim misses.
6. Write public/data/listings.json + meta.json.
```

The pipeline is source-agnostic. Swap the Reddit fetcher for a MagicBricks partner API or an owner-direct upload form, and the rest of the pipeline doesn't change.

---

## Key decisions

### Why Reddit, not scraping NoBroker / MagicBricks / 99acres

NoBroker, MagicBricks, and 99acres all explicitly prohibit scraping in their terms of service. Their listing photos are copyrighted by individual owners. Ingesting their data into a product positioned as "skip the brokers" invites the exact legal exposure their teams pursue.

Reddit posts in r/bangalorerentals and r/BangaloreFlatsRental are public content posted by individuals offering their flats directly. Reddit's own JSON endpoints surface them, no auth or ToS violation needed. Each listing links back to the original post so renters can contact the owner directly.

Reddit isn't a dense rental marketplace (compared to NoBroker scale), but the yield is solid: 13% of fresh posts in the rental-specific subs are confirmed listings. The path to scale is owner-direct uploads or a partner-API integration on top of the existing pipeline.

### Why two tools, not five

Every additional tool widens the prompt, makes mis-routing more likely, and adds failure modes. Two tools that compose (`search` then `get_details`) cover every UX pattern including comparison and value-ranking. Claude composes the rest in prose.

### Why Haiku 4.5 and not Sonnet or Opus

For this agent's job (parse natural language, pick tool calls, follow a long system prompt, write a final summary), Haiku 4.5 is more than enough and costs ~5x less than Sonnet. The bottleneck is network round-trips and tool execution, not model capability. Matching the model to the actual task is also a cost-control move at scale.

### Why fuzzy locality matching

Real users mistype. A flow that says "Koramangla isn't a place, did you mean..." shifts the burden back. Levenshtein matching with a length-aware ceiling absorbs the typo silently and returns useful results. The trade-off (occasional false positive on names that aren't really Bangalore) is surfaced explicitly via the tool's `unknown_localities` field.

### Why daily refresh, not real-time

Reddit posts about flats don't move that fast. A daily refresh catches yesterday's posts, which is sufficient for renters checking once or twice a week. Real-time would require streaming webhooks Reddit doesn't expose (and the Pushshift Reddit-of-old is dead). The cron job is cheap to run and the data is fresh enough.

### Why NDJSON, not Server-Sent Events

NDJSON (one JSON object per line) is much easier to parse in the browser than SSE. Same semantics, less code. SSE's auto-reconnect feature isn't useful since each request is one logical agent loop, not a long-lived stream.

### Why localStorage chat persistence

Users return mid-conversation. Refreshing wipes the conversation otherwise. localStorage is 10 lines of code and avoids a whole class of UX friction.

---

## Tech stack

- **Next.js 16** App Router (Turbopack in dev)
- **React 18** functional components
- **Anthropic Messages API** via raw `fetch` (no SDK, for full streaming-loop control)
- **Claude Haiku 4.5** as the agent
- **Leaflet 1.9 + react-leaflet 4** for the map, CARTO Voyager tiles
- **react-markdown + remark-gfm** for rendering Claude's markdown output
- **Tailwind 3** utility classes, custom CSS variables in `globals.css`
- **GitHub Actions** for the daily scrape cron
- **Vercel** for hosting

No state management library, no UI kit, no auth.

---

## What's intentionally not in v1

- **User accounts, saved listings, shortlists.** Adds state complexity. The chat-based UX doesn't need an account.
- **Voice input.** Mic-permission prompts on first interaction kill conversion.
- **Marker clustering at extreme zoom-out.** Listings spread enough that overlap isn't a practical issue.
- **Real-time scrape on demand.** Daily is sufficient for the data pattern.

---

## Roadmap

In rough priority order:

- **Owner-direct submissions.** Currently the dataset is read-only and sourced from Reddit. Adding a "post your flat" form (with auth, phone verification, basic abuse screening) is the supply-side play that makes this a real marketplace, not just an aggregator.
- **Partner integrations.** A MagicBricks or 99acres partner-API hookup would 10x the inventory. The scraper's pipeline (`extract → geocode → write`) is source-agnostic, so plugging in a new source is mostly authentication and rate-limit plumbing.
- **`get_commute_time` tool.** Adds Google Maps Directions API so the agent can answer "shortest commute to ITPL" with real numbers, not heuristic locality matching.
- **WhatsApp delivery.** Indian renters live in WhatsApp. A bot that takes the same query and pings new matching listings as they appear is the right surface for many users.
- **Listing freshness expiry.** Posts older than ~90 days probably aren't available anymore. Either expire them automatically or HEAD-check and remove if the Reddit post got deleted.
- **Trust + safety pass.** Spam filter on user-posted listings, phone-number masking, abuse reports.

---

## Current state at a glance

- **131 listings** sourced from Reddit, refreshed daily
- **26 localities** covered (Sarjapur Road, Whitefield, Indiranagar, Bellandur, Mahadevapura, HSR Layout, Koramangala lead)
- **Posts under 120 days old** by construction; UI shows "updated Xh ago"
- **Rent range** ₹5k–₹83k
- **BHK split** heavily 1BHK (85/131) — most r/bangalorerentals posts are room-shares in 2/3BHK flats
- **Geocoded** 5 / 131 pinned by Nominatim; the rest fall back to neighbourhood centroid + jitter. Reddit posts often reference apartment-complex names that OSM doesn't index.

---

## Running it locally

```bash
git clone https://github.com/kartikay650/trurent
cd trutent
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To re-scrape locally:

```bash
export ANTHROPIC_API_KEY=...
node scripts/scrape-reddit.mjs
```

Output: `public/data/listings.json` and `public/data/meta.json`.

### Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Get one at [console.anthropic.com](https://console.anthropic.com). Without it, chat returns "API key not configured." but the rest of the UI still works. |

### Optional scraper env vars

| Variable | Default | Notes |
|---|---|---|
| `REDDIT_USER_AGENT` | `web:TruRent:v1.0` | Sent on Reddit + Nominatim calls. Both services expect a real UA. |
| `MAX_AGE_DAYS` | `120` | Drop posts older than this. |
| `NOCACHE` | (unset) | Set to `1` to force a fresh Reddit pull (skips the local cache). |

### Repo secrets for the daily cron

The `.github/workflows/update-listings.yml` job needs one repo secret:

| Secret | Why |
|---|---|
| `ANTHROPIC_API_KEY` | The scraper calls Haiku to extract structured data from posts |

Add it at: **Settings → Secrets and variables → Actions → New repository secret.**

---

## Repo layout

```
app/
  api/chat/route.js     The streaming agent loop. The core of the product.
  globals.css           Theme tokens.
  layout.jsx, page.jsx  Root layout + main page.
components/
  Map.jsx               Leaflet map, custom markers, soft area overlay.
  MapWrapper.jsx        Dynamic import wrapper (Leaflet needs window).
  ChatWidget.jsx        Streaming chat consumer with tool-call pills.
  ListingCard.jsx       Slide-up detail panel with Reddit attribution.
  FilterPanel.jsx       Manual filter controls (toggles + chips).
lib/
  filterListings.js     The filter, fuzzy locality matcher, normalizers.
public/data/
  listings.json         Current Bangalore rental listings from Reddit.
  meta.json             Scrape timestamp, listing count, source breakdown.
scripts/
  scrape-reddit.mjs     Reddit JSON fetch -> local filter -> Haiku
                        extraction -> Nominatim geocoding -> listings.json.
  test-filters.mjs      Smoke tests for the filter (15 cases).
.github/workflows/
  update-listings.yml   Daily cron that re-runs the scraper and commits
                        any changes back to main. Vercel auto-redeploys.
```
