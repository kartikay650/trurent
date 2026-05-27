"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportRow({ report, typeLabel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(report.resolution_note || "");
  const [error, setError] = useState("");
  const [showNote, setShowNote] = useState(false);

  const listing = report.listings;

  async function act(action, resolutionNote = "") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/reports/${report.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, note: resolutionNote }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const ago = relTime(report.created_at);

  return (
    <div style={cardStyle(report.resolved)}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={typeBadge(report.report_type)}>{typeLabel}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
            {ago}
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "2px 6px",
            borderRadius: 3,
            ...(report.resolved
              ? { background: "#DCFCE7", color: "#15803D" }
              : { background: "#FEF3C7", color: "#92400E" }),
          }}
        >
          {report.resolved ? "Resolved" : "Open"}
        </span>
      </div>

      {listing ? (
        <a
          href={`/?id=${listing.id}`}
          style={{ textDecoration: "none", color: "var(--text-primary)" }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>
            {listing.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {listing.bhk} BHK &middot; {listing.locality} &middot; ₹
            {listing.rent?.toLocaleString("en-IN")} &middot; {listing.listingType}{" "}
            &middot; <span style={{ color: "var(--text-tertiary)" }}>{listing.source}</span>
          </div>
        </a>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          [Listing deleted; report kept for context]
        </div>
      )}

      {report.details && (
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            background: "var(--bg-elevated)",
            padding: "8px 10px",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          “{report.details}”
        </p>
      )}

      {report.resolved && report.resolution_note && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--text-tertiary)",
            fontStyle: "italic",
          }}
        >
          Resolution: {report.resolution_note}
        </div>
      )}

      {!report.resolved && (
        <div style={{ marginTop: 12 }}>
          {showNote ? (
            <div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (what you did)"
                style={inputStyle}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => act("resolve", note)}
                  disabled={busy}
                  style={primaryButtonStyle}
                >
                  {busy ? "..." : "Mark resolved"}
                </button>
                <button
                  onClick={() => setShowNote(false)}
                  disabled={busy}
                  style={textButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowNote(true)}
                disabled={busy}
                style={primaryButtonStyle}
              >
                Resolve
              </button>
              {listing && (
                <a
                  href="/admin"
                  style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                >
                  Open listing in moderation
                </a>
              )}
              <button
                onClick={() => act("dismiss", "")}
                disabled={busy}
                style={textButtonStyle}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

function relTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function cardStyle(resolved) {
  return {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 10,
    padding: "14px 16px",
    opacity: resolved ? 0.65 : 1,
  };
}

function typeBadge(type) {
  const colors =
    type === "scam_or_spam"
      ? { background: "#FEE2E2", color: "#B91C1C" }
      : type === "rented_out"
        ? { background: "#E0E7FF", color: "#3730A3" }
        : { background: "#F3F4F6", color: "#374151" };
  return {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "2px 7px",
    borderRadius: 3,
    ...colors,
  };
}

const primaryButtonStyle = {
  background: "var(--accent-primary)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const textButtonStyle = {
  background: "none",
  border: "none",
  color: "var(--text-tertiary)",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  padding: 0,
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const errorStyle = {
  marginTop: 8,
  fontSize: 11,
  color: "#B91C1C",
};
