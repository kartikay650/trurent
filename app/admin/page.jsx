// Admin audit page. AI auto-moderates owner submissions; this page is a
// read-only audit log of recently-moderated listings with an override
// affordance (admin can flip approve/reject if the AI got it wrong).
//
// Auth is gated three ways:
//   1. middleware redirects to /admin/login if the admin cookie is missing
//      or invalid (or returns 404 for /api/admin/*)
//   2. this page re-checks the cookie server-side
//   3. /api/admin/moderate re-checks the cookie
//
// No Supabase auth, no profile lookup. Standalone admin login only.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidAdminCookie, adminCookieName } from "@/lib/adminAuth";
import ModerateRow from "./ModerateRow";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(adminCookieName())?.value;
  if (!(await isValidAdminCookie(sessionCookie))) {
    redirect("/admin/login");
  }

  // Service role bypasses RLS so we see active, rejected, AND pending rows.
  const { data: recent } = await supabaseAdmin
    .from("listings")
    .select("*")
    .eq("source", "owner")
    .in("status", ["active", "rejected", "pending_review"])
    .order("postedAt", { ascending: false })
    .limit(50);

  const rows = recent ?? [];
  const counts = {
    active: rows.filter((r) => r.status === "active").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    pending: rows.filter((r) => r.status === "pending_review").length,
  };

  // Surface the open-report count so the admin notices new flags from the
  // /admin entrypoint without having to navigate.
  const { count: openReports } = await supabaseAdmin
    .from("listing_reports")
    .select("id", { head: true, count: "exact" })
    .eq("resolved", false);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Header counts={counts} openReports={openReports ?? 0} />
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((l) => (
              <ModerateRow key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Header({ counts, openReports }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={logoStyle}>
            Tru
            <span style={logoDotStyle} />
            Rent
          </span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a
            href="/admin/reports"
            style={{
              fontSize: 11,
              color: openReports > 0 ? "#B91C1C" : "var(--text-tertiary)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontWeight: openReports > 0 ? 600 : 400,
            }}
          >
            Reports{openReports > 0 ? ` (${openReports})` : ""}
          </a>
          <LogoutButton />
        </div>
      </div>
      <h1 style={titleStyle}>Moderation audit</h1>
      <p style={subtitleStyle}>
        AI auto-moderates submissions &middot;{" "}
        <span style={{ fontFamily: "var(--font-dm-mono), monospace" }}>
          {counts.active}
        </span>{" "}
        live,{" "}
        <span style={{ fontFamily: "var(--font-dm-mono), monospace" }}>
          {counts.rejected}
        </span>{" "}
        rejected
        {counts.pending > 0 ? `, ${counts.pending} pending` : ""}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "60px 0",
        textAlign: "center",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-playfair), serif",
        fontStyle: "italic",
      }}
    >
      Nothing in the queue.
    </div>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  background: "var(--bg-base)",
  padding: "40px 20px",
  fontFamily: "var(--font-dm-sans), sans-serif",
};

const containerStyle = {
  maxWidth: 760,
  margin: "0 auto",
};

const logoStyle = {
  fontFamily: "var(--font-playfair), serif",
  fontSize: 22,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const logoDotStyle = {
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--accent-glow)",
  marginLeft: 1,
  verticalAlign: "middle",
};

const titleStyle = {
  marginTop: 14,
  fontSize: 24,
  fontFamily: "var(--font-playfair), serif",
  fontWeight: 400,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const subtitleStyle = {
  marginTop: 6,
  fontSize: 13,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};
