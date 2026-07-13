import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("gift");

export default function GiftPage() {
  return (
    <>
      <BreadcrumbStructuredData route="gift" />
      <StaticPage contentKey="gift" />
    </>
  );
}
