import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Partner with Our Little World to gift private baby books through photographers, doulas, registries, employers, and family brands.",
};

export default function PartnersPage() {
  return <StaticPage contentKey="partners" />;
}
