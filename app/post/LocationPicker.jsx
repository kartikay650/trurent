"use client";

// Dynamic Leaflet wrapper. Leaflet needs window/document so it can only
// render in the browser; ssr:false ensures Next.js doesn't try to render
// it on the server.

import dynamic from "next/dynamic";

const LocationPicker = dynamic(() => import("./LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 280,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-tertiary)",
        fontSize: 12,
      }}
    >
      Loading map...
    </div>
  ),
});

export default LocationPicker;
