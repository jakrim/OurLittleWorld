import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/partners/", "/checkout/"],
    },
    sitemap: "https://ourlittleworld.me/sitemap.xml",
  };
}
