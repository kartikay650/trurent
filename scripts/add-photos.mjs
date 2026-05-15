// Augment public/data/listings.json with a `photos` field per listing.
// Photos are direct Unsplash CDN URLs, distributed by furnished level so the
// hero shot of a "fully furnished" flat looks more polished than an unfurnished one.
import { readFileSync, writeFileSync } from "node:fs";

const PATH = "public/data/listings.json";
const listings = JSON.parse(readFileSync(PATH, "utf8"));

// Curated Unsplash photo IDs of apartment interiors/exteriors. These are
// long-standing popular CC0 photos that are very unlikely to disappear.
// Each ID is rendered via `https://images.unsplash.com/photo-{id}?w={w}&q=80`.
const PHOTOS = {
  fully: [
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
  ],
  semi: [
    "1493809842364-78817add7ffb",
    "1505691938895-1758d7feb511",
    "1556909114-f6e7ad7d3136",
    "1484154218962-a197022b5858",
    "1502672023488-70e25813eb80",
    "1554995207-c18c203602cb",
    "1567767292278-a4f21aa2d36e",
    "1502672260266-1c1ef2d93688",
  ],
  unfurnished: [
    "1513584684374-8bab748fbf90",
    "1502672023488-70e25813eb80",
    "1556909114-f6e7ad7d3136",
    "1484154218962-a197022b5858",
    "1505691938895-1758d7feb511",
    "1556909114-f6e7ad7d3136",
  ],
};

// Deterministic seeded pick from id string so the same listing always gets
// the same photos across runs.
function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickPhotos(listing) {
  const pool = PHOTOS[listing.furnished] || PHOTOS.semi;
  const seed = hashOf(listing.id);
  // 3 distinct photos per listing (hero + 2 thumbnails). Cycle through pool
  // with seed-driven offsets, ensuring uniqueness inside a single listing.
  const picks = [];
  for (let k = 0; picks.length < 3 && k < pool.length * 2; k++) {
    const idx = (seed + k * 7) % pool.length;
    const id = pool[idx];
    if (!picks.includes(id)) picks.push(id);
  }
  return picks.map((id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`);
}

const updated = listings.map((l) => ({ ...l, photos: pickPhotos(l) }));

const body =
  "[\n" + updated.map((l) => "  " + JSON.stringify(l)).join(",\n") + "\n]\n";
writeFileSync(PATH, body);

console.log(`Wrote ${updated.length} listings with photos.`);
console.log(`Sample hero: ${updated[0].photos[0]}`);
