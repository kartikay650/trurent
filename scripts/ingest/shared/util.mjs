// Cross-source utilities: sleep, hash, jitter, photo picker, day calculations.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hashOf(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = ((h << 5) - h + String(str).charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Small deterministic offset so multiple listings in the same locality don't
// stack exactly on top of each other when we fall back to centroid coords.
export function jitter(seed) {
  return ((hashOf(seed) % 1000) / 1000 - 0.5) * 0.006;
}

export function daysAgoFromUnix(unixSeconds) {
  return Math.max(1, Math.floor((Date.now() / 1000 - unixSeconds) / 86400));
}

export function daysAgoFromIso(iso) {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / (86400 * 1000)));
}
