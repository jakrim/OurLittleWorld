import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Purchase for a Friend",
  description: "Gift a $48 year of Our Little World to a friend, sibling, client, or new-parent couple.",
};

export default function GiftPage() {
  return <StaticPage contentKey="gift" />;
}
