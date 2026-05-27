// Admin moderation override. Gated by the standalone admin cookie (not
// Supabase). Writes go through the service-role client.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidAdminCookie, adminCookieName } from "@/lib/adminAuth";

export async function POST(request) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(adminCookieName())?.value;
  if (!(await isValidAdminCookie(sessionCookie))) {
    // Middleware already 404s anonymous requests to this path; this is just
    // defense-in-depth in case middleware is bypassed.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, action, rejectionReason } = body || {};
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "Missing id or invalid action" },
      { status: 400 },
    );
  }
  if (action === "reject" && !rejectionReason?.trim()) {
    return NextResponse.json(
      { error: "Rejection reason required" },
      { status: 400 },
    );
  }

  const patch =
    action === "approve"
      ? {
          status: "active",
          verifiedAt: new Date().toISOString(),
          rejectionReason: null,
        }
      : { status: "rejected", rejectionReason: rejectionReason.trim() };

  const { error } = await supabaseAdmin
    .from("listings")
    .update(patch)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
