"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ModerateRow({ listing }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  async function act(action, rejectionReason) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: listing.id, action, rejectionReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const photos = Array.isArray(listing.photos) ? listing.photos : [];

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {photos.length > 0 ? (
          <img
            src={photos[0]}
            alt=""
            style={{
              width: 120,
              height: 90,
              objectFit: "cover",
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 120,
              height: 90,
              borderRadius: 6,
              border: "1px dashed var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "var(--text-tertiary)",
              flexShrink: 0,
            }}
          >
            no photos
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleRowStyle}>
            <span style={titleStyle}>
              <StatusBadge status={listing.status} /> {listing.title}
            </span>
            <span style={priceStyle}>
              &#8377;{listing.rent?.toLocaleString("en-IN")}
            </span>
          </div>
          {listing.status === "rejected" && listing.rejectionReason && (
            <div style={rejectReasonStyle}>
              AI reason: {listing.rejectionReason}
            </div>
          )}
          <div style={metaStyle}>
            {listing.bhk} BHK &middot; {listing.locality} &middot;{" "}
            {labelFurnished(listing.furnished)} &middot;{" "}
            {labelType(listing.listingType)}
          </div>
          <div style={metaStyle}>
            from {listing.ownerEmail || "unknown"}
            {listing.ownerWhatsapp ? ` · ${listing.ownerWhatsapp}` : ""}
          </div>
          {listing.description && (
            <p style={descStyle}>{listing.description}</p>
          )}
          {photos.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {photos.slice(1).map((p, i) => (
                <img
                  key={i}
                  src={p}
                  alt=""
                  style={{
                    width: 48,
                    height: 36,
                    objectFit: "cover",
                    borderRadius: 3,
                    border: "1px solid var(--border-subtle)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showReject ? (
        <div style={{ marginTop: 14 }}>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (shown to submitter)"
            style={inputStyle}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => act("reject", reason)}
              disabled={busy || !reason.trim()}
              style={dangerButtonStyle}
            >
              {busy ? "..." : "Confirm reject"}
            </button>
            <button
              onClick={() => {
                setShowReject(false);
                setReason("");
              }}
              disabled={busy}
              style={textButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
          {listing.status !== "active" && (
            <button
              onClick={() => act("approve")}
              disabled={busy}
              style={primaryButtonStyle}
            >
              {busy ? "..." : listing.status === "rejected" ? "Override: approve" : "Approve"}
            </button>
          )}
          {listing.status !== "rejected" && (
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              style={secondaryButtonStyle}
            >
              {listing.status === "active" ? "Override: reject" : "Reject"}
            </button>
          )}
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 4 }}>
            AI already decided · only override if it&apos;s wrong
          </span>
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const style = {
    display: "inline-block",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "2px 6px",
    borderRadius: 3,
    marginRight: 6,
    verticalAlign: "middle",
    ...(status === "active"
      ? { background: "#DCFCE7", color: "#15803D" }
      : status === "rejected"
        ? { background: "#FEE2E2", color: "#B91C1C" }
        : { background: "#FEF3C7", color: "#92400E" }),
  };
  return <span style={style}>{status === "pending_review" ? "pending" : status}</span>;
}

function labelFurnished(f) {
  return f === "fully"
    ? "Fully furnished"
    : f === "semi"
      ? "Semi furnished"
      : f === "unfurnished"
        ? "Unfurnished"
        : f || "—";
}

function labelType(t) {
  return t === "entire_flat"
    ? "Entire flat"
    : t === "room"
      ? "Single room"
      : t === "pg"
        ? "PG"
        : t || "—";
}

const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  padding: "16px 18px",
};

const titleRowStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 4,
};

const titleStyle = {
  fontSize: 14,
  fontWeight: 500,
  color: "var(--text-primary)",
  lineHeight: 1.3,
};

const priceStyle = {
  fontFamily: "var(--font-dm-mono), monospace",
  fontSize: 14,
  color: "var(--text-primary)",
  flexShrink: 0,
};

const metaStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  marginTop: 2,
};

const descStyle = {
  fontSize: 13,
  color: "var(--text-secondary)",
  marginTop: 8,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const primaryButtonStyle = {
  background: "var(--accent-primary)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
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

const dangerButtonStyle = {
  ...primaryButtonStyle,
  background: "#B91C1C",
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

const errorStyle = {
  marginTop: 10,
  fontSize: 12,
  color: "#B91C1C",
};

const rejectReasonStyle = {
  fontSize: 12,
  color: "#B91C1C",
  marginTop: 4,
  fontStyle: "italic",
};
