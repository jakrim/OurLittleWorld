import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Our Little World",
    short_name: "Our Little World",
    description:
      "A private, parent-approved baby book for selected photos, firsts, voice notes, and letters.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf4ee",
    theme_color: "#faf4ee",
    icons: [
      {
        src: "/assets/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
