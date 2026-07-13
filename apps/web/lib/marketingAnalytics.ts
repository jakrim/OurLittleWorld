"use client";

export type AnalyticsConsent = "unknown" | "granted" | "denied";

export type AcquisitionContext = {
  campaign?: string;
  angle?: string;
  creative?: string;
  channel?: string;
  landing_page?: string;
  first_campaign?: string;
  first_angle?: string;
  first_creative?: string;
  first_channel?: string;
  first_landing_page?: string;
  last_campaign?: string;
  last_angle?: string;
  last_creative?: string;
  last_channel?: string;
  last_landing_page?: string;
};

type MarketingEventName =
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
  surface?: "marketing_site" | "web_pricing" | "web_gift";
  product_key?: string;
  target?: "pricing" | "gift" | "store" | "partner" | "other";
  test_event?: boolean;
};

const CONSENT_KEY = "olw.analytics-consent.v1";
const FIRST_TOUCH_KEY = "olw.marketing-first-touch.v2";
const LAST_TOUCH_KEY = "olw.marketing-last-touch.v2";
const ANONYMOUS_ID_KEY = "olw.analytics-anonymous-id.v1";
const CONSENT_EVENT = "olw:analytics-consent-changed";
const MAX_VALUE_LENGTH = 120;
const SAFE_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/;

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unknown";
  return normalizeConsent(window.localStorage.getItem(CONSENT_KEY));
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === "undefined") return "unknown";
  const normalized = normalizeConsent(consent);
  window.localStorage.setItem(CONSENT_KEY, normalized);
  if (normalized !== "granted") clearAnalyticsState();
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: normalized }));
  return normalized;
}

export function revokeAnalyticsConsent() {
  return setAnalyticsConsent("denied");
}

export function subscribeToAnalyticsConsent(listener: (consent: AnalyticsConsent) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    listener(normalizeConsent(detail));
  };
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

export function captureAttribution(): AcquisitionContext {
  if (typeof window === "undefined" || readAnalyticsConsent() !== "granted") return {};
  const current = attributionFromLocation(window.location);
  const existingFirst = readAttribution(window.localStorage, FIRST_TOUCH_KEY);
  const first = existingFirst || current;
  if (!existingFirst && Object.keys(current).length) {
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current));
  }
  if (Object.keys(current).length) {
    window.sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(current));
  }
  const last = readAttribution(window.sessionStorage, LAST_TOUCH_KEY) || current;
  return mergeAttribution(first, last);
}

export function checkoutAttributionPayload(): Record<string, string> {
  const context = captureAttribution();
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [`attribution_${key}`, value]),
  );
}

export async function trackMarketingEvent(
  event: MarketingEventName,
  properties: MarketingEventProperties = {},
) {
  if (typeof window === "undefined") return { accepted: false, reason: "server" };
  if (readAnalyticsConsent() !== "granted") {
    return { accepted: false, reason: "consent_not_granted" };
  }
  const attribution = captureAttribution();
  const apiKey = process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_API_KEY;
  if (!apiKey?.startsWith("phc_")) return { accepted: false, reason: "token_not_configured" };
  const safeProperties = sanitizeMarketingProperties(properties);

  const host = normalizeHost(
    process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_HOST || "https://us.i.posthog.com",
  );
  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      api_key: apiKey,
      event: `marketing_${event}`,
      properties: {
        distinct_id: getAnonymousId(),
        project_id: "our-little-world",
        schema_version: 1,
        source: "web",
        environment: process.env.NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_ENVIRONMENT || "production",
        ...safeProperties,
        ...attribution,
        $process_person_profile: false,
        $lib: "our-little-world-web-privacy-wrapper",
      },
    }),
  });
  return { accepted: response.ok, status: response.status };
}

function sanitizeMarketingProperties(properties: MarketingEventProperties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error("Marketing analytics properties must be an object");
  }
  const allowed = new Set(["path", "surface", "product_key", "target", "test_event"]);
  for (const key of Object.keys(properties)) {
    if (!allowed.has(key)) throw new Error(`Private or unknown analytics property rejected: ${key}`);
  }
  const output: MarketingEventProperties = {};
  const path = safePath(properties.path);
  if (path) output.path = path;
  if (["marketing_site", "web_pricing", "web_gift"].includes(properties.surface || "")) {
    output.surface = properties.surface;
  }
  const productKey = safeValue(properties.product_key);
  if (productKey) output.product_key = productKey;
  if (["pricing", "gift", "store", "partner", "other"].includes(properties.target || "")) {
    output.target = properties.target;
  }
  if (typeof properties.test_event === "boolean") output.test_event = properties.test_event;
  return output;
}

export function marketingTarget(href: string | null): MarketingEventProperties["target"] {
  if (!href) return "other";
  if (href.includes("/gift")) return "gift";
  if (href.includes("/pricing") || href.includes("#checkout")) return "pricing";
  if (href.includes("apps.apple.com") || href.includes("play.google.com")) return "store";
  if (href.includes("/partners")) return "partner";
  return "other";
}

function attributionFromLocation(location: Pick<Location, "search" | "pathname">): AcquisitionContext {
  const params = new URLSearchParams(location.search);
  const pathAngle = /^\/for\/([a-z0-9-]+)\/?$/i.exec(location.pathname)?.[1];
  return compactAttribution({
    campaign: safeValue(params.get("campaign") || params.get("utm_campaign")),
    angle: safeValue(params.get("angle") || pathAngle),
    creative: safeValue(params.get("creative") || params.get("utm_content")),
    channel: safeValue(params.get("channel") || params.get("utm_source")),
    landing_page: safePath(location.pathname),
  });
}

function readAttribution(storage: Storage, key: string): AcquisitionContext | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return compactAttribution(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

function mergeAttribution(first: AcquisitionContext, last: AcquisitionContext) {
  return compactAttribution({
    campaign: last.campaign || first.campaign,
    angle: last.angle || first.angle,
    creative: last.creative || first.creative,
    channel: last.channel || first.channel,
    landing_page: first.landing_page || last.landing_page,
    first_campaign: first.campaign,
    first_angle: first.angle,
    first_creative: first.creative,
    first_channel: first.channel,
    first_landing_page: first.landing_page,
    last_campaign: last.campaign,
    last_angle: last.angle,
    last_creative: last.creative,
    last_channel: last.channel,
    last_landing_page: last.landing_page,
  });
}

function compactAttribution(input: Record<string, unknown>): AcquisitionContext {
  const output: AcquisitionContext = {};
  const mappings = [
    "campaign", "angle", "creative", "channel",
    "first_campaign", "first_angle", "first_creative", "first_channel",
    "last_campaign", "last_angle", "last_creative", "last_channel",
  ] as const;
  for (const key of mappings) {
    const value = safeValue(input[key]);
    if (value) output[key] = value;
  }
  const landingPage = safePath(input.landing_page);
  if (landingPage) output.landing_page = landingPage;
  const firstLandingPage = safePath(input.first_landing_page);
  if (firstLandingPage) output.first_landing_page = firstLandingPage;
  const lastLandingPage = safePath(input.last_landing_page);
  if (lastLandingPage) output.last_landing_page = lastLandingPage;
  return output;
}

function safeValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH);
  if (trimmed.includes("://") || trimmed.includes("@")) return undefined;
  return SAFE_VALUE.test(trimmed) ? trimmed : undefined;
}

function safePath(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH);
  return /^\/[a-zA-Z0-9/_-]*$/.test(trimmed) ? trimmed : undefined;
}

function clearAnalyticsState() {
  window.localStorage.removeItem(FIRST_TOUCH_KEY);
  window.sessionStorage.removeItem(LAST_TOUCH_KEY);
  window.localStorage.removeItem("olw.marketing-first-touch.v1");
  window.sessionStorage.removeItem("olw.marketing-last-touch.v1");
  window.localStorage.removeItem(ANONYMOUS_ID_KEY);
}

function getAnonymousId() {
  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.()
    || `anonymous-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(ANONYMOUS_ID_KEY, value);
  return value;
}

function normalizeConsent(value: unknown): AnalyticsConsent {
  return value === "granted" || value === "denied" ? value : "unknown";
}

function normalizeHost(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("Analytics host must use HTTPS");
  return parsed.origin;
}
