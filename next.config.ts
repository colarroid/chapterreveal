import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge would show up on the projector and in vMix.
  devIndicators: false,
  experimental: {
    // Pages visited in the last 30 s reopen instantly from memory (tab
    // switching, the back button) instead of waiting on the server again.
    // Saving anything calls router.refresh(), which skips this.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        // The offline worker: always checked for a new version.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // The Bible files never change under the same name.
        source: "/bibles/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
          // The admin site (another subdomain) reads these to preview them.
          // Public-domain text, so any origin may.
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
