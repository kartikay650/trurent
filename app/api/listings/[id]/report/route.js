// User-submitted report endpoint. Anyone can flag a listing as
// "wrong listing type", "wrong locality", "rented out", etc.
//
// Rate-limited per IP so a single bad actor can't spam the queue.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "wrong_listing_type",
  "wrong_locality",
  "rented_out",
  "scam_or_spam",
  "other",
]);

export async function POST(request, { params }) {
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const ip = clientIp(request);
  const rl = rateLimit(`report:${ip}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many reports from this IP. Try again later." },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reportType = String(body?.type || "").trim();
  if (!ALLOWED_TYPES.has(reportType)) {
    return NextResponse.json(
      { error: "Unsupported report type" },
      { status: 400 },
    );
  }

  const details = String(body?.details || "").trim().slice(0, 800);

  // Confirm the listing exists so we don't store reports against ghost ids.
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("listings")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    console.error("Report lookup failed:", lookupErr);
    return NextResponse.json(
      { error: "Could not process report. Please try again." },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from("listing_reports").insert([
    {
      listing_id: id,
      report_type: reportType,
      details: details || null,
      reporter_ip: ip,
    },
  ]);
  if (error) {
    console.error("Report insert failed:", error);
    return NextResponse.json(
      { error: "Could not save report. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
