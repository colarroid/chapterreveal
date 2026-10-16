import type { MetadataRoute } from "next";
import { LEGAL, SITE_URL } from "@/lib/brand";

// The public pages. The legal pages change rarely; their date is LEGAL.updated.
export default function sitemap(): MetadataRoute.Sitemap {
  const legal = new Date(LEGAL.updated);
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
  ];
}
