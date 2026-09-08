import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ponytail: api.z.ai sends no CORS headers, so browser-direct calls die with
  // "Connection error". The Next server we already run proxies same-origin.
  // Keys still go localhost → z.ai only (D3 local-first intact). Drop these
  // rewrites if z.ai ever ships Access-Control-Allow-Origin.
  async rewrites() {
    return [
      {
        source: "/api/zai-standard/:path*",
        destination: "https://api.z.ai/api/paas/v4/:path*",
      },
      {
        source: "/api/zai-coding/:path*",
        destination: "https://api.z.ai/api/coding/paas/v4/:path*",
      },
    ];
  },
};

export default nextConfig;
