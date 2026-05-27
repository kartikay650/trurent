// Admin login endpoint. Standalone — does NOT touch Supabase auth.
// Verifies username/password against ADMIN_USERNAME / ADMIN_PASSWORD_HASH
// (scrypt) and sets a signed httpOnly cookie that the middleware checks.

import { NextResponse } from "next/server";
import {
  buildSessionCookieValue,
  adminCookieName,
  adminCookieMaxAgeSeconds,
} from "@/lib/adminAuth";
import { verifyPassword } from "@/lib/adminPassword";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(request) {
  // Brute-force guard: 8 attempts per 15 min per IP. Generous for legit
  // typos, tight enough to make password guessing impractical.
  const ip = clientIp(request);
  const rl = rateLimit(`admin-login:${ip}`, {
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password required" },
      { status: 400 },
    );
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUsername || !expectedHash) {
    return NextResponse.json(
      { error: "Admin auth is not configured on the server" },
      { status: 500 },
    );
  }

  // Compute both checks unconditionally to keep timing roughly constant.
  const passwordOk = verifyPassword(password, expectedHash);
  const usernameOk = username === expectedUsername;

  if (!usernameOk || !passwordOk) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  const sessionValue = await buildSessionCookieValue();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieName(), sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: adminCookieMaxAgeSeconds(),
  });
  return res;
}
