"use client";

import { useEffect, useState } from "react";

import { publicCommercialConfig } from "@/lib/commercialConfig";
import { trackMarketingEvent } from "@/lib/marketingAnalytics";

type CheckoutState = {
  ready: boolean;
  state: string;
  code?: string;
};

export default function CheckoutCompletionStatus({
  kind,
  sessionId,
}: {
  kind: "purchase" | "gift";
  sessionId: string;
}) {
  const resolvedSessionId = sessionId || (typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.hash.slice(1)).get("session_id") || "");
  const [result, setResult] = useState<CheckoutState>({ ready: false, state: "processing" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!resolvedSessionId || !publicCommercialConfig.checkoutStatusEndpoint) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    async function check() {
      attempt += 1;
      try {
        const response = await fetch(publicCommercialConfig.checkoutStatusEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ session_id: resolvedSessionId }),
        });
        const payload = await response.json() as CheckoutState;
        if (disposed) return;
        setResult(payload);
        if (payload.ready) {
          const key = `olw.verified-conversion.${kind}.v2`;
          if (!window.sessionStorage.getItem(key)) {
            window.sessionStorage.setItem(key, "recorded");
            void trackMarketingEvent(kind === "gift" ? "gift_completed" : "checkout_completed", {
              path: kind === "gift" ? "/checkout/gift-success" : "/checkout/success",
              surface: kind === "gift" ? "web_gift" : "web_pricing",
              test_event: publicCommercialConfig.testMode,
            });
          }
          return;
        }
        if (payload.state === "processing" && attempt < 12) timer = setTimeout(check, 2000);
      } catch {
        if (!disposed && attempt < 12) timer = setTimeout(check, 2000);
        else if (!disposed) setResult({ ready: false, state: "unavailable" });
      }
    }

    void check();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [kind, resolvedSessionId]);

  const displayedResult = resolvedSessionId ? result : { ready: false, state: "missing" };

  if (displayedResult.ready && displayedResult.code) {
    return (
      <>
        <div className="code-box" aria-label={kind === "gift" ? "Gift code" : "Purchase code"}>{result.code}</div>
        <button
          className="button button-ghost"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(displayedResult.code || "");
            setCopied(true);
          }}
        >
          {copied ? "Code copied" : "Copy code"}
        </button>
        <p className="small">This code was released only after Stripe payment and the canonical purchase record were verified.</p>
      </>
    );
  }

  return <p role="status" aria-live="polite">{statusCopy(displayedResult.state)}</p>;
}

function statusCopy(state: string) {
  if (state === "missing" || state === "invalid") return "This page does not contain a valid Stripe receipt. No access has been granted.";
  if (state === "unpaid" || state === "expired") return "Payment was not completed. No access or gift code was created.";
  if (state === "refunded" || state === "revoked") return "This purchase was refunded or revoked, so its code is not available.";
  if (state === "already_redeemed" || state === "redeemed") return "This code has already been redeemed. Contact support if you need recovery help.";
  if (state === "processing") return "Payment returned successfully. We are waiting for the verified Stripe webhook and canonical purchase record…";
  return "We could not verify the purchase yet. Contact support with the Stripe receipt email; no access is granted from this page alone.";
}
