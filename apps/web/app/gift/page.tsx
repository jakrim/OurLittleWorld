import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { giftOfferCopy } from "@/content/giftOffer";

export const metadata: Metadata = {
  title: "Purchase for a Friend",
  description: `Gift a ${giftOfferCopy.family.price} Family year of Our Little World to grandparents, photographers, doulas, employers, clients, or new-parent families.`,
};

export default function GiftPage() {
  return (
    <>
      <BreadcrumbStructuredData route="gift" />
      <StaticPage contentKey="gift" />
    </>
  );
}
