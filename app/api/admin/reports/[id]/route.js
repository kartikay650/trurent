// Admin endpoint to resolve / dismiss a user report. Gated by the admin
// cookie (middleware also 404s anonymous traffic on this path).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidAdminCookie, adminCookieName } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const cookieStore = await cookies();
  if (!(await isValidAdminCookie(cookieStore.get(adminCookieName())?.value))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (!Number.isInteger(reportId) || reportId < 1) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body?.action || "");
  const note = String(body?.note || "").trim().slice(0, 300);
  if (!["resolve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("listing_reports")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_note:
        action === "dismiss" ? "dismissed without action" : note || null,
    })
    .eq("id", reportId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
