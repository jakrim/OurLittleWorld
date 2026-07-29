import type { Metadata } from "next";
import { notFound } from "next/navigation";

import StaticPage from "@/components/StaticPage";
import { publicCommercialConfig } from "@/lib/commercialConfig";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("partners");

export default function PartnersPage() {
  if (!publicCommercialConfig.partnersEnabled) notFound();
  return <StaticPage contentKey="partners" />;
}
