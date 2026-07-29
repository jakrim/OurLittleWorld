"use client";

export type MarketingEventName =
  | "landing_view"
  | "homepage_viewed"
  | "hero_primary_cta_clicked"
  | "hero_email_started"
  | "hero_email_succeeded"
  | "pricing_viewed"
  | "primary_cta_clicked"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_failed"
  | "gift_started"
  | "gift_checkout_started"
  | "gift_completed"
  | "store_interest_clicked"
  | "launch_interest_clicked"
  | "launch_signup_completed";

type MarketingEventProperties = {
  path?: string;
  surface?: string;
  product_key?: string;
  target?: "pricing" | "gift" | "store" | "partner" | "other";
  test_event?: boolean;
  verification?: "stripe_session";
};

export type AnalyticsConsent = "granted" | "denied" | "unknown";

export const ANALYTICS_CONSENT_KEY = "olw.analytics-consent.v1";
export const ANALYTICS_CONSENT_EVENT = "olw:analytics-consent";
const FIRST_TOUCH_KEY = "olw.marketing-first-touch.v1";
const LAST_TOUCH_KEY = "olw.marketing-last-touch.v1";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export async function trackMarketingEvent(
  event: MarketingEventName,
  properties: MarketingEventProperties = {},
) {
  if (typeof window === "undefined") return { accepted: false, reason: "server" };
  const consent = getAnalyticsConsent();
  if (consent !== "granted") return { accepted: false, reason: "consent_not_granted" };
  const apiKey = process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_API_KEY;
  if (!apiKey?.startsWith("phc_")) return { accepted: false, reason: "token_not_configured" };

  const host = normalizeHost(process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_HOST || "https://us.i.posthog.com");
  const attribution = captureAttribution();
  const anonymousId = getAnonymousId();
  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      api_key: apiKey,
      event: `marketing_${event}`,
      properties: {
        distinct_id: anonymousId,
        project_id: "our-little-world",
        schema_version: 1,
        source: "web",
        environment: process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_ENVIRONMENT || "production",
        ...properties,
        ...attribution,
        $process_person_profile: false,
        $lib: "our-little-world-web-privacy-wrapper",
      },
    }),
  });
  return { accepted: response.ok, status: response.status };
}

export function captureAttribution() {
  if (typeof window === "undefined") return {};
  const current = Object.fromEntries(
    UTM_KEYS.flatMap((key) => {
      const value = new URLSearchParams(window.location.search).get(key)?.slice(0, 160);
      return value ? [[key, value]] : [];
    }),
  );
  const first = readJson(window.localStorage, FIRST_TOUCH_KEY) || current;
  if (!readJson(window.localStorage, FIRST_TOUCH_KEY) && Object.keys(current).length) {
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current));
  }
  if (Object.keys(current).length) {
    window.sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(current));
  }
  const last = readJson(window.sessionStorage, LAST_TOUCH_KEY) || current;
  return { first_touch: first, last_touch: last };
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unknown";
  const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    || process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_DEFAULT_CONSENT
    || "unknown";
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function readAnalyticsConsent(): AnalyticsConsent {
  return getAnalyticsConsent();
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, "unknown">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: consent }));
}

export function revokeAnalyticsConsent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FIRST_TOUCH_KEY);
  window.sessionStorage.removeItem(LAST_TOUCH_KEY);
  window.localStorage.removeItem("olw.analytics-anonymous-id.v1");
  setAnalyticsConsent("denied");
}

export function subscribeToAnalyticsConsent(listener: (consent: AnalyticsConsent) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener(getAnalyticsConsent());
  window.addEventListener(ANALYTICS_CONSENT_EVENT, handler);
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, handler);
}

export function checkoutAttributionPayload(): Record<string, string> {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "granted") return {};
  const attribution = captureAttribution() as {
    first_touch?: Record<string, string>;
    last_touch?: Record<string, string>;
  };
  const result: Record<string, string> = { attribution_consent: "granted" };
  for (const key of UTM_KEYS) {
    const first = attribution.first_touch?.[key];
    const last = attribution.last_touch?.[key];
    if (first) result[`first_${key}`] = first.slice(0, 160);
    if (last) result[`last_${key}`] = last.slice(0, 160);
  }
  result.landing_path = `${window.location.pathname}${window.location.search}`.slice(0, 240);
  const angle = new URLSearchParams(window.location.search).get("angle")?.slice(0, 160);
  if (angle) result.landing_angle = angle;
  return result;
}

export function marketingTarget(href: string | null): MarketingEventProperties["target"] {
  if (!href) return "other";
  if (href.includes("/gift")) return "gift";
  if (href.includes("/pricing") || href.includes("#checkout")) return "pricing";
  if (href.includes("#launch-list")) return "store";
  if (href.includes("apps.apple.com") || href.includes("play.google.com")) return "store";
  if (href.includes("/partners")) return "partner";
  return "other";
}

function getAnonymousId() {
  const key = "olw.analytics-anonymous-id.v1";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.() || `anonymous-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, value);
  return value;
}

function readJson(storage: Storage, key: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([key, value]) => UTM_KEYS.includes(key as typeof UTM_KEYS[number]) && typeof value === "string")
        .map(([key, value]) => [key, String(value).slice(0, 160)]),
    );
  } catch {
    return null;
  }
}

function normalizeHost(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("Analytics host must use HTTPS");
  return parsed.origin;
}
