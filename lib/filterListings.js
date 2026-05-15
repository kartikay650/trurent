// ---------- normalization & tolerance helpers ----------

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Levenshtein with an early-exit ceiling. Saves work on obvious mismatches.
function levenshtein(a, b, ceiling = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > ceiling) return ceiling + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function localityMatches(userInput, dataLocality) {
  const a = normalize(userInput);
  const b = normalize(dataLocality);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true; // "hsr" matches "hsrlayout"
  // Allow more slack for longer names: typos in long words are common
  const ceiling = Math.max(2, Math.floor(Math.max(a.length, b.length) / 6));
  return levenshtein(a, b, ceiling) <= ceiling;
}

// Canonicalize Claude-supplied values into our schema vocabulary.
const FURNISHED_ALIAS = {
  fully: "fully",
  full: "fully",
  furnished: "fully",
  fullyfurnished: "fully",
  semi: "semi",
  semifurnished: "semi",
  partial: "semi",
  partiallyfurnished: "semi",
  unfurnished: "unfurnished",
  none: "unfurnished",
  bare: "unfurnished",
  empty: "unfurnished",
};
function normalizeFurnished(value) {
  return FURNISHED_ALIAS[normalize(value)] ?? null;
}

const AMENITY_ALIAS = {
  gym: "gym",
  fitness: "gym",
  gymnasium: "gym",
  pool: "pool",
  swimmingpool: "pool",
  swimming: "pool",
  parking: "parking",
  carparking: "parking",
  garage: "parking",
  powerbackup: "power_backup",
  power: "power_backup",
  generator: "power_backup",
  backup: "power_backup",
  ups: "power_backup",
  garden: "garden",
  lawn: "garden",
  greenery: "garden",
  security: "security",
  guard: "security",
  gated: "security",
  cctv: "security",
  watchman: "security",
  club: "club",
  clubhouse: "club",
};
function normalizeAmenity(value) {
  return AMENITY_ALIAS[normalize(value)] ?? null;
}

const SOURCE_ALIAS = {
  nobroker: "nobroker",
  nb: "nobroker",
  magicbricks: "magicbricks",
  mb: "magicbricks",
  "99acres": "99acres",
  acres: "99acres",
  acres99: "99acres",
};
function normalizeSource(value) {
  return SOURCE_ALIAS[normalize(value)] ?? null;
}

// ---------- the filter ----------

export function filterListings(listings, filters = {}) {
  return listings.filter((l) => {
    if (filters.maxRent != null && l.rent > filters.maxRent) return false;
    if (filters.minRent != null && l.rent < filters.minRent) return false;

    // bhk: accept number OR array of numbers
    if (filters.bhk != null) {
      const allowed = Array.isArray(filters.bhk)
        ? filters.bhk.map(Number)
        : [Number(filters.bhk)];
      if (!allowed.includes(l.bhk)) return false;
    }

    if (Array.isArray(filters.localities) && filters.localities.length > 0) {
      const hit = filters.localities.some((q) => localityMatches(q, l.locality));
      if (!hit) return false;
    }

    if (filters.furnished != null && filters.furnished !== "") {
      const canon = normalizeFurnished(filters.furnished);
      if (canon && l.furnished !== canon) return false;
    }

    if (filters.noBrokerageOnly === true && l.brokerage !== 0) return false;

    if (Array.isArray(filters.amenities) && filters.amenities.length > 0) {
      const have = l.amenities || [];
      for (const raw of filters.amenities) {
        const canon = normalizeAmenity(raw);
        if (!canon) continue; // unknown amenity → don't reject on it
        if (!have.includes(canon)) return false;
      }
    }

    if (filters.source != null && filters.source !== "") {
      const canon = normalizeSource(filters.source);
      if (canon && l.source !== canon) return false;
    }

    return true;
  });
}

// ---------- formatting helpers ----------

export function formatINR(n) {
  return Number(n).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function shortRent(n) {
  if (n < 1000) return `₹${n}`;
  const k = n / 1000;
  const s = k.toFixed(1).replace(/\.0$/, "");
  return `₹${s}k`;
}

export { localityMatches, normalizeFurnished, normalizeAmenity, normalizeSource };

// Smoke counts against public/data/listings.json (132 listings).
// Run scripts/test-filters.mjs to verify these and the tolerance features.
// Test 1: maxRent 20000 → 35
// Test 2: bhk 1 → 36
// Test 3: noBrokerageOnly true → 54
// Test 4: bhk 2 + maxRent 25000 → 25
// Test 5: source "nobroker" → 51
// Tolerance: localities ["Koramangla"] → 9 (fuzzy match to Koramangala)
// Tolerance: bhk [2,3] + 50–70k + 3 areas → 10 (the original failing chat query)
