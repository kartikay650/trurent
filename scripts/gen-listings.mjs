// One-off dataset expander. Run with: node scripts/gen-listings.mjs
// Appends realistic Bangalore listings to public/data/listings.json.
import { readFileSync, writeFileSync } from "node:fs";

const path = "public/data/listings.json";
const existing = JSON.parse(readFileSync(path, "utf8"));

// Localities with a center + how many listings to add and price band per BHK.
// Prices in INR/month. Bands tuned to real Bangalore market levels.
const LOCALITIES = [
  { name: "Koramangala", lat: 12.9352, lng: 77.6245, bands: { 1: [22, 30], 2: [32, 75], 3: [55, 95] }, premium: true },
  { name: "Indiranagar", lat: 12.9719, lng: 77.6412, bands: { 1: [20, 28], 2: [30, 70], 3: [55, 90] }, premium: true },
  { name: "HSR Layout", lat: 12.9116, lng: 77.6389, bands: { 1: [16, 24], 2: [25, 55], 3: [42, 75] } },
  { name: "Whitefield", lat: 12.9698, lng: 77.7499, bands: { 1: [12, 18], 2: [22, 55], 3: [32, 75] } },
  { name: "Bellandur", lat: 12.9260, lng: 77.6762, bands: { 1: [15, 22], 2: [24, 50], 3: [38, 70] } },
  { name: "Sarjapur Road", lat: 12.9010, lng: 77.6961, bands: { 1: [14, 20], 2: [22, 48], 3: [38, 65] } },
  { name: "Marathahalli", lat: 12.9591, lng: 77.6971, bands: { 1: [13, 20], 2: [20, 38], 3: [30, 55] } },
  { name: "JP Nagar", lat: 12.8958, lng: 77.5855, bands: { 1: [14, 22], 2: [20, 40], 3: [32, 55] } },
  { name: "BTM Layout", lat: 12.9165, lng: 77.6101, bands: { 1: [12, 20], 2: [18, 35], 3: [28, 50] } },
  { name: "Jayanagar", lat: 12.9250, lng: 77.5938, bands: { 1: [16, 24], 2: [25, 50], 3: [42, 70] }, premium: true },
  { name: "Banashankari", lat: 12.9141, lng: 77.5467, bands: { 1: [11, 18], 2: [18, 32], 3: [30, 48] } },
  { name: "Hebbal", lat: 13.0358, lng: 77.5970, bands: { 1: [13, 20], 2: [22, 40], 3: [35, 60] } },
  { name: "Yelahanka", lat: 13.1005, lng: 77.5963, bands: { 1: [10, 16], 2: [16, 30], 3: [26, 45] } },
  { name: "Electronic City", lat: 12.8399, lng: 77.6770, bands: { 1: [10, 16], 2: [16, 28], 3: [24, 40] } },
  { name: "Hennur", lat: 13.0358, lng: 77.6490, bands: { 1: [12, 18], 2: [20, 35], 3: [32, 55] } },
  { name: "Frazer Town", lat: 12.9833, lng: 77.6167, bands: { 1: [18, 26], 2: [28, 48], 3: [45, 70] } },
  { name: "Malleshwaram", lat: 13.0023, lng: 77.5667, bands: { 1: [16, 24], 2: [26, 45], 3: [42, 70] }, premium: true },
  { name: "Rajajinagar", lat: 12.9906, lng: 77.5530, bands: { 1: [13, 20], 2: [20, 38], 3: [32, 55] } },
  { name: "Brookefield", lat: 12.9698, lng: 77.7200, bands: { 1: [14, 22], 2: [22, 45], 3: [35, 60] } },
  { name: "Kalyan Nagar", lat: 13.0200, lng: 77.6490, bands: { 1: [13, 20], 2: [20, 38], 3: [32, 50] } },
  { name: "CV Raman Nagar", lat: 12.9855, lng: 77.6601, bands: { 1: [14, 22], 2: [22, 40], 3: [35, 55] } },
  { name: "Domlur", lat: 12.9591, lng: 77.6390, bands: { 1: [18, 26], 2: [28, 50], 3: [45, 70] }, premium: true },
  { name: "Ulsoor", lat: 12.9833, lng: 77.6219, bands: { 1: [20, 28], 2: [30, 55], 3: [48, 80] } },
  { name: "Mahadevapura", lat: 12.9940, lng: 77.7010, bands: { 1: [12, 18], 2: [20, 35], 3: [30, 50] } },
];

// Number of new listings to generate per locality. Heavier in popular areas.
const NEW_PER_LOCALITY = {
  Koramangala: 7,
  Indiranagar: 7,
  "HSR Layout": 6,
  Whitefield: 6,
  Bellandur: 5,
  "Sarjapur Road": 5,
  Marathahalli: 4,
  "JP Nagar": 3,
  "BTM Layout": 3,
  Jayanagar: 3,
  Banashankari: 3,
  Hebbal: 3,
  Yelahanka: 2,
  "Electronic City": 3,
  Hennur: 2,
  "Frazer Town": 2,
  Malleshwaram: 3,
  Rajajinagar: 2,
  Brookefield: 3,
  "Kalyan Nagar": 2,
  "CV Raman Nagar": 2,
  Domlur: 2,
  Ulsoor: 2,
  Mahadevapura: 2,
};

const SUB_AREAS = {
  Koramangala: ["1st Block", "3rd Block", "4th Block", "5th Block", "6th Block", "7th Block", "8th Block", "ST Bed"],
  Indiranagar: ["100ft Road", "12th Main", "HAL 2nd Stage", "CMH Road", "Cambridge Layout", "Defence Colony", "6th Main", "Old Madras Road"],
  "HSR Layout": ["Sector 1", "Sector 2", "Sector 3", "Sector 4", "Sector 6", "Sector 7", "BDA Complex", "27th Main"],
  Whitefield: ["ITPL Road", "Hope Farm", "Hagadur", "Brigade Cosmopolis", "Palm Meadows", "Prestige Shantiniketan", "Kadugodi Side", "Varthur"],
  Bellandur: ["Outer Ring Road", "Kaikondrahalli", "Adarsh Palm Retreat", "near Sakra", "Bellandur Gate", "Devarabisanahalli"],
  "Sarjapur Road": ["Doddakanelli", "Carmelaram", "Junnasandra", "Bopanahalli", "Wipro Junction", "Kasavanahalli"],
  Marathahalli: ["AECS Layout", "Spice Garden", "Outer Ring Road", "ITPL Main Road", "Brand Factory side", "Munnekollal"],
  "JP Nagar": ["2nd Phase", "5th Phase", "6th Phase", "7th Phase", "8th Phase"],
  "BTM Layout": ["1st Stage", "2nd Stage", "Madiwala side", "near Silk Board"],
  Jayanagar: ["3rd Block", "4th Block", "5th Block", "7th Block", "9th Block"],
  Banashankari: ["2nd Stage", "3rd Stage", "6th Stage", "Devegowda Petrol Bunk"],
  Hebbal: ["Kempapura", "Sahakar Nagar", "Manyata side", "Hebbal Flyover"],
  Yelahanka: ["New Town", "Vidyaranyapura", "Doddaballapur Road", "Attur"],
  "Electronic City": ["Phase 1", "Phase 2", "Veerasandra", "Neeladri Nagar"],
  Hennur: ["Hennur Road", "Hennur Cross", "Kothanur Side"],
  "Frazer Town": ["Mosque Road", "Coles Road", "Promenade Road"],
  Malleshwaram: ["15th Cross", "8th Cross", "Sampige Road", "Margosa Road"],
  Rajajinagar: ["1st Block", "5th Block", "ESI Road", "Industrial Town"],
  Brookefield: ["AECS Layout", "ITPL Road", "Cessna Park", "Whitefield Main"],
  "Kalyan Nagar": ["HRBR Layout", "8th Main", "5th Main", "Banaswadi side"],
  "CV Raman Nagar": ["DRDO Quarters", "Defence Colony", "Main Road"],
  Domlur: ["1st Stage", "2nd Stage", "Inner Ring Road", "Layout"],
  Ulsoor: ["Lake Road", "MG Road side", "Halasuru Main Road"],
  Mahadevapura: ["Phase 1", "Phase 2", "Garudacharpalya", "ITPL side"],
};

const FURNISHED = ["fully", "semi", "unfurnished"];
const SOURCES = ["nobroker", "magicbricks", "99acres"];

// Amenity pools by furnished level (rough heuristic — fully furnished tend to have more)
const AMENITY_POOLS = {
  fully:        ["gym", "pool", "parking", "power_backup", "security", "garden"],
  semi:         ["parking", "power_backup", "gym", "security", "garden"],
  unfurnished:  ["parking", "power_backup", "security"],
};
const NEARBY_POOL = ["restaurants", "supermarket", "cafes", "park", "mall", "metro_500m", "metro_300m", "hospital", "school", "bars"];

const SOURCE_URL = {
  nobroker: (loc) => `https://www.nobroker.in/property/residential/rent/bangalore/${loc.replace(/\s+/g, "-")}`,
  magicbricks: (loc) => `https://www.magicbricks.com/property-for-rent/residential-properties/bangalore/${loc.replace(/\s+/g, "-")}`,
  "99acres": (loc) => `https://www.99acres.com/property-for-rent-in-${loc.toLowerCase().replace(/\s+/g, "-")}-bangalore`,
};

// Seeded PRNG so re-running produces a stable file.
let _seed = 0xdeadbeef;
function rand() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0xffffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function range(min, max) { return min + Math.floor(rand() * (max - min + 1)); }

function jitter(coord) { return coord + (rand() - 0.5) * 0.012; }

function descFor(bhk, locality, sub, furnished, isNoBroker) {
  const tones = [
    `Bright ${bhk}BHK in ${locality} ${sub}, ${furnished === "unfurnished" ? "ready for your own furniture" : furnished + " furnished"}.`,
    `${bhk}BHK on ${sub}, well-maintained building with good natural light.`,
    `${furnished === "fully" ? "Move-in ready" : "Well-kept"} ${bhk}BHK in ${locality}, walkable neighbourhood.`,
    `Quiet ${bhk}BHK off the main road in ${locality}, good for working professionals.`,
    `${bhk}BHK with balcony in ${locality}, decent ventilation and parking sorted.`,
  ];
  let s = pick(tones);
  if (isNoBroker) s += " No brokerage.";
  return s;
}

function makeListing(idNum, locality, subArea) {
  const bhk = pick([1, 1, 2, 2, 2, 3, 3]); // weighted toward 2BHK
  const band = locality.bands[bhk];
  const rent = range(band[0], band[1]) * 1000;
  const furnished = bhk === 3 ? pick(["fully", "semi", "semi"]) : pick(FURNISHED);
  const source = pick(SOURCES);
  const isNoBroker = source === "nobroker" && rand() < 0.85; // most nobroker listings have 0 brokerage
  const deposit = rent * 10;
  const brokerage = isNoBroker ? 0 : (rand() < 0.15 ? 0 : rent);
  const amenityPool = AMENITY_POOLS[furnished];
  const numAmenities = range(1, Math.min(amenityPool.length, furnished === "fully" ? 5 : 3));
  const amenities = [...new Set(Array.from({ length: numAmenities }, () => pick(amenityPool)))];
  const numNearby = range(2, 4);
  const nearby = [...new Set(Array.from({ length: numNearby }, () => pick(NEARBY_POOL)))];

  return {
    id: `blr_${String(idNum).padStart(3, "0")}`,
    title: `${bhk}BHK ${locality.name} ${subArea}`,
    locality: locality.name,
    rent,
    deposit,
    brokerage,
    bhk,
    lat: +jitter(locality.lat).toFixed(4),
    lng: +jitter(locality.lng).toFixed(4),
    furnished,
    amenities,
    nearby,
    source,
    sourceUrl: SOURCE_URL[source](locality.name),
    description: descFor(bhk, locality.name, subArea, furnished, isNoBroker),
    postedDaysAgo: range(1, 12),
  };
}

const newListings = [];
let nextId = existing.length + 1;
for (const loc of LOCALITIES) {
  const count = NEW_PER_LOCALITY[loc.name] || 0;
  const subAreas = SUB_AREAS[loc.name] || [""];
  for (let i = 0; i < count; i++) {
    const sub = subAreas[i % subAreas.length];
    newListings.push(makeListing(nextId++, loc, sub));
  }
}

const combined = [...existing, ...newListings];

// Write back as one-record-per-line, like the original file.
const body =
  "[\n" +
  combined.map((l) => "  " + JSON.stringify(l)).join(",\n") +
  "\n]\n";
writeFileSync(path, body);

console.log(`existing: ${existing.length}`);
console.log(`new:      ${newListings.length}`);
console.log(`total:    ${combined.length}`);
