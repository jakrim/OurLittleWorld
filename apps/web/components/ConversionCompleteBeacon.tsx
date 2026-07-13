"use client";

import { useEffect } from "react";

import { trackMarketingEvent } from "@/lib/marketingAnalytics";

export default function ConversionCompleteBeacon({ kind }: { kind: "purchase" | "gift" }) {
  useEffect(() => {
    void trackMarketingEvent(kind === "gift" ? "gift_completed" : "checkout_completed", {
      path: kind === "gift" ? "/checkout/gift-success" : "/checkout/success",
      surface: kind === "gift" ? "web_gift" : "web_pricing",
    });
  }, [kind]);
  return null;
}
