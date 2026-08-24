import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("story");

export default function StoryPage() {
  return (
    <>
      <BreadcrumbStructuredData route="story" />
      <StaticPage contentKey="story" />
    </>
  );
}
