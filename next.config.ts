import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The AI knowledge base files are read from disk by the ingestion route.
  outputFileTracingIncludes: { "/api/brain/ingest": ["./data/kb/**/*"], "/staff/brain": ["./data/kb/**/*"] },
};
export default nextConfig;
