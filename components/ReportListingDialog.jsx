"use client";

import { useState, useEffect, useRef } from "react";

const REPORT_OPTIONS = [
  { value: "wrong_listing_type", label: "Not actually entire flat / room as stated" },
  { value: "wrong_locality", label: "Locality is wrong" },
  { value: "rented_out", label: "Already rented out" },
  { value: "scam_or_spam", label: "Looks like a scam" },
  { value: "other", label: "Something else" },
];

export default function ReportListingDialog({ listingId, onClose }) {
  const [type, setType] = useState(REPORT_OPTIONS[0].value);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/listings/${listingId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, details }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit report");
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div ref={containerRef} style={dialogStyle} role="dialog" aria-label="Report listing">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={titleStyle}>Report this listing</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={closeStyle}
          >
            ×
          </button>
        </div>
        {done ? (
          <div style={{ padding: "16px 0" }}>
            <p style={{ ...subtitleStyle, marginBottom: 14 }}>
              Thanks. We&apos;ll review this and update the listing.
            </p>
            <button type="button" onClick={onClose} style={primaryButtonStyle}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={subtitleStyle}>
              Help us keep the data clean — tell us what looks off.
            </p>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {REPORT_OPTIONS.map((opt) => (
                <label key={opt.value} style={optionRowStyle}>
                  <input
                    type="radio"
                    name="report-type"
                    value={opt.value}
                    checked={type === opt.value}
                    onChange={() => setType(opt.value)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{opt.label}</span>
                </label>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Optional: any extra context (max 800 chars)"
              rows={3}
              maxLength={800}
              style={textareaStyle}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{ ...primaryButtonStyle, opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
              <button type="button" onClick={onClose} style={secondaryButtonStyle}>
                Cancel
              </button>
            </div>
            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#B91C1C" }}>{error}</div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(28,27,24,0.55)",
  backdropFilter: "blur(2px)",
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const dialogStyle = {
  width: "100%",
  maxWidth: 420,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "20px 22px 22px",
  fontFamily: "var(--font-dm-sans), sans-serif",
};

const titleStyle = {
  margin: 0,
  fontFamily: "var(--font-playfair), serif",
  fontWeight: 400,
  fontSize: 18,
  color: "var(--text-primary)",
};

const subtitleStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
  margin: 0,
};

const closeStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  width: 26,
  height: 26,
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
  color: "var(--text-secondary)",
  lineHeight: 1,
  padding: 0,
  fontFamily: "inherit",
};

const optionRowStyle = {
  display: "flex",
  alignItems: "center",
  padding: "6px 8px",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  cursor: "pointer",
  background: "var(--bg-elevated)",
};

const textareaStyle = {
  width: "100%",
  marginTop: 12,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
};

const primaryButtonStyle = {
  background: "var(--accent-primary)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
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
