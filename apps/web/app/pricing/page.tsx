import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("pricing");

export default function PricingPage() {
  return (
    <>
      <BreadcrumbStructuredData route="pricing" />
      <StaticPage contentKey="pricing" />
    </>
  );
}
