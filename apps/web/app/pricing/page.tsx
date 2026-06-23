import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose a private baby book plan for your family, starting at $4.99 monthly or $3.99/month when billed yearly.",
};

export default function PricingPage() {
  return <StaticPage contentKey="pricing" />;
}
