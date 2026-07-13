"use client";

type MarketingEventName =
  | "landing_view"
  | "primary_cta_clicked"
  | "checkout_started"
  | "checkout_completed"
  | "gift_started"
  | "gift_completed";

type MarketingEventProperties = {
  path?: string;
  surface?: string;
  product_key?: string;
  target?: "pricing" | "gift" | "store" | "partner" | "other";
  test_event?: boolean;
};

const CONSENT_KEY = "olw.analytics-consent.v1";
const FIRST_TOUCH_KEY = "olw.marketing-first-touch.v1";
const LAST_TOUCH_KEY = "olw.marketing-last-touch.v1";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export async function trackMarketingEvent(
  event: MarketingEventName,
  properties: MarketingEventProperties = {},
) {
  if (typeof window === "undefined") return { accepted: false, reason: "server" };
  const consent = window.localStorage.getItem(CONSENT_KEY)
    || process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_DEFAULT_CONSENT
    || "unknown";
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

export function marketingTarget(href: string | null): MarketingEventProperties["target"] {
  if (!href) return "other";
  if (href.includes("/gift")) return "gift";
  if (href.includes("/pricing") || href.includes("#checkout")) return "pricing";
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
