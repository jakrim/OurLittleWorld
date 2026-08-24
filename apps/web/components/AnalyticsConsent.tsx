"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from "@/lib/marketingAnalytics";

export default function AnalyticsConsent() {
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const subscribe = useCallback((notify: () => void) => {
    const onPreferences = () => {
      setManuallyOpen(true);
      notify();
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, notify);
    window.addEventListener("olw:open-analytics-preferences", onPreferences);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, notify);
      window.removeEventListener("olw:open-analytics-preferences", onPreferences);
    };
  }, []);
  const consent = useSyncExternalStore(subscribe, getAnalyticsConsent, () => "unknown");
  const open = consent === "unknown" || manuallyOpen;

  const choose = (next: "granted" | "denied") => {
    setAnalyticsConsent(next);
    setManuallyOpen(false);
  };

  if (!open) return null;

  return (
    <aside className="analytics-consent" aria-label="Analytics preferences" role="dialog" aria-modal="false">
      <div>
        <p className="analytics-consent-title">Help us improve the path into your baby book?</p>
        <p>
          We use anonymous page, campaign, and checkout events. We do not send form entries,
          names, email addresses, gift notes, photos, or purchase codes. Read our{" "}
          <Link href="/privacy/">privacy policy</Link>.
        </p>
        {consent !== "unknown" ? <p className="small">Current choice: {consent === "granted" ? "Allowed" : "Not allowed"}.</p> : null}
      </div>
      <div className="analytics-consent-actions">
        <button className="button button-primary" type="button" onClick={() => choose("granted")}>
          Allow analytics
        </button>
        <button className="button button-light" type="button" onClick={() => choose("denied")}>
          No thanks
        </button>
      </div>
    </aside>
  );
}
