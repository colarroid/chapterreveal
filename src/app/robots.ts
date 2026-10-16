import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

// Search engines may read the public pages; the church console, settings,
// projector output and account steps are private and stay out of results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/songs", "/history", "/settings", "/onboarding", "/screen/", "/api/", "/auth/", "/reset-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
