/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  async headers() {
    // Security headers applied to every route. Defense-in-depth — none of
    // these replace input validation, RLS, or auth, but they raise the cost
    // of common attacks and stop browsers from doing dumb things.
    return [
      {
        source: "/:path*",
        headers: [
          // Block MIME-type sniffing. If we serve a JS file as text/html, the
          // browser shouldn't execute it.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't let the site get framed (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Don't leak the full referrer URL when the user clicks an outbound
          // link (e.g. WhatsApp deep-link from a listing card). Origin-only is
          // enough for analytics and respects renter privacy.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Tell browsers to opt into the safer permission model. We don't
          // need any of these permissions explicitly except geolocation (for
          // the LocationPicker "Use my location" button on /post).
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          // HSTS — Vercel terminates TLS, so this just tells browsers to
          // refuse plain-HTTP downgrades for the next year.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
