// Edge-safe admin session cookie helpers. Uses Web Crypto (works in both
// the Edge runtime — used by middleware — and the Node runtime — used by
// server components and route handlers).
//
// Password hashing is in lib/adminPassword.js (Node-only, since the Edge
// runtime doesn't have scrypt).

const COOKIE_NAME = "__trurent_admin";
const COOKIE_MAX_AGE_S = 12 * 60 * 60; // 12 hours

export function adminCookieName() {
  return COOKIE_NAME;
}

export function adminCookieMaxAgeSeconds() {
  return COOKIE_MAX_AGE_S;
}

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be set and >=32 chars");
  }
  return secret;
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
}

function bytesToBase64Url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  const padLen = (4 - (s.length % 4)) % 4;
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  let bin;
  try {
    bin = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Cookie value format: "<expiryMs>.<hmacBase64Url>"
export async function buildSessionCookieValue() {
  const expiryMs = Date.now() + COOKIE_MAX_AGE_S * 1000;
  const mac = await hmacSha256(getSecret(), String(expiryMs));
  return `${expiryMs}.${bytesToBase64Url(mac)}`;
}

export async function isValidAdminCookie(value) {
  if (!value || typeof value !== "string") return false;
  const idx = value.indexOf(".");
  if (idx <= 0) return false;
  const expiryStr = value.slice(0, idx);
  const macB64 = value.slice(idx + 1);
  const expiryMs = Number(expiryStr);
  if (!Number.isFinite(expiryMs)) return false;
  if (expiryMs < Date.now()) return false;

  const givenMac = base64UrlToBytes(macB64);
  if (!givenMac) return false;
  const expected = await hmacSha256(getSecret(), expiryStr);
  return timingSafeEqualBytes(givenMac, expected);
}
