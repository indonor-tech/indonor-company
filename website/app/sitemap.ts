import type { MetadataRoute } from "next";
import { absoluteUrl, pageSeo } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return Object.values(pageSeo).map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: now,
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.path === "/" ? 1 : 0.8,
  }));
}
