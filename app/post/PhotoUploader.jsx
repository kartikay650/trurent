"use client";

import { useEffect, useRef, useState } from "react";

const MAX_PHOTOS = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function PhotoUploader({ photos, onChange }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  // Map of File -> objectURL so previews render without re-reading the file
  // on every keystroke elsewhere on the form.
  const [previews, setPreviews] = useState(() => new Map());

  // Sync preview URLs to the current photos array. Revoke any URLs that
  // belong to files no longer in the list to avoid leaking blobs.
  useEffect(() => {
    setPreviews((prev) => {
      const next = new Map();
      for (const file of photos) {
        if (prev.has(file)) {
          next.set(file, prev.get(file));
        } else {
          next.set(file, URL.createObjectURL(file));
        }
      }
      for (const [file, url] of prev) {
        if (!next.has(file)) URL.revokeObjectURL(url);
      }
      return next;
    });
  }, [photos]);

  // Revoke everything on unmount.
  useEffect(() => {
    return () => {
      for (const url of previews.values()) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFiles(files) {
    setError("");
    const incoming = Array.from(files || []);
    const accepted = [];
    const rejected = [];

    for (const file of incoming) {
      if (!ALLOWED_MIME.has(file.type)) {
        rejected.push(`${file.name}: unsupported type (use JPG, PNG, or WebP)`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejected.push(`${file.name}: too large (max 8MB)`);
        continue;
      }
      accepted.push(file);
    }

    const merged = [...photos, ...accepted].slice(0, MAX_PHOTOS);
    const overflow = photos.length + accepted.length - MAX_PHOTOS;
    if (overflow > 0) {
      rejected.push(`${overflow} extra photo(s) ignored (max ${MAX_PHOTOS}).`);
    }
    onChange(merged);
    if (rejected.length) setError(rejected.join(" · "));
  }

  function removeAt(index) {
    const next = photos.slice();
    next.splice(index, 1);
    onChange(next);
    setError("");
  }

  const canAddMore = photos.length < MAX_PHOTOS;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          handleFiles(e.target.files);
          // Reset so the same file can be picked again after removal.
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      {photos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {photos.map((file, i) => {
            const url = previews.get(file);
            return (
              <div
                key={`${file.name}-${file.size}-${i}`}
                style={{
                  position: "relative",
                  aspectRatio: "4 / 3",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                }}
              >
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.7)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ×
                </button>
                {i === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 4,
                      bottom: 4,
                      background: "rgba(255,255,255,0.92)",
                      color: "var(--text-primary)",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "2px 5px",
                      borderRadius: 3,
                    }}
                  >
                    Cover
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canAddMore}
          style={{
            background: canAddMore ? "var(--bg-elevated)" : "transparent",
            border: "1px dashed var(--border-default)",
            borderRadius: 6,
            padding: "10px 16px",
            fontSize: 12,
            color: canAddMore ? "var(--text-primary)" : "var(--text-tertiary)",
            cursor: canAddMore ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {photos.length === 0 ? "Add photos" : canAddMore ? "Add more" : "Limit reached"}
        </button>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {photos.length} of {MAX_PHOTOS} · JPG / PNG / WebP · 8MB each
        </span>
      </div>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#B91C1C", lineHeight: 1.4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
