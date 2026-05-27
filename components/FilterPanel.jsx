"use client";

import { useEffect, useRef, useState } from "react";

const LOCALITIES = [
  "Koramangala",
  "Indiranagar",
  "HSR Layout",
  "Whitefield",
  "Bellandur",
  "Sarjapur Road",
  "Marathahalli",
  "BTM Layout",
  "Jayanagar",
  "JP Nagar",
  "Banashankari",
  "Bannerghatta Road",
  "Hebbal",
  "Yelahanka",
  "Electronic City",
  "Bommanahalli",
  "Hennur",
  "Frazer Town",
  "Cunningham Road",
  "Richmond Town",
  "Ulsoor",
  "Domlur",
  "Malleshwaram",
  "Rajajinagar",
  "Vijayanagar",
  "RT Nagar",
  "Old Airport Road",
  "CV Raman Nagar",
  "Kasturi Nagar",
  "Kalyan Nagar",
  "Brookefield",
  "Hoodi",
  "Kadugodi",
  "Mahadevapura",
];

const AMENITIES = [
  { key: "gym", label: "Gym" },
  { key: "pool", label: "Pool" },
  { key: "parking", label: "Parking" },
  { key: "power_backup", label: "Power backup" },
  { key: "garden", label: "Garden" },
  { key: "security", label: "Security" },
  { key: "club", label: "Club house" },
];

const FURNISHED = [
  { key: "fully", label: "Fully" },
  { key: "semi", label: "Semi" },
  { key: "unfurnished", label: "Unfurnished" },
];

export default function FilterPanel({ filters, setFilters }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Click-outside closes the popover.
  useEffect(() => {
    if (!isOpen) return;
    function onDocClick(e) {
      if (
        panelRef.current?.contains(e.target) ||
        buttonRef.current?.contains(e.target)
      ) {
        return;
      }
      setIsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen]);

  const bhkSet = new Set(
    Array.isArray(filters.bhk) ? filters.bhk : filters.bhk != null ? [filters.bhk] : [],
  );
  const localitySet = new Set(filters.localities ?? []);
  const amenitySet = new Set(filters.amenities ?? []);

  function toggleBhk(n) {
    const next = new Set(bhkSet);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setFilters((f) => {
      const out = { ...f };
      if (next.size === 0) delete out.bhk;
      else out.bhk = [...next].sort();
      return out;
    });
  }

  function toggleLocality(loc) {
    const next = new Set(localitySet);
    if (next.has(loc)) next.delete(loc);
    else next.add(loc);
    setFilters((f) => {
      const out = { ...f };
      if (next.size === 0) delete out.localities;
      else out.localities = [...next];
      return out;
    });
  }

  function toggleAmenity(key) {
    const next = new Set(amenitySet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFilters((f) => {
      const out = { ...f };
      if (next.size === 0) delete out.amenities;
      else out.amenities = [...next];
      return out;
    });
  }

  function setFurnished(key) {
    setFilters((f) => {
      const out = { ...f };
      if (f.furnished === key) delete out.furnished;
      else out.furnished = key;
      return out;
    });
  }

  function setRent(field, value) {
    setFilters((f) => {
      const out = { ...f };
      const num = parseInt(value, 10);
      if (!value || Number.isNaN(num) || num <= 0) delete out[field];
      else out[field] = num;
      return out;
    });
  }

  function toggleNoBroker() {
    setFilters((f) => {
      const out = { ...f };
      if (f.noBrokerageOnly) delete out.noBrokerageOnly;
      else out.noBrokerageOnly = true;
      return out;
    });
  }

  function setListingType(value) {
    setFilters((f) => {
      const out = { ...f };
      if (f.listingType === value) delete out.listingType;
      else out.listingType = value;
      return out;
    });
  }

  function setPostedWithin(days) {
    setFilters((f) => {
      const out = { ...f };
      if (f.postedWithinDays === days) delete out.postedWithinDays;
      else out.postedWithinDays = days;
      return out;
    });
  }

  function clearAll() {
    setFilters({});
  }

  const activeCount = [
    filters.bhk,
    filters.maxRent != null,
    filters.minRent != null,
    filters.localities?.length,
    filters.furnished,
    filters.noBrokerageOnly,
    filters.amenities?.length,
    filters.listingType,
    filters.postedWithinDays,
  ].filter(Boolean).length;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>{`
        .trurent-fp-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.85);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          padding: 4px 10px 4px 12px;
          font-size: 11px;
          font-family: var(--font-dm-sans), sans-serif;
          color: var(--text-secondary);
          cursor: pointer;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
          letter-spacing: -0.01em;
        }
        .trurent-fp-toggle:hover {
          background: var(--bg-surface);
          border-color: var(--border-strong);
          color: var(--text-primary);
        }
        .trurent-fp-toggle.active {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: #FFFFFF;
        }
        .trurent-fp-panel {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          width: 340px;
          max-width: calc(100vw - 40px);
          max-height: calc(100dvh - 120px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(24px) saturate(140%);
          -webkit-backdrop-filter: blur(24px) saturate(140%);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 16px;
          z-index: 35;
          font-family: var(--font-dm-sans), sans-serif;
          box-shadow: 0 8px 24px rgba(28,27,24,0.10);
        }
        @media (max-width: 768px) {
          .trurent-fp-panel {
            width: calc(100vw - 24px);
            left: -8px;
          }
        }
        .trurent-fp-row { margin-bottom: 14px; }
        .trurent-fp-row:last-child { margin-bottom: 0; }
        .trurent-fp-label {
          font-size: 10px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-tertiary);
          margin-bottom: 6px;
          display: block;
        }
        .trurent-fp-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          font-size: 11px;
          color: var(--text-secondary);
          cursor: pointer;
          margin: 0 4px 4px 0;
          font-family: inherit;
          letter-spacing: -0.01em;
          transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
        }
        .trurent-fp-chip:hover {
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        .trurent-fp-chip.on {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: #FFFFFF;
        }
        .trurent-fp-input {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 12px;
          color: var(--text-primary);
          font-family: var(--font-dm-mono), monospace;
          width: 96px;
          outline: none;
          transition: border-color 150ms ease;
        }
        .trurent-fp-input:focus { border-color: var(--border-strong); }
        .trurent-fp-locality-scroll {
          max-height: 132px;
          overflow-y: auto;
          padding-right: 4px;
          margin: 0 -4px;
          padding-left: 4px;
        }
        .trurent-fp-clear {
          background: none;
          border: none;
          color: var(--text-tertiary);
          font-size: 11px;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          letter-spacing: -0.01em;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .trurent-fp-clear:hover { color: var(--text-primary); }
      `}</style>

      <button
        ref={buttonRef}
        type="button"
        className={`trurent-fp-toggle${activeCount > 0 ? " active" : ""}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M 1.5 2.5 L 9.5 2.5 M 3 5.5 L 8 5.5 M 4.5 8.5 L 6.5 8.5" />
        </svg>
        Filters
        {activeCount > 0 ? ` · ${activeCount}` : ""}
      </button>

      {isOpen && (
        <div ref={panelRef} className="trurent-fp-panel">
          {/* Listing type */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">Listing type</span>
            <div>
              {[
                { value: "entire_flat", label: "Entire flat" },
                { value: "room", label: "Single room" },
                { value: "pg", label: "PG" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`trurent-fp-chip${filters.listingType === opt.value ? " on" : ""}`}
                  onClick={() => setListingType(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Posted */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">Posted</span>
            <div>
              {[
                { days: 1, label: "Last 24h" },
                { days: 7, label: "Last week" },
                { days: 30, label: "Last month" },
              ].map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  className={`trurent-fp-chip${filters.postedWithinDays === opt.days ? " on" : ""}`}
                  onClick={() => setPostedWithin(opt.days)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* BHK */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">Bedrooms</span>
            <div>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`trurent-fp-chip${bhkSet.has(n) ? " on" : ""}`}
                  onClick={() => toggleBhk(n)}
                >
                  {n === 5 ? "5+ BHK" : `${n} BHK`}
                </button>
              ))}
            </div>
          </div>

          {/* Rent range */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">Rent (₹/month)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                placeholder="min"
                className="trurent-fp-input"
                value={filters.minRent ?? ""}
                onChange={(e) => setRent("minRent", e.target.value)}
              />
              <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>to</span>
              <input
                type="number"
                placeholder="max"
                className="trurent-fp-input"
                value={filters.maxRent ?? ""}
                onChange={(e) => setRent("maxRent", e.target.value)}
              />
            </div>
          </div>

          {/* Localities */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">
              Localities{localitySet.size > 0 ? ` · ${localitySet.size} selected` : ""}
            </span>
            <div className="trurent-fp-locality-scroll">
              {LOCALITIES.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`trurent-fp-chip${localitySet.has(loc) ? " on" : ""}`}
                  onClick={() => toggleLocality(loc)}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Furnished */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">Furnished</span>
            <div>
              {FURNISHED.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`trurent-fp-chip${filters.furnished === f.key ? " on" : ""}`}
                  onClick={() => setFurnished(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div className="trurent-fp-row">
            <span className="trurent-fp-label">Amenities</span>
            <div>
              {AMENITIES.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={`trurent-fp-chip${amenitySet.has(a.key) ? " on" : ""}`}
                  onClick={() => toggleAmenity(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* No brokerage + clear */}
          <div
            className="trurent-fp-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 0,
            }}
          >
            <button
              type="button"
              className={`trurent-fp-chip${filters.noBrokerageOnly ? " on" : ""}`}
              onClick={toggleNoBroker}
              style={{ margin: 0 }}
            >
              Zero brokerage only
            </button>
            {activeCount > 0 && (
              <button type="button" className="trurent-fp-clear" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
