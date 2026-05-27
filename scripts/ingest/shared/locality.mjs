// Canonical Bangalore locality coordinates. Used by:
//   - source extractors (so Haiku can pick a canonical name)
//   - geocoder fallback when Nominatim fails
//   - the chat agent's prompt
//
// Treat this as the source of truth for "which areas does TruRent cover."

export const LOCALITY_GEO = {
  Koramangala: [12.9352, 77.6245],
  Indiranagar: [12.9719, 77.6412],
  "HSR Layout": [12.9116, 77.6389],
  Whitefield: [12.9698, 77.7499],
  Bellandur: [12.9260, 77.6762],
  "Sarjapur Road": [12.9010, 77.6961],
  Marathahalli: [12.9591, 77.6971],
  "BTM Layout": [12.9165, 77.6101],
  Jayanagar: [12.9250, 77.5938],
  "JP Nagar": [12.8958, 77.5855],
  Banashankari: [12.9141, 77.5467],
  "Bannerghatta Road": [12.8735, 77.5985],
  Hebbal: [13.0358, 77.5970],
  Yelahanka: [13.1005, 77.5963],
  "Electronic City": [12.8399, 77.6770],
  Bommanahalli: [12.8958, 77.6401],
  Singasandra: [12.8780, 77.6310],
  Hennur: [13.0358, 77.6490],
  "Frazer Town": [12.9833, 77.6167],
  Shivajinagar: [12.9833, 77.6000],
  "Cunningham Road": [12.9833, 77.5933],
  "Richmond Town": [12.9600, 77.6010],
  Ulsoor: [12.9833, 77.6219],
  Domlur: [12.9591, 77.6390],
  Malleshwaram: [13.0023, 77.5667],
  Rajajinagar: [12.9906, 77.5530],
  Sadashivanagar: [13.0050, 77.5800],
  "Basaveshwara Nagar": [12.9920, 77.5480],
  Vijayanagar: [12.9719, 77.5310],
  "Mysore Road": [12.9500, 77.5050],
  Nagarbhavi: [12.9554, 77.5063],
  Jalahalli: [13.0433, 77.5380],
  Peenya: [13.0280, 77.5180],
  Nayandahalli: [12.9400, 77.5100],
  Kengeri: [12.9074, 77.4876],
  "RT Nagar": [13.0212, 77.5917],
  "Old Airport Road": [12.9606, 77.6489],
  "CV Raman Nagar": [12.9855, 77.6601],
  "Kasturi Nagar": [13.0100, 77.6550],
  "Pai Layout": [13.0050, 77.6601],
  "Kalyan Nagar": [13.0200, 77.6490],
  Brookefield: [12.9698, 77.7200],
  Hoodi: [12.9855, 77.7100],
  Kadugodi: [12.9855, 77.7667],
  Hoskote: [13.0701, 77.7980],
  Mahadevapura: [12.9940, 77.7010],
  Devanahalli: [13.2488, 77.7143],
  "KR Puram": [13.0094, 77.7053],
  Banaswadi: [13.0118, 77.6534],
  Kammanahalli: [13.0167, 77.6394],
  "HBR Layout": [13.0218, 77.6360],
  Munnekollal: [12.9569, 77.7039],
  Varthur: [12.9404, 77.7466],
  Kasavanahalli: [12.8990, 77.6814],
  Doddakannelli: [12.9099, 77.6862],
  Kundalahalli: [12.9700, 77.7050],
  "AECS Layout": [12.9750, 77.7080],
  Chandapura: [12.8030, 77.6970],
  "BEML Layout": [12.9355, 77.7370],
  "Kasturba Road": [12.9696, 77.5980],
  "Lavelle Road": [12.9716, 77.5946],
};

export const KNOWN_LOCALITIES = Object.keys(LOCALITY_GEO);

export function inBangalore(lat, lng) {
  return lat >= 12.75 && lat <= 13.3 && lng >= 77.4 && lng <= 77.85;
}

export function localityCentroid(name) {
  const c = LOCALITY_GEO[name];
  if (!c) return null;
  return { lat: c[0], lng: c[1] };
}
