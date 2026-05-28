// Nominatim geocoder. Public, free, rate-limited at 1 req/sec.
// Falls back to locality centroid if Nominatim returns nothing.

import { USER_AGENT } from "./env.mjs";
import { sleep, jitter } from "./util.mjs";
import { LOCALITY_GEO, inBangalore } from "./locality.mjs";

const BASE = "https://nominatim.openstreetmap.org/search";

export async function nominatim(query) {
  const full = `${query}, Bangalore, Karnataka, India`;
  const url = `${BASE}?q=${encodeURIComponent(full)}&format=json&limit=1&countrycodes=in`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = parseFloat(arr[0].lat);
    const lng = parseFloat(arr[0].lon);
    if (!inBangalore(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

// High-level: try Nominatim, fall back to locality centroid + jitter.
// Adds a 1.1s sleep AFTER the Nominatim call to respect their policy.
// Returns { lat, lng, geoSource }.
export async function geocodeListing(parsed, seedKey) {
  const query = parsed.location_query || parsed.locality;
  const geo = await nominatim(query);
  await sleep(1100);

  if (geo) {
    return {
      lat: +geo.lat.toFixed(5),
      lng: +geo.lng.toFixed(5),
      geoSource: "nominatim",
    };
  }
  // Defensive fallback: if Claude somehow handed us a locality that isn't in
  // our canonical list (shouldn't happen — validateParsed gates this — but a
  // missing key here would crash the whole run with an opaque destructure
  // error), fall back to Bangalore city centre rather than throwing.
  const centroid = LOCALITY_GEO[parsed.locality] || [12.9716, 77.5946];
  const [baseLat, baseLng] = centroid;
  return {
    lat: +(baseLat + jitter(seedKey)).toFixed(5),
    lng: +(baseLng + jitter(seedKey + "x")).toFixed(5),
    geoSource: "locality_centroid",
  };
}
