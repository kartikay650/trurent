# TruRent

**Skip the brokers. Find your Bangalore flat by talking to an agent.**

> **Live demo:** [trurent-five.vercel.app](https://trurent-five.vercel.app/)
> **Submission:** Activate AI Fellowship 2026

A streaming AI agent that turns plain English into a structured Bangalore flat search, running over **131 real rental listings scraped fresh from Reddit** (r/bangalorerentals, r/BangaloreFlatsRental, r/Bengaluru) and refreshed daily by an automated GitHub Actions cron. Built for the Activate AI Fellowship application.

You type something like *"2BHK in Koramangala under 30k"* and the agent builds a structured filter, runs it, and the map zooms in. If you follow up with *"which has a gym?"*, it remembers everything you said before and adds the new filter. Every listing links back to its original Reddit post so you can actually contact the person who posted it.

I wanted it to feel like talking to a Bangalore local who knows the neighbourhoods, not like filling out a search form.

---

## How to play with it

Try these in order. Each one shows off something different the agent does:

1. **`I work at Manyata, looking for 1-2 BHK under 25k with zero brokerage`**
   It maps "Manyata" to the right neighbourhoods (Hebbal, Hennur), builds the filter, the map flies north.

2. **`Which one has a gym?`** *(as a follow-up)*
   It remembers everything from the previous turn and just adds an amenity. The filter chips update, the markers prune.

3. **`Compare the top two`**
   The agent calls a different tool (get_listing_details) on the two listings and writes a real comparison citing rent, amenities, etc. This is the moment where you can tell it's not just a "chat to filter" wrapper.

4. **`2-3 bhk in koramangla under 70k`** *(I typoed Koramangala on purpose)*
   Fuzzy locality match catches the typo. Returns 10 results that would have been 0 with strict matching.

5. **`Find me a flat in Mumbai`**
   It knows we're Bangalore-only and politely redirects. Doesn't waste a tool call.

6. **`Show me everything`**
   Resets, shows all 131 real listings, gives a written breakdown by BHK and price.

---

## Why this was harder than I expected

When I started, I thought "AI takes text, returns JSON filters" would be the whole thing. It absolutely was not. The actual hard part is every real user does at least one of these:

- Misspells locality names. ("Koramangla", "Indranagar", "Whitfield" all came up in my testing.)
- Uses ranges instead of exact values. "2-3 BHK" needs to mean `[2, 3]`, not a guess.
- Mentions things the schema doesn't carry. "with wifi" should fail gracefully, not silently kill all results.
- Mentions places that aren't in the data at all. "Mumbai" should be an honest "we don't have that," not a confusing zero-result.
- Asks for comparisons, not lists. "Which has the shortest commute?" needs the model to actually reason, not just search.
- Hits zero results constantly. A search with no recovery path is a dead end. The agent has to know how to relax filters and offer alternatives.

A simple wrapper around `gpt-4` that emits JSON fails almost all of these. Most of my time went into making the agent recover gracefully from the edge cases above.

---

## What it actually is, architecturally

```
Browser
  ChatWidget   (streaming NDJSON consumer with tool-call pills)
  Map          (react-leaflet, custom price-pill markers)
  ListingCard  (slide-up panel with Unsplash hero + thumbs)
                     |
                     | POST /api/chat (NDJSON stream)
                     v
Next.js App Router /api/chat/route.js
  Agentic loop (max 6 iterations)
    fetch -> parse SSE -> execute tools -> loop
  Streams NDJSON back as it goes:
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
```

### The agent loop in one paragraph

The `/api/chat` route opens an SSE stream to Anthropic with a system prompt and two tool definitions. Claude streams back text deltas and tool-use blocks. When a tool-use block completes, the server runs it locally (calls `filterListings` over the in-memory dataset), feeds the result back in a new Anthropic call, and continues. The loop ends when Claude's `stop_reason` is `end_turn`. Every event Claude emits (text tokens, tool calls, tool results) gets forwarded to the browser as NDJSON, so the UI shows the agent's reasoning live. That's why you see the "Searching listings..." pill that flips to "Found 5" before the text response shows up.

### Tools (kept deliberately small)

```js
search_listings({
  maxRent, minRent,            // INR per month
  bhk: [1] | [2] | [2, 3],     // array, supports ranges
  localities: string[],         // fuzzy-matched server-side
  furnished: "fully" | "semi" | "unfurnished",
  noBrokerageOnly: boolean,
  amenities: string[],
  source: "nobroker" | "magicbricks" | "99acres"
})
// Returns: count, listings_preview, unknown_localities (if any),
// unsupported_amenities (if any), unsupported_bhks (if any),
// alternatives (relaxation suggestions when results are thin)

get_listing_details({ id })
// Returns the full listing record
```

I stopped at two tools on purpose. A `rank_listings` or `compare_listings` tool would be redundant. Claude already does both perfectly fine in prose, given the listing data. More tools is more surface area to break in a demo.

---

## Decisions I made and why

These are the calls that aren't visible in the code but matter to anyone evaluating the project.

### Why Haiku 4.5 and not Sonnet or Opus

For this agent's job (parse natural language, pick tool calls, follow a long system prompt, write a final summary), Haiku 4.5 is more than enough and costs ~5x less than Sonnet. The bottleneck is network round-trips and tool execution, not model capability. Sonnet would only beat Haiku on novel reasoning the demo doesn't really test. Picking Haiku is itself a small taste signal: I matched the model to the actual difficulty of the task.

### Why two tools, not five

Every additional tool widens the prompt, makes mis-routing more likely, and adds more failure modes. Two tools that compose (`search`, then `get_details`) cover every demo path I care about, including comparison and "which is best value." This is the part of the project I'd defend hardest. I deliberately did less.

### Why fuzzy locality matching instead of strict validation

Real users mistype. A flow that says "Koramangla isn't a place, did you mean Koramangala?" shifts the burden back onto the user. Levenshtein matching with a length-aware ceiling absorbs the typo silently and returns useful results. The trade-off (occasional mismatch on things like "Pune" that aren't really Bangalore) is surfaced explicitly via the tool's `unknown_localities` field.

### Why Reddit, not scraped NoBroker / MagicBricks / 99acres

NoBroker, MagicBricks, and 99acres all explicitly prohibit scraping in their terms of service. Their listing photos are copyrighted by individual owners. Ingesting their data into a product positioned as "skip the brokers" is exactly the kind of thing their legal teams pursue. So I sourced from Reddit instead.

Reddit posts in subs like r/bangalorerentals (49k subscribers) and r/BangaloreFlatsRental (11k) are public content posted by individuals offering their flats directly. Reddit's own public JSON endpoints surface them, no auth or ToS violation needed. Each listing in the dataset links back to its original Reddit post so renters can contact the owner directly.

The pipeline pulls from 11 subreddit+query combinations, filters for posts under 120 days old, and runs each candidate through Claude Haiku 4.5 with a strict "offer vs wanted" prompt. Out of 1,026 fresh posts scraped, 131 are confirmed listings — a 13% yield, ~5x what the old PullPush-based pipeline produced. The rest are wanted ads, complaints, market discussions, or scam alerts.

The dataset auto-refreshes every day at 3am IST via a GitHub Actions cron job that re-runs the scraper and commits any changes. Vercel auto-redeploys on every commit, so the live site always has the latest listings.

### Why the pipeline matters more than the data count

The dataset is small but the pipeline is source-agnostic. `scrape-reddit.mjs` does: fetch → local filter → LLM extract → geocode → write. Swap the fetcher for a MagicBricks partner API and the rest of the pipeline doesn't change. The agent doesn't care where the listings came from. That's the scaling story.

### Why NDJSON, not Server-Sent Events

NDJSON (one JSON object per line) is much easier to parse in the browser than SSE. Same semantics, less code. SSE's auto-reconnect feature isn't useful here because each request is one logical agent loop, not a long-lived stream.

### Why localStorage chat persistence

Evaluators will get this link, click it, type stuff, sometimes refresh by accident. Wiping the conversation on every refresh would feel broken. localStorage is 10 lines of code and avoids that whole class of frustration.

### Why light theme

I started with a dark editorial palette ("Linear for real estate"). Switched to light cream halfway through because (1) the listing photos read way better on a light surface, and (2) the fellowship brief explicitly says they don't care about polish, so pouring time into a dark-mode visual signature was wasted effort.

---

## Tech stack

- Next.js 16 with the App Router (Turbopack in dev)
- React 18 functional components
- Anthropic Messages API via raw `fetch` (no SDK, full control of the streaming loop)
- Claude Haiku 4.5 as the agent
- Leaflet 1.9 plus react-leaflet 4 for the map, CARTO Voyager tiles
- react-markdown plus remark-gfm for rendering Claude's markdown output
- Tailwind 3 utilities, custom CSS variables in `globals.css`
- Vercel for hosting

No state management library, no UI kit, no auth. Roughly 1000 lines of application code.

---

## What I deliberately left out

- User accounts, saved listings, shortlists. It's a demo. Out of scope.
- Scraping NoBroker / MagicBricks / 99acres directly. Legal reasons covered above. Reddit gave us real data without ToS issues.
- A `compare_listings` or `rank_by_value` tool. Claude composes both with the existing tools.
- Voice input. Demo-fragile (mic permission prompts on first interaction).
- Marker clustering. Listings spread out enough that overlap isn't an issue at default zoom.
- Real photos per real flat. Unsplash photos are licensed for commercial use and convey the right look without copyright risk.
- Filter chip pills as the primary input. The chat IS the input. Chips are a consequence of what the agent searched for, not a separate UI.

---

## Honest limitations

- **131 real listings, refreshed daily.** A production version still needs orders of magnitude more. Some niche queries hit zero (e.g. "Banashankari 3BHK with pool").
- **Coverage skews to ORR + Whitefield.** Top localities are Sarjapur Road (17), Whitefield (12), Indiranagar (12), Bellandur (11), Mahadevapura (11), HSR Layout (9), Koramangala (7). South Bangalore (Banashankari, Jayanagar) is sparse because that's where Reddit usage is sparse.
- **BHK is skewed to 1BHK** (85 / 131). Most posts on r/bangalorerentals are flatmate-replacement listings where a single room in a 2/3BHK is being offered. The rent is per-room and Haiku correctly maps these to 1BHK. It's a real Bangalore renting pattern, not a data artifact.
- **Geocoding hit rate is low** (5 / 131 listings pinned by Nominatim). Reddit posts often reference apartment-complex names ("Sobha Hibiscus", "Mantri Premero", "Purva Sunshine") that OpenStreetMap doesn't index. The rest fall back to the neighbourhood centroid + small jitter, so the map still spreads pins reasonably.
- **No real commute calculation.** "Which has the shortest commute to Manyata" works via locality reasoning, but there's no actual distance or time math.
- **About 12 Unsplash photos rotate** across all listings, so several share the same hero shot.
- **No marker clustering at extreme zoom-out.**

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

Without an API key the rest of the UI still works, but the chat just says "API key not configured."

---

## Repo layout

```
app/
  api/chat/route.js     The streaming agent loop. The heart of the product.
  globals.css           Theme tokens.
  layout.jsx, page.jsx  Root layout + main page.
components/
  Map.jsx               Leaflet map, custom markers, soft area overlay.
  MapWrapper.jsx        Dynamic import wrapper (Leaflet needs window).
  ChatWidget.jsx        Streaming chat consumer with tool-call pills.
  ListingCard.jsx       Slide-up detail panel.
lib/
  filterListings.js     The filter, fuzzy locality matcher, normalizers.
public/data/
  listings.json         131 real Bangalore rental listings scraped from Reddit.
  meta.json             Scrape timestamp, listing count, source breakdown.
scripts/
  scrape-reddit.mjs     The pipeline: Reddit JSON fetch -> local filter -> Haiku
                        extraction -> Nominatim geocoding -> listings.json.
  gen-listings.mjs      (Unused after the Reddit pivot.) Seeded synthetic
                        dataset generator. Kept for reference.
  add-photos.mjs        (Unused after the Reddit pivot.) Adds Unsplash photos.
  test-filters.mjs      Smoke tests for the filter (15 cases).
.github/workflows/
  update-listings.yml   Daily cron that re-runs the scraper and commits any
                        changes back to main. Vercel auto-redeploys.
```
