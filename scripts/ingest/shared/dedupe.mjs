// Cross-source dedupe. Same listing can appear on Reddit + OLX + Telegram.
// Two passes:
//   1. Hard dedupe within a single source by post id (handled by Supabase upsert).
//   2. Soft dedupe across sources by content similarity.
//
// Soft signal: same locality + same rent + same bhk + posted within N days
// → likely the same listing posted in multiple places.

const SOURCE_PRIORITY = {
  owner: 5,
  telegram: 4,
  reddit: 3,
  olx: 2,
  twitter: 1,
};

// Is `candidate` a duplicate of any listing in `existing`?
// Returns the existing listing it duplicates, or null.
export function findSoftDuplicate(candidate, existing, windowDays = 7) {
  for (const e of existing) {
    if (e.locality !== candidate.locality) continue;
    if (e.bhk !== candidate.bhk) continue;
    // Rent has to be within 5% (handles "per person" vs "per room" rounding)
    const rentDiff = Math.abs(e.rent - candidate.rent) / Math.max(e.rent, 1);
    if (rentDiff > 0.05) continue;
    // Within N days of each other
    const eDate = new Date(e.postedAt).getTime();
    const cDate = new Date(candidate.postedAt).getTime();
    if (Math.abs(eDate - cDate) > windowDays * 86400 * 1000) continue;
    return e;
  }
  return null;
}

// When a soft-duplicate is found, decide which to keep.
// Higher priority source wins; tiebreaker is newer post.
export function preferred(a, b) {
  const pa = SOURCE_PRIORITY[a.source] ?? 0;
  const pb = SOURCE_PRIORITY[b.source] ?? 0;
  if (pa !== pb) return pa > pb ? a : b;
  return new Date(a.postedAt) > new Date(b.postedAt) ? a : b;
}
