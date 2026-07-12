"use client";

import { useEffect } from "react";

import { trackMarketingEvent } from "@/lib/marketingAnalytics";

export default function ConversionCompleteBeacon({
  kind,
  hasProviderReceipt,
}: {
  kind: "purchase" | "gift";
  hasProviderReceipt: boolean;
}) {
  useEffect(() => {
    if (!hasProviderReceipt) return;
    const key = `olw.conversion-return.${kind}.v1`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "recorded");
    void trackMarketingEvent(kind === "gift" ? "gift_completed" : "checkout_completed", {
      path: kind === "gift" ? "/checkout/gift-success" : "/checkout/success",
      surface: kind === "gift" ? "web_gift" : "web_pricing",
    });
  }, [hasProviderReceipt, kind]);
  return null;
}
