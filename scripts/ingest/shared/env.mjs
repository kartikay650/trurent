// Load .env.local for local runs. GitHub Actions injects env vars directly,
// so this file is a no-op there.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  const envFile = readFileSync(".env.local", "utf8");
  envFile.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  });
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// Print a one-line diagnostic at startup so failures in CI are unambiguous
// — instead of an opaque module-load error we get "missing X" front and centre.
function diagnose(name, value) {
  if (!value) return `${name}=MISSING`;
  if (name.includes("KEY") || name.includes("PASS")) {
    return `${name}=<set,${value.length} chars>`;
  }
  return `${name}=${value}`;
}
console.log(
  "[env] " +
    [
      diagnose("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
      diagnose("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
      diagnose("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    ].join("  "),
);

export const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");
export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
export const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  "web:TruRent:v2.0 (by /u/kartikay650)";
