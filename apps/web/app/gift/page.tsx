import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Gift Plans",
  description: "Planned gift years are $70 for Family and $150 for Vault. Join for verified purchase and app-availability updates.",
};

export default function GiftPage() {
  return <StaticPage contentKey="gift" />;
}
