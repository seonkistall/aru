import type { NextConfig } from "next";

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  "'wasm-unsafe-eval'",
  ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${scriptSources}`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Unset everywhere except the e2e switch-on server, which builds a SECOND copy of this
  // app with `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` inlined while the gate's own build is
  // running. `next build` empties its `distDir`, so the two builds need separate ones or
  // they delete each other's output. See tests/e2e/support/commerce-switch-on.ts.
  ...(process.env.ARU_DIST_DIR ? { distDir: process.env.ARU_DIST_DIR } : {}),
  // Pin the workspace root to this app. A stray package-lock.json exists in the
  // home directory, which made Next infer the wrong root. __dirname keeps it here.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
