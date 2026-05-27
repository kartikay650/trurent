"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { shortRent } from "@/lib/filterListings";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function rentColor(rent) {
  if (rent < 20000) return "#16A34A";
  if (rent <= 35000) return "#D97706";
  return "#DC2626";
}

// Gender preference glyph + accent color. These render right after the rent
// in the marker label so renters can scan the map without opening cards.
//   any    -> no glyph (neutral)
//   male   -> ♂ (blue tint)
//   female -> ♀ (pink tint)
function genderGlyph(pref) {
  if (pref === "male") return { glyph: "♂", tint: "#2563EB" };
  if (pref === "female") return { glyph: "♀", tint: "#DB2777" };
  return null;
}

function buildIcon(listing, isSelected) {
  const color = rentColor(listing.rent);
  const star = listing.brokerage === 0 ? "★ " : "";
  const rentLabel = shortRent(listing.rent);
  const gender = genderGlyph(listing.genderPreference);
  const bg = isSelected ? "#1C1B18" : "#FFFFFF";
  const fg = isSelected ? "#FFFFFF" : "#1C1B18";
  const borderWidth = isSelected ? "2.5px" : "1.5px";
  const shadow = isSelected
    ? "0 4px 14px rgba(28,27,24,0.22)"
    : "0 2px 6px rgba(28,27,24,0.10)";

  // When isSelected the foreground is light, so use a lighter tint for the
  // gender glyph so it stays legible on the dark pill.
  const glyphColor = gender
    ? isSelected
      ? "#FFFFFF"
      : gender.tint
    : "transparent";
  const glyphHtml = gender
    ? `<span style="margin-left:6px;color:${glyphColor};font-size:13px;line-height:1;display:inline-block;vertical-align:-1px;">${gender.glyph}</span>`
    : "";

  const html =
    `<div style="background:${bg};color:${fg};` +
    `border:${borderWidth} solid ${color};border-radius:20px;` +
    `padding:4px 10px;font-size:11px;font-family:'DM Mono',monospace;` +
    `font-weight:500;white-space:nowrap;cursor:pointer;letter-spacing:-0.02em;` +
    `box-shadow:${shadow};display:inline-flex;align-items:center;">` +
    `<span>${star}${rentLabel}</span>${glyphHtml}</div>`;

  return L.divIcon({
    html,
    className: "",
    iconAnchor: [40, 12],
  });
}

function MapController({ listings, selectedId, onSelectListing }) {
  const map = useMap();
  const markersRef = useRef({});
  const handlerRef = useRef(onSelectListing);

  useEffect(() => {
    handlerRef.current = onSelectListing;
  }, [onSelectListing]);

  useEffect(() => {
    const existing = markersRef.current;
    const incoming = new Set();

    for (const listing of listings) {
      incoming.add(listing.id);
      const isSelected = listing.id === selectedId;

      if (existing[listing.id]) {
        existing[listing.id].setIcon(buildIcon(listing, isSelected));
      } else {
        const marker = L.marker([listing.lat, listing.lng], {
          icon: buildIcon(listing, isSelected),
        });
        marker.on("click", () => handlerRef.current?.(listing));
        marker.addTo(map);
        existing[listing.id] = marker;
      }
    }

    for (const id of Object.keys(existing)) {
      if (!incoming.has(id)) {
        map.removeLayer(existing[id]);
        delete existing[id];
      }
    }
  }, [listings, selectedId, map]);

  useEffect(() => {
    if (!selectedId) return;
    const listing = listings.find((l) => l.id === selectedId);
    if (!listing) return;
    map.flyTo([listing.lat, listing.lng], map.getZoom(), {
      animate: true,
      duration: 0.4,
    });
  }, [selectedId, listings, map]);

  // Fit map bounds to the currently-shown listings so a "Koramangala" search
  // visibly zooms into Koramangala, while "show me everything" zooms back out
  // to all of Bangalore. ONLY runs when the listing set itself changes (e.g.
  // a new filter); closing a listing card no longer refits the map.
  const lastListingsKeyRef = useRef("");
  useEffect(() => {
    if (!listings || listings.length === 0) return;

    const key = listings.map((l) => l.id).sort().join("|");
    if (key === lastListingsKeyRef.current) return; // listing set unchanged
    lastListingsKeyRef.current = key;

    const lats = listings.map((l) => l.lat);
    const lngs = listings.map((l) => l.lng);
    const sw = [Math.min(...lats), Math.min(...lngs)];
    const ne = [Math.max(...lats), Math.max(...lngs)];

    if (Math.abs(sw[0] - ne[0]) < 0.001 && Math.abs(sw[1] - ne[1]) < 0.001) {
      map.flyTo([sw[0], sw[1]], 14, { animate: true, duration: 0.6 });
    } else {
      map.flyToBounds([sw, ne], {
        padding: [80, 80],
        duration: 0.6,
        maxZoom: 14,
        animate: true,
      });
    }
  }, [listings, map]);

  // Soft "search area" overlay: translucent circles around each cluster of
  // listings, so the searched area reads visually like the reference image.
  // Only shown when there's a meaningful focus (< 30 listings AND fewer than
  // ~half the dataset visible).
  const areaLayerRef = useRef(null);
  useEffect(() => {
    if (areaLayerRef.current) {
      map.removeLayer(areaLayerRef.current);
      areaLayerRef.current = null;
    }
    if (!listings || listings.length === 0) return;
    if (listings.length > 30) return; // too broad to highlight a "search area"

    // Group listings by locality so we can highlight each cluster.
    // Using a plain object because `Map` in this file refers to the React
    // component below; `new Map()` would invoke the component as a constructor.
    const byLocality = {};
    for (const l of listings) {
      if (!byLocality[l.locality]) byLocality[l.locality] = [];
      byLocality[l.locality].push(l);
    }

    const group = L.layerGroup();
    for (const items of Object.values(byLocality)) {
      const avgLat = items.reduce((s, l) => s + l.lat, 0) / items.length;
      const avgLng = items.reduce((s, l) => s + l.lng, 0) / items.length;
      // Radius scales gently with cluster size; capped so it doesn't dominate
      const radius = 800 + Math.min(items.length, 8) * 60;
      L.circle([avgLat, avgLng], {
        radius,
        color: "#1C1B18",
        weight: 1,
        opacity: 0.35,
        fillColor: "#1C1B18",
        fillOpacity: 0.04,
        dashArray: "4 4",
        interactive: false,
      }).addTo(group);
    }
    group.addTo(map);
    areaLayerRef.current = group;
  }, [listings, map]);

  return null;
}

export default function Map({ listings, selectedId, onSelectListing }) {
  return (
    <MapContainer
      center={[12.9716, 77.5946]}
      zoom={11}
      minZoom={10}
      maxZoom={17}
      zoomControl={false}
      style={{ width: "100%", height: "100%", background: "#F6F4EF" }}
    >
      <ZoomControl position="bottomright" />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution="© OpenStreetMap contributors © CARTO"
      />
      <MapController
        listings={listings}
        selectedId={selectedId}
        onSelectListing={onSelectListing}
      />
    </MapContainer>
  );
}
