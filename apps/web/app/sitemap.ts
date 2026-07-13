import type { MetadataRoute } from "next";

import { sitemapEntries } from "../lib/siteSeo.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
