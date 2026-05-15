"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", background: "#0C0C0D" }} />
  ),
});

export default Map;
