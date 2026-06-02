// Admin reports queue. Renters can flag a listing; admin reviews and resolves.
// Middleware redirects non-admins to /admin/login; this server component
// re-checks the cookie defense-in-depth.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidAdminCookie, adminCookieName } from "@/lib/adminAuth";
import ReportRow from "./ReportRow";

export const dynamic = "force-dynamic";

const REPORT_LABEL = {
  wrong_listing_type: "Listing type",
  wrong_locality: "Locality",
  rented_out: "Already rented out",
  scam_or_spam: "Scam or spam",
  other: "Other",
};

export default async function ReportsPage() {
  const cookieStore = await cookies();
  if (!(await isValidAdminCookie(cookieStore.get(adminCookieName())?.value))) {
    redirect("/admin/login");
  }

  const { data: reports } = await supabaseAdmin
    .from("listing_reports")
    .select(`
      id, listing_id, report_type, details, created_at, resolved,
      resolved_at, resolution_note,
      listings:listing_id (
        id, title, locality, bhk, rent, listingType, source, status
      )
    `)
    .order("resolved", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = reports ?? [];
  const unresolved = rows.filter((r) => !r.resolved).length;

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ marginBottom: 28 }}>
          <a href="/admin" style={{ textDecoration: "none" }}>
            <span style={backStyle}>&larr; Back to moderation</span>
          </a>
          <h1 style={titleStyle}>User reports</h1>
          <p style={subtitleStyle}>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace" }}>
              {unresolved}
            </span>{" "}
            unresolved &middot; {rows.length} total (last 100)
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                typeLabel={REPORT_LABEL[r.report_type] || r.report_type}
              />
            ))}
          </div>
        )}
      </div>
    </main>
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
      No reports yet.
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
  maxWidth: 800,
  margin: "0 auto",
};

const backStyle = {
  fontSize: 12,
  color: "var(--text-tertiary)",
};

const titleStyle = {
  marginTop: 8,
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
