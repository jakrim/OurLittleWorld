"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";

import { compactAvailabilityAction, publicCommercialConfig } from "@/lib/commercialConfig";
import {
  checkoutAttributionPayload,
  trackMarketingEvent,
} from "@/lib/marketingAnalytics";

type CommercialAvailabilityProps = {
  compact?: boolean;
  surface: "home" | "pricing" | "gift" | "story" | "angle" | "footer" | "success";
};

export default function CommercialAvailability({
  compact = false,
  surface,
}: CommercialAvailabilityProps) {
  const pathname = usePathname();
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const config = publicCommercialConfig;

  if (compact) {
    const action = compactAvailabilityAction(config.storeAvailability);
    return (
      <div className="availability-compact" aria-label="App availability">
        <strong>{availabilityHeading(config.storeAvailability)}</strong>
        <Link
          data-marketing-action={config.storeAvailability === "available" ? "store-interest" : "launch-interest"}
          href={action.href}
        >
          {action.label}
        </Link>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending" || status === "saved") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    reportLaunchFormOutcome("form_submit");
    if (!config.launchSignupEndpoint) {
      setStatus("error");
      setMessage("Launch signup is temporarily unavailable. Please email support@ourlittleworld.me.");
      reportLaunchFormOutcome("form_error");
      return;
    }

    const fields = new FormData(form);
    setStatus("sending");
    setMessage("Saving your launch preference…");
    try {
      const response = await fetch(config.launchSignupEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fields.get("email") || ""),
          marketing_consent: fields.get("marketing_consent") === "yes",
          source: `web_${surface}`,
          website: String(fields.get("website") || ""),
          ...checkoutAttributionPayload(),
        }),
      });
      if (!response.ok) throw new Error("signup failed");
      const result = (await response.json().catch(() => ({}))) as { delivery?: string };
      setStatus("saved");
      setMessage(
        result.delivery === "confirmed"
          ? "You’re subscribed. We’ll email when access is genuinely available."
          : "Your request is saved. If confirmation is needed, check your inbox. We won’t overwrite an existing unsubscribe or delivery preference, and you don’t need to submit again.",
      );
      reportLaunchFormOutcome("form_success");
      form.reset();
      void trackMarketingEvent(surface === "home" ? "hero_email_succeeded" : "launch_signup_completed", {
        path: pathname || "/",
        surface: "marketing_site",
        target: "store",
      });
    } catch {
      setStatus("error");
      setMessage("We couldn’t save that address. Please try again or email support@ourlittleworld.me.");
      reportLaunchFormOutcome("form_error");
    }
  }

  const available = config.storeAvailability === "available";
  return (
    <section className="section availability-section band-soft" id="launch-list" aria-labelledby={`availability-title-${surface}`}>
      <div className="wrap availability-grid">
        <div>
          <p className="eyebrow">App availability</p>
          <h2 className="section-title" id={`availability-title-${surface}`}>
            {availabilityHeading(config.storeAvailability)}
          </h2>
          <p className="lead">{availabilityCopy(config.storeAvailability, config.launchDate)}</p>
          {config.testMode ? (
            <p className="test-mode-banner" role="status">Website checkout is in Stripe test mode. Test purchases do not create production access.</p>
          ) : null}
          {available ? (
            <div className="store-links" aria-label="Official app store links">
              {config.appleUrl ? (
                <a
                  className="button button-dark"
                  data-marketing-action="store-interest"
                  href={config.appleUrl}
                  rel="noreferrer"
                >
                  View on the App Store
                </a>
              ) : null}
              {config.googleUrl ? (
                <a
                  className="button button-dark"
                  data-marketing-action="store-interest"
                  href={config.googleUrl}
                  rel="noreferrer"
                >
                  View on Google Play
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        {!available ? (
          <form className="form-card launch-form" onSubmit={submit} noValidate>
            <h3 className="card-title">Get one honest launch email</h3>
            <p>We’ll tell you when the app can actually be downloaded and when website purchases or gifts can actually be redeemed.</p>
            <div className="field">
              <label htmlFor={`launch-email-${surface}`}>Email address</label>
              <input
                id={`launch-email-${surface}`}
                name="email"
                type="email"
                autoComplete="email"
                required
                onFocus={() => {
                  void trackMarketingEvent(surface === "home" ? "hero_email_started" : "launch_interest_clicked", {
                    path: pathname || "/",
                    surface: "marketing_site",
                    target: "store",
                  });
                }}
              />
            </div>
            <div className="honeypot" aria-hidden="true">
              <label htmlFor={`launch-website-${surface}`}>Website</label>
              <input id={`launch-website-${surface}`} name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <label className="consent-check">
              <input name="marketing_consent" type="checkbox" value="yes" required />
              <span>I agree to receive launch and occasional product emails. I can unsubscribe at any time.</span>
            </label>
            <button className="button button-primary button-full" type="submit" disabled={status === "sending" || status === "saved"}>
              {status === "sending" ? "Joining…" : status === "saved" ? "Launch updates saved" : "Join the launch list"}
            </button>
            <p className="small">
              This is marketing consent. Billing, gift, privacy, and account emails are handled separately. Read our{" "}
              <Link href="/privacy/">Privacy Policy</Link> and <Link href="/email-preferences/">email preferences</Link>.
            </p>
            <div className={`status-box${message ? " is-visible" : ""}`} role="status" aria-live="polite">
              {message}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function reportLaunchFormOutcome(eventType: "form_submit" | "form_success" | "form_error") {
  window.dispatchEvent(new CustomEvent("olw:operational", {
    detail: { event_type: eventType, error_name: "LaunchSignup" },
  }));
}

function availabilityHeading(state: typeof publicCommercialConfig.storeAvailability) {
  if (state === "available") return "Available on configured app stores";
  if (state === "temporarily_unavailable") return "App links are temporarily unavailable";
  return "Coming soon to iPhone and Android";
}

function availabilityCopy(state: typeof publicCommercialConfig.storeAvailability, launchDate: string) {
  if (state === "available") return "Use only the verified store links below to download Our Little World.";
  if (state === "temporarily_unavailable") {
    return "We are not showing a download badge until a valid public listing is available again. Join the list for an update.";
  }
  return launchDate
    ? `The current approved launch date is ${launchDate}. The app is not publicly downloadable yet.`
    : "The app is not publicly downloadable yet. There is no placeholder badge or fake store link.";
}
