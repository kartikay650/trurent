import { readFileSync } from "node:fs";
import { filterListings, localityMatches } from "../lib/filterListings.js";

const listings = JSON.parse(readFileSync("public/data/listings.json", "utf8"));
console.log(`Loaded ${listings.length} listings\n`);

const cases = [
  { name: "Typo: Koramangla → Koramangala", filters: { localities: ["Koramangla"] }, expectGt: 5 },
  { name: "Typo: Indranagar → Indiranagar",   filters: { localities: ["Indranagar"] }, expectGt: 5 },
  { name: "Substring: HSR → HSR Layout",      filters: { localities: ["HSR"] }, expectGt: 3 },
  { name: "BHK array [2,3]",                  filters: { bhk: [2, 3] }, expectGt: 50 },
  { name: "Original chat query (was 0)",      filters: { bhk: 2, minRent: 50000, maxRent: 70000, localities: ["Koramangla", "Indiranagar", "Whitefield"] }, expectGt: 3 },
  { name: "bhk:[2,3] same query",             filters: { bhk: [2, 3], minRent: 50000, maxRent: 70000, localities: ["Koramangla", "Indiranagar", "Whitefield"] }, expectGt: 6 },
  { name: "Furnished alias 'furnished'",      filters: { furnished: "furnished" }, expectGt: 5 },
  { name: "Furnished alias 'fully furnished'", filters: { furnished: "fully furnished" }, expectGt: 5 },
  { name: "Amenity alias 'swimming pool'",    filters: { amenities: ["swimming pool"] }, expectGt: 2 },
  { name: "Amenity alias 'CCTV'",             filters: { amenities: ["CCTV"] }, expectGt: 2 },
  { name: "Unknown amenity 'wifi' is ignored",filters: { amenities: ["wifi"] }, expectGt: 50 },
  { name: "maxRent 20000",                    filters: { maxRent: 20000 } },
  { name: "bhk 1",                            filters: { bhk: 1 } },
  { name: "noBrokerageOnly true",             filters: { noBrokerageOnly: true } },
  { name: "source 'nobroker'",                filters: { source: "nobroker" } },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const result = filterListings(listings, c.filters);
  const ok = c.expectGt == null ? true : result.length > c.expectGt;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  →  ${result.length}` + (c.expectGt ? `  (expected > ${c.expectGt})` : ""));
  if (ok) pass++; else fail++;
}

console.log(`\n${pass} pass, ${fail} fail`);

console.log("\n--- localityMatches spot checks ---");
const pairs = [
  ["Koramangla", "Koramangala", true],
  ["koramangala", "Koramangala", true],
  ["HSR", "HSR Layout", true],
  ["Indranagar", "Indiranagar", true],
  ["Whitfield", "Whitefield", true],
  ["sarjapur", "Sarjapur Road", true],
  ["Random Place", "Koramangala", false],
];
for (const [a, b, want] of pairs) {
  const got = localityMatches(a, b);
  console.log(`${got === want ? "PASS" : "FAIL"}  "${a}" ~ "${b}" → ${got}  (want ${want})`);
}
