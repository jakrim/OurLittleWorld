import type { Metadata } from "next";

import StaticPage from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "Story",
  description: "The story and principles behind Our Little World, a private baby book for family memories.",
};

export default function StoryPage() {
  return <StaticPage contentKey="story" />;
}
