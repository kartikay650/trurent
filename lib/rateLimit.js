// Simple in-memory IP rate limiter.
//
// Good enough for a single-region Vercel deployment with low-to-moderate
// traffic. For multi-region or higher scale, swap this for Upstash Redis
// (interface is the same: take/peek by key, return remaining + retry-after).
//
// Strategy: sliding-window counters per IP, kept in a Map. A cleanup pass
// runs lazily on each call to drop entries older than the window.

const buckets = new Map();
let lastCleanup = 0;

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();

  // Lazy cleanup: drop stale buckets at most once per minute.
  if (now - lastCleanup > 60_000) {
    const cutoff = now - windowMs;
    for (const [k, b] of buckets) {
      if (b.resetAt < cutoff) buckets.delete(k);
    }
    lastCleanup = now;
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterMs = allowed ? 0 : bucket.resetAt - now;

  return {
    allowed,
    remaining,
    retryAfterMs,
    resetAt: bucket.resetAt,
  };
}

// Extract a best-effort client IP from Vercel/standard headers.
export function clientIp(req) {
  const h = (name) => req.headers.get?.(name) || "";
  const xff = h("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h("x-real-ip") || h("cf-connecting-ip") || "unknown";
}
