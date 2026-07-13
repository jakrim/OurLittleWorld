import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";
import { exportPolicyCopy } from "@/content/exportPolicy";
import { giftOfferCopy } from "@/content/giftOffer";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    `Family at $7.99/month or $69.99/year for the private baby book most families keep up with. Gift a Family year for ${giftOfferCopy.family.price}. Vault at $14.99/month adds longer videos and original backup. ${exportPolicyCopy.lapsedVault}`,
};

export default function PricingPage() {
  return <StaticPage contentKey="pricing" />;
}
