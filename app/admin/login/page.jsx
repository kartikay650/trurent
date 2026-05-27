"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Login failed");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <span style={logoStyle}>
          Tru
          <span style={logoDotStyle} />
          Rent
        </span>
        <h1 style={titleStyle}>Admin sign-in</h1>
        <p style={subtitleStyle}>
          Restricted area. Credentials are not recoverable; the password
          generator script can mint fresh ones.
        </p>
        <form onSubmit={submit}>
          <Label>Username</Label>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
            autoFocus
          />
          <Label>Password</Label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          {error && <div style={errorStyle}>{error}</div>}
        </form>
      </div>
    </main>
  );
}

const Label = ({ children }) => (
  <label
    style={{
      display: "block",
      fontSize: 11,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "var(--text-tertiary)",
      marginTop: 14,
      marginBottom: 6,
    }}
  >
    {children}
  </label>
);

const pageStyle = {
  minHeight: "100dvh",
  background: "var(--bg-base)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  fontFamily: "var(--font-dm-sans), sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 380,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "28px 28px 32px",
};

const logoStyle = {
  fontFamily: "var(--font-playfair), serif",
  fontSize: 22,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const logoDotStyle = {
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--accent-glow)",
  marginLeft: 1,
  verticalAlign: "middle",
};

const titleStyle = {
  marginTop: 14,
  fontSize: 22,
  fontFamily: "var(--font-playfair), serif",
  fontWeight: 400,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const subtitleStyle = {
  marginTop: 6,
  marginBottom: 4,
  fontSize: 12,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
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

const buttonStyle = {
  marginTop: 18,
  width: "100%",
  background: "var(--accent-primary)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
};

const errorStyle = {
  marginTop: 12,
  fontSize: 12,
  color: "#B91C1C",
};
