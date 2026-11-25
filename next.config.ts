import type { NextConfig } from "next";

/**
 * Baseline security headers. Chosen so they cannot change how pages render or script:
 *  - microphone stays allowed for the same origin (voice dictation uses getUserMedia in components/Mic.tsx);
 *  - X-Frame-Options is SAMEORIGIN, not DENY, in case the kiosk shell frames its own pages;
 *  - HSTS has no includeSubDomains/preload (those are one-way doors; decide them with the domain owner).
 * A Content-Security-Policy is deliberately NOT set here: Next.js injects inline scripts, so a CSP needs a per-request nonce
 * (set from proxy.ts) and a full browser pass first. See docs/DEPLOYMENT_CHECKLIST.md, "CSP recommendation".
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The AI knowledge base files are read from disk by the ingestion route.
  outputFileTracingIncludes: { "/api/brain/ingest": ["./data/kb/**/*"], "/staff/brain": ["./data/kb/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
