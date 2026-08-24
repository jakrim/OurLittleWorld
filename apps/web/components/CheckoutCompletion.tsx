"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  trackMarketingEvent,
} from "@/lib/marketingAnalytics";

type CheckoutKind = "purchase" | "gift";
type CheckoutState = "checking" | "complete" | "pending" | "expired" | "error";
type ClaimState = "pending" | "ready" | "claimed";

type CheckoutStatusResponse = {
  checkout_status?: "complete" | "pending" | "expired";
  claim_status?: ClaimState;
  plan_key?: string | null;
  error?: string;
};

const supabaseFunctionsBase = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1` : "");
const statusEndpoint = process.env.NEXT_PUBLIC_OLW_CHECKOUT_STATUS_ENDPOINT
  || (supabaseFunctionsBase ? `${supabaseFunctionsBase}/stripe-checkout-status` : "");
const iosAppUrl = process.env.NEXT_PUBLIC_OLW_IOS_APP_URL || "";
const androidAppUrl = process.env.NEXT_PUBLIC_OLW_ANDROID_APP_URL || "";

export default function CheckoutCompletion({
  kind,
  sessionId,
  code,
}: {
  kind: CheckoutKind;
  sessionId?: string;
  code?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const hasVerificationInput = Boolean(sessionId && code && statusEndpoint);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>(hasVerificationInput ? "checking" : "error");
  const [claimState, setClaimState] = useState<ClaimState>("pending");
  const [message, setMessage] = useState(hasVerificationInput
    ? ""
    : "This link is missing the details needed to verify checkout. Use the link in your Stripe receipt or contact support.");
  const appLink = useMemo(() => {
    if (kind !== "purchase") return "";
    if (claimState === "ready" && code) return `ourlittleworld://purchase?code=${encodeURIComponent(code)}`;
    return "ourlittleworld://purchase";
  }, [claimState, code, kind]);

  useEffect(() => {
    if (!sessionId || !code || !statusEndpoint) return undefined;

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const verify = async () => {
      try {
        const response = await fetch(statusEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, session_id: sessionId, code }),
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => ({}))) as CheckoutStatusResponse;
        if (!response.ok) throw new Error(result.error || "Checkout could not be verified.");

        setCheckoutState(result.checkout_status || "pending");
        setClaimState(result.claim_status || "pending");
        setMessage("");
        if (result.checkout_status === "complete" && result.claim_status === "pending" && attempt < 5) {
          retryTimer = setTimeout(() => setAttempt((value) => value + 1), 2000);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setCheckoutState("error");
        setMessage(error instanceof Error ? error.message : "Checkout could not be verified.");
      }
    };

    void verify();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [attempt, code, kind, sessionId]);

  const retry = () => {
    setCheckoutState("checking");
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    if (checkoutState !== "complete" || !sessionId) return undefined;
    const eventName = kind === "gift" ? "gift_completed" : "checkout_completed";
    const storageKey = `olw.verified-conversion.v1.${kind}.${sessionId}`;
    const record = async () => {
      if (window.localStorage.getItem(storageKey) === "sent") return;
      const result = await trackMarketingEvent(eventName, {
        path: kind === "gift" ? "/checkout/gift-success" : "/checkout/success",
        surface: kind === "gift" ? "web_gift" : "web_pricing",
        verification: "stripe_session",
      });
      if (result.accepted) window.localStorage.setItem(storageKey, "sent");
    };
    const onConsent = () => void record();
    void record();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
  }, [checkoutState, kind, sessionId]);

  if (checkoutState === "checking") {
    return <StatusArticle title="Confirming payment">We are checking this checkout directly with Stripe.</StatusArticle>;
  }

  if (checkoutState === "error" || checkoutState === "expired") {
    return (
      <StatusArticle title={checkoutState === "expired" ? "Checkout was not completed" : "We could not verify this link"}>
        <p>{message || "Return to checkout or contact support with the email on your Stripe receipt."}</p>
        <button className="button button-light" type="button" onClick={retry}>
          Check again
        </button>
      </StatusArticle>
    );
  }

  if (checkoutState === "pending") {
    return (
      <StatusArticle title="Checkout is still processing">
        <p>No completion event has been recorded. Check again after Stripe finishes processing.</p>
        <button className="button button-light" type="button" onClick={retry}>
          Check again
        </button>
      </StatusArticle>
    );
  }

  if (kind === "gift") {
    return (
      <StatusArticle title="Payment confirmed">
        {claimState === "ready" ? (
          <>
            <p>Your gift code is ready. Share it only with the recipient.</p>
            <div className="code-box" aria-label="Gift code">{code}</div>
            <p>They can redeem it in the app after creating their private family space.</p>
          </>
        ) : claimState === "claimed" ? (
          <p>This gift code has already been connected to a family space.</p>
        ) : (
          <PendingClaim onRetry={retry} />
        )}
      </StatusArticle>
    );
  }

  return (
    <StatusArticle title="Payment confirmed — continue in the app">
      <p>Install or open Our Little World, create your private family space, then connect this website plan.</p>
      <div className="checkout-install-actions">
        <a className="button button-primary" href={appLink}>Open Our Little World</a>
        {iosAppUrl ? <a className="button button-light" href={iosAppUrl}>Install on iPhone</a> : null}
        {androidAppUrl ? <a className="button button-light" href={androidAppUrl}>Install on Android</a> : null}
      </div>
      {claimState === "ready" ? (
        <>
          <p>Your purchase code is ready and will be filled in when the app opens:</p>
          <div className="code-box" aria-label="Purchase code">{code}</div>
        </>
      ) : claimState === "claimed" ? (
        <p>This website plan is already connected to a family space.</p>
      ) : (
        <PendingClaim onRetry={retry} />
      )}
      {!iosAppUrl && !androidAppUrl ? (
        <p className="small">Public store links have not been added yet. If the app is already installed, use Open Our Little World.</p>
      ) : null}
    </StatusArticle>
  );
}

function PendingClaim({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="pending-claim" role="status">
      <p><strong>Your code is still being prepared.</strong> Payment is confirmed, but the secure webhook has not finished creating the claim yet.</p>
      <p>Keep this page or your Stripe receipt. You can install the app now and connect the plan once the code appears.</p>
      <button className="button button-light" type="button" onClick={onRetry}>Check code again</button>
    </div>
  );
}

function StatusArticle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="policy-item checkout-completion" aria-live="polite">
      <h2>{title}</h2>
      {children}
      <p className="small">
        Need help? <Link href="mailto:support@ourlittleworld.me">Contact support</Link> with the email on your Stripe receipt.
      </p>
    </article>
  );
}
