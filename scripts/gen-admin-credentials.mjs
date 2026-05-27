// Generates admin credentials (username, password, scrypt hash, session
// secret) and prints them. Run once; copy the env vars into .env.local.

import { randomBytes, scryptSync } from "node:crypto";

const username = "admin";

// Strong but typeable random password: 16 chars from a-zA-Z0-9 minus
// look-alikes.
const alphabet =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function randPassword(n) {
  const out = [];
  const bytes = randomBytes(n * 2);
  let i = 0;
  while (out.length < n && i < bytes.length) {
    const b = bytes[i++];
    if (b < (256 - (256 % alphabet.length))) {
      out.push(alphabet[b % alphabet.length]);
    }
  }
  return out.join("");
}

const password = randPassword(16);
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
const hashEncoded = `${salt.toString("hex")}:${hash.toString("hex")}`;
const sessionSecret = randomBytes(48).toString("base64url");

console.log("Add these to .env.local:\n");
console.log(`ADMIN_USERNAME=${username}`);
console.log(`ADMIN_PASSWORD_HASH=${hashEncoded}`);
console.log(`ADMIN_SESSION_SECRET=${sessionSecret}`);
console.log("\nSave the plaintext password somewhere safe:\n");
console.log(`  username: ${username}`);
console.log(`  password: ${password}`);
console.log("\n(It is NOT recoverable; if lost, re-run this script.)");
