import type { MetadataRoute } from "next";

const baseUrl = "https://ourlittleworld.me";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", priority: 1, changeFrequency: "weekly" as const },
    { path: "/story/", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/pricing/", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/gift/", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/privacy/", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/terms/", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/refunds/", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/for/unfinished-baby-book/", priority: 0.7, changeFrequency: "monthly" as const },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date("2026-07-13T00:00:00.000Z"),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
