import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Our Little World privacy policy for a private baby book built around family memories, selected photos, notes, milestones, and letters.",
};

export default function PrivacyPage() {
  return <StaticPage contentKey="privacy" />;
}
