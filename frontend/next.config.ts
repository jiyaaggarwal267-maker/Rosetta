import type { NextConfig } from "next";

const api = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000").replace(/\/$/, "");
const dev = process.env.NODE_ENV !== "production";

/**
 * Only our own site and our API. Scripts allow 'unsafe-inline' because
 * Next.js and the theme script inline small bootstrap scripts; moving to
 * nonces would need every page rendered per request. Styles allow inline
 * because Mermaid draws flowcharts with inline styles. Development also
 * needs eval and a websocket for hot reload.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${api}${dev ? " ws: wss:" : ""}`,
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
