/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          overlay: "var(--bg-overlay)",
        },
        border: {
          subtle: "var(--border-subtle)",
          default: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        accent: {
          primary: "var(--accent-primary)",
          hover: "var(--accent-hover)",
        },
        source: {
          nobroker: "var(--source-nobroker)",
          magicbricks: "var(--source-magicbricks)",
          "99acres": "var(--source-99acres)",
        },
        rent: {
          low: "var(--rent-low)",
          mid: "var(--rent-mid)",
          high: "var(--rent-high)",
        },
      },
      fontFamily: {
        display: ["var(--font-playfair)", "serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.02em",
        wideish: "0.06em",
        wider2: "0.1em",
      },
      borderRadius: {
        bubble: "20px",
      },
    },
  },
  plugins: [],
};
