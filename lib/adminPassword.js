// Password hashing & verification using Node's scrypt. Imported only from
// route handlers + scripts (Node runtime); never from middleware.

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(plaintext, salt) {
  const s = salt ?? randomBytes(16);
  const buf = scryptSync(plaintext, s, SCRYPT.keylen, SCRYPT);
  return `${s.toString("hex")}:${buf.toString("hex")}`;
}

export function verifyPassword(plaintext, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  let salt, expected;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  const actual = scryptSync(plaintext, salt, expected.length, SCRYPT);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
