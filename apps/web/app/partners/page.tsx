import type { Metadata } from "next";
import { notFound } from "next/navigation";

import StaticPage from "@/components/StaticPage";
import { publicCommercialConfig } from "@/lib/commercialConfig";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Partner with Our Little World to gift private baby books through photographers, doulas, registries, employers, and family brands.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PartnersPage() {
  if (!publicCommercialConfig.partnersEnabled) notFound();
  return <StaticPage contentKey="partners" />;
}
