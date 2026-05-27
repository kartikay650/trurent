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

export const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");
export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
export const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  "web:TruRent:v2.0 (by /u/kartikay650)";
