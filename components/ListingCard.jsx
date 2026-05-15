"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/lib/filterListings";

const SOURCE_COLOR = {
  reddit: "#FF4500",
  nobroker: "#16A34A",
  magicbricks: "#EA580C",
  "99acres": "#2563EB",
};

const SOURCE_NAME = {
  reddit: "Reddit",
  nobroker: "NoBroker",
  magicbricks: "MagicBricks",
  "99acres": "99acres",
};

const AMENITY_LABEL = {
  gym: "Gym",
  pool: "Pool",
  parking: "Parking",
  power_backup: "Power backup",
  garden: "Garden",
  security: "Security",
  club: "Club house",
};

const FURNISHED_STYLE = {
  fully: {
    background: "rgba(22,163,74,0.08)",
    color: "#16A34A",
    border: "1px solid rgba(22,163,74,0.20)",
  },
  semi: {
    background: "rgba(217,119,6,0.08)",
    color: "#D97706",
    border: "1px solid rgba(217,119,6,0.22)",
  },
  unfurnished: {
    background: "rgba(28,27,24,0.04)",
    color: "#6B6862",
    border: "1px solid rgba(28,27,24,0.12)",
  },
};

const FURNISHED_LABEL = {
  fully: "Fully furnished",
  semi: "Semi furnished",
  unfurnished: "Unfurnished",
};

const PILL_BASE = {
  borderRadius: 4,
  padding: "3px 8px",
  fontSize: 11,
  fontFamily: "var(--font-dm-sans), sans-serif",
  whiteSpace: "nowrap",
};

const LABEL_STYLE = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
  fontFamily: "var(--font-dm-sans), sans-serif",
};

export default function ListingCard({ listing, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!listing) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, [listing]);

  if (!listing) return null;

  const sourceColor = SOURCE_COLOR[listing.source] ?? "#8A8780";
  const sourceName = SOURCE_NAME[listing.source] ?? listing.source;
  const postedLabel =
    listing.postedDaysAgo === 1 ? "Today" : `${listing.postedDaysAgo}d ago`;

  return (
    <>
      <style>{`
        .trurent-card-cta:hover {
          background: var(--accent-hover) !important;
        }
        @media (max-width: 768px) {
          .trurent-card-outer {
            width: 100vw !important;
          }
          .trurent-card-inner {
            padding: 16px 16px 24px !important;
          }
        }
      `}</style>

      <div
        className="trurent-card-outer"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          width: 480,
          maxWidth: "100vw",
          zIndex: 50,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderBottom: "none",
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
          transform: `translateX(-50%) translateY(${mounted ? "0" : "100%"})`,
          transition: "transform 250ms ease",
          fontFamily: "var(--font-dm-sans), sans-serif",
        }}
      >
        {/* Hero image: fills top of the card, with a status pill overlaid */}
        {listing.photos?.[0] && (
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 180,
              overflow: "hidden",
              background: "var(--bg-elevated)",
            }}
          >
            <img
              src={listing.photos[0]}
              alt={listing.title}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.parentElement.style.display = "none";
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {/* Status pill: "Available · Source" with a colored dot */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px 5px 8px",
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderRadius: 16,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
                boxShadow: "0 2px 8px rgba(28,27,24,0.10)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: sourceColor,
                  flexShrink: 0,
                }}
              />
              Available · {sourceName}
            </div>
          </div>
        )}

        <div
          className="trurent-card-inner"
          style={{ padding: "20px 24px 32px" }}
        >
          {/* Thumbnail strip: only if we have additional photos */}
          {listing.photos?.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 16,
              }}
            >
              {listing.photos.slice(1, 4).map((url, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 56,
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.parentElement.style.display = "none";
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* HEADER */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.3,
                }}
              >
                {listing.title}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                {listing.locality}
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                flex: "0 0 auto",
                width: 28,
                height: 28,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                fontSize: 16,
                lineHeight: 1,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              height: 1,
              background: "var(--border-subtle)",
              margin: "16px 0",
            }}
          />

          {/* PRICE ROW */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 28,
                  fontWeight: 400,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {formatINR(listing.rent)}
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                /mo
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              {listing.brokerage === 0 && (
                <span
                  style={{
                    ...PILL_BASE,
                    background: "rgba(22,163,74,0.08)",
                    color: "#16A34A",
                    border: "1px solid rgba(22,163,74,0.20)",
                  }}
                >
                  Zero brokerage
                </span>
              )}
              {listing.furnished && FURNISHED_STYLE[listing.furnished] && (
                <span
                  style={{
                    ...PILL_BASE,
                    ...FURNISHED_STYLE[listing.furnished],
                  }}
                >
                  {FURNISHED_LABEL[listing.furnished]}
                </span>
              )}
            </div>
          </div>

          {/* DETAILS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginTop: 16,
            }}
          >
            <div>
              <div style={LABEL_STYLE}>DEPOSIT</div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                {formatINR(listing.deposit)}
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>BROKERAGE</div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 13,
                  color:
                    listing.brokerage === 0 ? "#16A34A" : "var(--text-secondary)",
                }}
              >
                {listing.brokerage === 0 ? "None" : formatINR(listing.brokerage)}
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>POSTED</div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                {postedLabel}
              </div>
            </div>
          </div>

          {/* AMENITIES */}
          <div style={{ marginTop: 16 }}>
            <div style={LABEL_STYLE}>AMENITIES</div>
            {listing.amenities && listing.amenities.length > 0 ? (
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {listing.amenities.map((a) => (
                  <span
                    key={a}
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {AMENITY_LABEL[a] ?? a}
                  </span>
                ))}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 6,
                  color: "var(--text-tertiary)",
                  fontSize: 13,
                }}
              >
                Not listed
              </div>
            )}
          </div>

          {/* DESCRIPTION */}
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {listing.description}
          </div>

          {/* Source attribution: only when from Reddit (we have author + sub) */}
          {listing.source === "reddit" && listing.sourceAuthor && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-dm-mono), monospace",
                letterSpacing: "-0.01em",
              }}
            >
              Posted by u/{listing.sourceAuthor}
              {listing.sourceSubreddit ? ` in r/${listing.sourceSubreddit}` : ""}
            </div>
          )}

          {/* CTA */}
          <button
            className="trurent-card-cta"
            onClick={() =>
              window.open(listing.sourceUrl, "_blank", "noopener")
            }
            style={{
              marginTop: 20,
              width: "100%",
              height: 44,
              borderRadius: 8,
              background: "var(--accent-primary)",
              color: "#FFFFFF",
              fontFamily: "var(--font-dm-sans), sans-serif",
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              border: "none",
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          >
            View on {sourceName} →
          </button>
        </div>
      </div>
    </>
  );
}
