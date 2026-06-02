"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import MapWrapper from "@/components/MapWrapper";
import ListingCard from "@/components/ListingCard";
import ChatWidget from "@/components/ChatWidget";
import FilterPanel from "@/components/FilterPanel";
import {
  filterListings,
  shortRent,
  normalizeFurnished,
  normalizeAmenity,
  normalizeSource,
} from "@/lib/filterListings";
import { supabase } from "@/lib/supabase";

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef();
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const duration = 280;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <>{display}</>;
}

const SOURCE_NAME = {
  reddit: "Reddit",
  nobroker: "NoBroker",
  magicbricks: "MagicBricks",
  "99acres": "99acres",
};

const FURNISHED_LABEL = {
  fully: "Fully furnished",
  semi: "Semi furnished",
  unfurnished: "Unfurnished",
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

function relativeTimeFrom(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.max(1, Math.round((now - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function Home() {
  const [allListings, setAllListings] = useState([]);
  const [filters, setFilters] = useState({});
  const [selectedListing, setSelectedListing] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: listingsData, error: listingsError } = await supabase
          .from("listings")
          .select("*")
          .order("postedAt", { ascending: false });
        
        if (!listingsError && listingsData) {
          setAllListings(listingsData);
        }

        const { data: metaData, error: metaError } = await supabase
          .from("scrape_meta")
          .select("*")
          .order("id", { ascending: false })
          .limit(1)
          .single();
          
        if (!metaError && metaData) {
          setMeta(metaData);
        }
      } catch (err) {
        console.error("Failed to load from Supabase:", err);
      } finally {
        setIsLoaded(true);
      }
    }
    
    loadData();
  }, []);

  const filteredListings = useMemo(
    () => filterListings(allListings, filters),
    [allListings, filters],
  );

  useEffect(() => {
    if (
      selectedListing &&
      !filteredListings.find((l) => l.id === selectedListing.id)
    ) {
      setSelectedListing(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredListings]);

  function handleFiltersUpdate(newFilters, options = {}) {
    if (newFilters?.reset) {
      setFilters({});
    } else if (options.replace) {
      // Agent-driven: the search defines the full current intent. Replace, not merge.
      setFilters(newFilters ?? {});
    } else {
      setFilters((prev) => ({ ...prev, ...newFilters }));
    }
    setSelectedListing(null);
  }

  function removeFilterKey(key) {
    setFilters((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }

  function removeArrayItem(key, item) {
    setFilters((f) => {
      const arr = (f[key] || []).filter((x) => x !== item);
      const next = { ...f };
      if (arr.length === 0) delete next[key];
      else next[key] = arr;
      return next;
    });
  }

  const chips = [];
  if (filters.bhk != null) {
    const bhkArr = Array.isArray(filters.bhk) ? filters.bhk : [filters.bhk];
    const label =
      bhkArr.length > 1
        ? `${bhkArr.join("/")} BHK`
        : `${bhkArr[0]} BHK`;
    chips.push({
      key: "bhk",
      label,
      onRemove: () => removeFilterKey("bhk"),
    });
  }
  if (filters.maxRent != null) {
    chips.push({
      key: "maxRent",
      label: `≤ ${shortRent(filters.maxRent)}`,
      onRemove: () => removeFilterKey("maxRent"),
    });
  }
  if (filters.minRent != null) {
    chips.push({
      key: "minRent",
      label: `≥ ${shortRent(filters.minRent)}`,
      onRemove: () => removeFilterKey("minRent"),
    });
  }
  if (Array.isArray(filters.localities)) {
    for (const loc of filters.localities) {
      chips.push({
        key: `loc-${loc}`,
        label: loc,
        onRemove: () => removeArrayItem("localities", loc),
      });
    }
  }
  if (filters.furnished) {
    const canon = normalizeFurnished(filters.furnished) ?? filters.furnished;
    chips.push({
      key: "furnished",
      label: FURNISHED_LABEL[canon] ?? String(filters.furnished),
      onRemove: () => removeFilterKey("furnished"),
    });
  }
  if (filters.source) {
    const canon = normalizeSource(filters.source) ?? filters.source;
    chips.push({
      key: "source",
      label: SOURCE_NAME[canon] ?? String(filters.source),
      onRemove: () => removeFilterKey("source"),
    });
  }
  if (Array.isArray(filters.amenities)) {
    for (const a of filters.amenities) {
      const canon = normalizeAmenity(a) ?? a;
      chips.push({
        key: `am-${a}`,
        label: AMENITY_LABEL[canon] ?? String(a),
        onRemove: () => removeArrayItem("amenities", a),
      });
    }
  }

  const hasFilters = Object.keys(filters).length > 0;
  const countTruncated =
    hasFilters && filteredListings.length < allListings.length;

  return (
    <>
      <style>{`
        @keyframes trurent-chip-in {
          from { opacity: 0; transform: translateY(-2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .trurent-chip { animation: trurent-chip-in 150ms ease forwards; }
        .trurent-chip-x { transition: color 150ms ease; }
        .trurent-chip-x:hover { color: var(--text-primary) !important; }
        .trurent-list-link { transition: color 150ms ease, border-color 150ms ease; }
        .trurent-list-link:hover { color: var(--text-primary); border-color: var(--text-primary); }
        @media (max-width: 768px) {
          .trurent-topbar {
            top: 12px !important;
            left: 12px !important;
          }
          .trurent-logo { font-size: 18px !important; }
          .trurent-legend { display: none !important; }
        }
      `}</style>

      <main
        style={{
          width: "100vw",
          height: "100dvh",
          background: "var(--bg-base)",
          position: "relative",
          overflow: "hidden",
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      >
        {/* Map layer. zIndex 0 creates a stacking context that contains
            Leaflet's internal pane z-indexes (200, 600, 1000) so they don't
            escape and bury the overlay UI above. */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <MapWrapper
            listings={filteredListings}
            selectedId={selectedListing?.id}
            onSelectListing={setSelectedListing}
          />
        </div>

        {/* Subtle cream vignette to soften the map edges into the page */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 40%, rgba(246,244,239,0.55) 100%)",
            zIndex: 5,
          }}
        />

        {/* Top bar */}
        <div
          className="trurent-topbar"
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: "calc(100vw - 40px)",
          }}
        >
          {/* Brand cluster */}
          <div>
            <span
              className="trurent-logo"
              style={{
                fontFamily: "var(--font-playfair), serif",
                fontSize: 26,
                fontWeight: 400,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              Tru
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#E8FF6A",
                  marginLeft: 1,
                  verticalAlign: "middle",
                  flexShrink: 0,
                }}
              />
              Rent
            </span>
            <div
              className="trurent-tagline"
              style={{
                marginTop: 4,
                fontFamily: "var(--font-playfair), serif",
                fontStyle: "italic",
                fontSize: 12,
                color: "var(--text-tertiary)",
                letterSpacing: "0.01em",
              }}
            >
              Skip the brokers · Bangalore
            </div>
            <a
              href="/post"
              className="trurent-list-link"
              style={{
                display: "inline-block",
                marginTop: 6,
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontSize: 11,
                color: "var(--text-secondary)",
                textDecoration: "none",
                borderBottom: "1px solid var(--border-default)",
                paddingBottom: 1,
                letterSpacing: "0.02em",
              }}
            >
              List your flat &rarr;
            </a>
          </div>

          {/* Count: editorial number, not a pill */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-dm-mono), monospace",
                fontSize: 32,
                color: "var(--text-primary)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <AnimatedNumber value={filteredListings.length} />
            </span>
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-tertiary)",
              }}
            >
              {filteredListings.length === 1 ? "flat" : "flats"}
              {countTruncated && ` of ${allListings.length}`}
            </span>
            <span style={{ marginLeft: 8 }}>
              <FilterPanel filters={filters} setFilters={setFilters} />
            </span>
          </div>

          {/* "Updated Xh ago" line — only when scrape_meta is available */}
          {meta?.scrapedAt && (
            <div
              title={`${meta.listingCount} listings scraped from Reddit at ${meta.scrapedAt}`}
              style={{
                marginTop: -6,
                fontSize: 11,
                color: "var(--text-tertiary)",
                letterSpacing: "0.04em",
                fontFamily: "var(--font-dm-sans), sans-serif",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#16A34A",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              Live from Reddit · updated {relativeTimeFrom(meta.scrapedAt)}
            </div>
          )}

          {/* Filter chips */}
          {chips.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className="trurent-chip"
                  style={{
                    background: "rgba(255,255,255,0.75)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    padding: "3px 8px 3px 10px",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {chip.label}
                  <button
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label}`}
                    className="trurent-chip-x"
                    style={{
                      marginLeft: 6,
                      color: "var(--text-tertiary)",
                      fontSize: 13,
                      lineHeight: 1,
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Bottom-left footer cluster, hidden when a listing card is open */}
        {!selectedListing && (
          <div
            className="trurent-legend"
            style={{
              position: "absolute",
              bottom: 24,
              left: 20,
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-start",
              transition: "opacity 200ms ease",
            }}
          >
            {/* Rent legend: single horizontal row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: "rgba(255,255,255,0.75)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                padding: "8px 14px",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                fontFamily: "var(--font-dm-sans), sans-serif",
              }}
            >
              {[
                { color: "#16A34A", label: "< ₹20k" },
                { color: "#D97706", label: "₹20–35k" },
                { color: "#DC2626", label: "> ₹35k" },
              ].map(({ color, label }) => (
                <span
                  key={label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-mono), monospace",
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "transparent",
                      border: `1.5px solid ${color}`,
                      flexShrink: 0,
                      boxSizing: "border-box",
                    }}
                  />
                  {label}
                </span>
              ))}
              <span
                style={{
                  marginLeft: 4,
                  paddingLeft: 14,
                  borderLeft: "1px solid var(--border-subtle)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-dm-mono), monospace",
                }}
              >
                <span style={{ color: "#2563EB", fontSize: 13 }}>♂</span>
                <span style={{ color: "#DB2777", fontSize: 13 }}>♀</span>
                <span style={{ fontStyle: "italic", fontFamily: "var(--font-playfair), serif" }}>
                  tenant pref
                </span>
              </span>
            </div>

          </div>
        )}

        {/* Empty state: only when filters are active AND nothing matches */}
        {hasFilters && filteredListings.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 25,
              maxWidth: 360,
              padding: "20px 24px",
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(20px) saturate(140%)",
              WebkitBackdropFilter: "blur(20px) saturate(140%)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              textAlign: "center",
              fontFamily: "var(--font-dm-sans), sans-serif",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-playfair), serif",
                fontStyle: "italic",
                fontSize: 18,
                color: "var(--text-primary)",
                marginBottom: 6,
                letterSpacing: "-0.01em",
              }}
            >
              Nothing matches.
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              Try widening the price range, picking another area, or tell the
              assistant what to relax.
            </div>
            <button
              onClick={() => setFilters({})}
              style={{
                background: "var(--accent-primary)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent-primary)";
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Listing detail card */}
        <ListingCard
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
        />

        {/* Chat widget: collapses to FAB when a listing is open */}
        <ChatWidget
          onFiltersUpdate={handleFiltersUpdate}
          forceCollapsed={!!selectedListing}
        />
      </main>
    </>
  );
}
