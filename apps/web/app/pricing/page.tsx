import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Family at $7.99/month or $69.99/year for the private baby book most families keep up with. Vault at $14.99/month adds longer videos and original backup.",
};

export default function PricingPage() {
  return <StaticPage contentKey="pricing" />;
}
