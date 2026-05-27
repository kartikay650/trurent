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

const STOCK_PHOTOS = [
  "1502672260266-1c1ef2d93688",
  "1560448204-e02f11c3d0e2",
  "1554995207-c18c203602cb",
  "1493809842364-78817add7ffb",
  "1522708323590-d24dbb6b0267",
  "1567767292278-a4f21aa2d36e",
  "1505691938895-1758d7feb511",
  "1556909114-f6e7ad7d3136",
  "1484154218962-a197022b5858",
  "1600585154340-be6161a56a0c",
  "1513584684374-8bab748fbf90",
  "1502672023488-70e25813eb80",
];

export function pickStockPhotos(seedKey) {
  const s = hashOf(seedKey);
  const picks = [];
  for (let k = 0; picks.length < 3 && k < STOCK_PHOTOS.length * 2; k++) {
    const id = STOCK_PHOTOS[(s + k * 7) % STOCK_PHOTOS.length];
    if (!picks.includes(id)) picks.push(id);
  }
  return picks.map(
    (id) =>
      `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`,
  );
}

export function daysAgoFromUnix(unixSeconds) {
  return Math.max(1, Math.floor((Date.now() / 1000 - unixSeconds) / 86400));
}

export function daysAgoFromIso(iso) {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / (86400 * 1000)));
}
