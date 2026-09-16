import type { NextConfig } from "next";

// ponytail: EdgeOne serves static assets only, and its builder wants a real
// index.html at the output root (Next's .next/ keeps prerendered HTML in
// server/app/). BUILD_STATIC=1 switches to a static export into out/.
// Export mode rejects rewrites, so the z.ai proxy only exists in server mode.
const isStaticExport = process.env.BUILD_STATIC === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" as const } : {}),
  ...(isStaticExport
    ? {}
    : {
        // ponytail: api.z.ai sends no CORS headers, so browser-direct calls die
        // with "Connection error". The Next server we already run proxies
        // same-origin. Keys still go localhost → z.ai only (D3 local-first).
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
      }),
};

export default nextConfig;
