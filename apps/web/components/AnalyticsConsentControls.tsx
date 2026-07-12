"use client";

import { useSyncExternalStore } from "react";

import {
  type AnalyticsConsent,
  readAnalyticsConsent,
  revokeAnalyticsConsent,
  setAnalyticsConsent,
  subscribeToAnalyticsConsent,
} from "@/lib/marketingAnalytics";

export default function AnalyticsConsentControls({ compact = false }: { compact?: boolean }) {
  const consent = useSyncExternalStore<AnalyticsConsent>(
    (notify) => subscribeToAnalyticsConsent(() => notify()),
    readAnalyticsConsent,
    () => "unknown",
  );

  if (compact && consent !== "unknown") return null;

  return (
    <section className={compact ? "analytics-consent analytics-consent--banner" : "analytics-consent"}>
      <div>
        <strong>Optional, privacy-safe product analytics</strong>
        <p>
          If you allow analytics, we record coarse actions such as page visits, checkout starts,
          and whether a saved moment was completed. We never send child names, birthdays, photos,
          captions, letters, prompt answers, contacts, locations, media identifiers, or gift codes.
        </p>
        <p className="analytics-consent__state">Current choice: {consent}.</p>
      </div>
      <div className="analytics-consent__actions">
        <button type="button" className="button button-dark" onClick={() => setAnalyticsConsent("granted")}>
          Allow analytics
        </button>
        <button type="button" className="button button-ghost" onClick={() => setAnalyticsConsent("denied")}>
          Do not allow
        </button>
        {consent === "granted" ? (
          <button type="button" className="text-button" onClick={revokeAnalyticsConsent}>
            Revoke and clear analytics data on this device
          </button>
        ) : null}
      </div>
    </section>
  );
}
