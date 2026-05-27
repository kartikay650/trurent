"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Bangalore bounds — coordinates outside this should be rejected. Roughly
// covers the metro and inner periphery.
const BLR_BOUNDS = {
  minLat: 12.7,
  maxLat: 13.2,
  minLng: 77.4,
  maxLng: 77.85,
};
const BLR_CENTER = [12.9716, 77.5946];

// Distinctive pin SVG so it reads as "your pick" rather than a generic marker.
const PIN_ICON = L.divIcon({
  className: "trurent-pin-marker",
  html: `
    <div style="position:relative;width:32px;height:42px;">
      <svg viewBox="0 0 32 42" width="32" height="42" fill="none">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 11.5 16 26 16 26s16-14.5 16-26c0-8.84-7.16-16-16-16z"
              fill="#D97706" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
      </svg>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

function inBangalore(lat, lng) {
  return (
    lat >= BLR_BOUNDS.minLat &&
    lat <= BLR_BOUNDS.maxLat &&
    lng >= BLR_BOUNDS.minLng &&
    lng <= BLR_BOUNDS.maxLng
  );
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (inBangalore(lat, lng)) {
        onPick({ lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
      }
    },
  });
  return null;
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [center?.[0], center?.[1]]);
  return null;
}

export default function LocationPickerInner({
  value,           // { lat, lng } | null
  onChange,        // ({lat,lng}) => void
  initialCenter,   // optional [lat, lng]
}) {
  const center = useMemo(() => initialCenter || BLR_CENTER, [initialCenter]);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const markerRef = useRef(null);

  function handlePick(latlng) {
    setError("");
    onChange(latlng);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support geolocation.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = +pos.coords.latitude.toFixed(5);
        const lng = +pos.coords.longitude.toFixed(5);
        if (!inBangalore(lat, lng)) {
          setError("Your location is outside Bangalore. Please drop a pin manually.");
          return;
        }
        onChange({ lat, lng });
      },
      (err) => {
        setLocating(false);
        setError(err.code === 1 ? "Location permission denied." : "Couldn't get your location.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  const flyTarget = value ? [value.lat, value.lng] : null;

  return (
    <div>
      <div
        style={{
          height: 280,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border-default)",
          position: "relative",
        }}
      >
        <MapContainer
          center={center}
          zoom={value ? 16 : 12}
          minZoom={11}
          maxZoom={18}
          maxBounds={[
            [BLR_BOUNDS.minLat - 0.05, BLR_BOUNDS.minLng - 0.05],
            [BLR_BOUNDS.maxLat + 0.05, BLR_BOUNDS.maxLng + 0.05],
          ]}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={handlePick} />
          <FlyTo center={flyTarget} />
          {value && (
            <Marker
              ref={markerRef}
              position={[value.lat, value.lng]}
              icon={PIN_ICON}
              draggable={true}
              eventHandlers={{
                dragend: () => {
                  const m = markerRef.current;
                  if (!m) return;
                  const ll = m.getLatLng();
                  if (inBangalore(ll.lat, ll.lng)) {
                    onChange({
                      lat: +ll.lat.toFixed(5),
                      lng: +ll.lng.toFixed(5),
                    });
                  } else {
                    // Snap back if the drag ended outside Bangalore.
                    m.setLatLng([value.lat, value.lng]);
                    setError("Pin must stay within Bangalore.");
                  }
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          {value
            ? `Pin: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} (drag to refine)`
            : "Tap or click the map to drop a pin at your flat's location."}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          style={{
            background: "none",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 11,
            color: "var(--text-secondary)",
            cursor: locating ? "wait" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {locating ? "Locating..." : "Use my location"}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#B91C1C" }}>{error}</div>
      )}
    </div>
  );
}

export { inBangalore, BLR_CENTER };
