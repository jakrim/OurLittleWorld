import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("home");

export default function HomePage() {
  return <StaticPage contentKey="home" />;
}
