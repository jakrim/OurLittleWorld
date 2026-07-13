export type CommerceState = "coming_soon" | "test" | "live" | "temporarily_unavailable";
export type StoreAvailability = "coming_soon" | "available" | "temporarily_unavailable";

type PublicEnvironment = Partial<Record<
  | "NEXT_PUBLIC_OLW_COMMERCE_STATE"
  | "NEXT_PUBLIC_OLW_STORE_AVAILABILITY"
  | "NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL"
  | "NEXT_PUBLIC_OLW_GOOGLE_PLAY_URL"
  | "NEXT_PUBLIC_OLW_APPLE_APP_ID"
  | "NEXT_PUBLIC_OLW_ANDROID_PACKAGE"
  | "NEXT_PUBLIC_OLW_STORE_LAUNCH_DATE"
  | "NEXT_PUBLIC_OLW_PARTNERS_ENABLED"
  | "NEXT_PUBLIC_OLW_LAUNCH_SIGNUP_ENDPOINT"
  | "NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL"
  | "NEXT_PUBLIC_SUPABASE_URL",
  string | undefined
>>;

const COMMERCE_STATES = new Set<CommerceState>([
  "coming_soon",
  "test",
  "live",
  "temporarily_unavailable",
]);
const STORE_STATES = new Set<StoreAvailability>([
  "coming_soon",
  "available",
  "temporarily_unavailable",
]);

export function resolveCommercialConfig(source: PublicEnvironment) {
  const requestedCommerceState = source.NEXT_PUBLIC_OLW_COMMERCE_STATE as CommerceState;
  const commerceState = COMMERCE_STATES.has(requestedCommerceState)
    ? requestedCommerceState
    : "coming_soon";

  const requestedStoreState = source.NEXT_PUBLIC_OLW_STORE_AVAILABILITY as StoreAvailability;
  const appleUrl = publicStoreUrl(source.NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL, "apps.apple.com");
  const googleUrl = publicStoreUrl(source.NEXT_PUBLIC_OLW_GOOGLE_PLAY_URL, "play.google.com");
  let storeAvailability = STORE_STATES.has(requestedStoreState)
    ? requestedStoreState
    : "coming_soon";

  // Never render an available badge or link unless at least one verified public
  // listing URL is configured. This keeps placeholder and private listings dark.
  if (storeAvailability === "available" && !appleUrl && !googleUrl) {
    storeAvailability = "temporarily_unavailable";
  }

  const functionsBase = cleanUrl(source.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL)
    || (cleanUrl(source.NEXT_PUBLIC_SUPABASE_URL)
      ? `${cleanUrl(source.NEXT_PUBLIC_SUPABASE_URL)}/functions/v1`
      : "");

  return {
    commerceState,
    checkoutEnabled: commerceState === "test" || commerceState === "live",
    testMode: commerceState === "test",
    partnersEnabled: source.NEXT_PUBLIC_OLW_PARTNERS_ENABLED === "true",
    storeAvailability,
    appleUrl,
    googleUrl,
    appleAppId: cleanIdentifier(source.NEXT_PUBLIC_OLW_APPLE_APP_ID),
    androidPackage: cleanIdentifier(source.NEXT_PUBLIC_OLW_ANDROID_PACKAGE),
    launchDate: validDate(source.NEXT_PUBLIC_OLW_STORE_LAUNCH_DATE),
    launchSignupEndpoint: cleanUrl(source.NEXT_PUBLIC_OLW_LAUNCH_SIGNUP_ENDPOINT)
      || (functionsBase ? `${functionsBase}/launch-signup` : ""),
    checkoutStatusEndpoint: functionsBase ? `${functionsBase}/stripe-checkout-status` : "",
  } as const;
}

function cleanUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? url.toString().replace(/\/$/, "")
      : "";
  } catch {
    return "";
  }
}

function publicStoreUrl(value: string | undefined, expectedHost: string) {
  const normalized = cleanUrl(value);
  if (!normalized) return "";
  const host = new URL(normalized).hostname.toLowerCase();
  return host === expectedHost || host.endsWith(`.${expectedHost}`) ? normalized : "";
}

function cleanIdentifier(value: string | undefined) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9._-]{1,160}$/.test(normalized) ? normalized : "";
}

function validDate(value: string | undefined) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export const publicCommercialConfig = resolveCommercialConfig({
  NEXT_PUBLIC_OLW_COMMERCE_STATE: process.env.NEXT_PUBLIC_OLW_COMMERCE_STATE,
  NEXT_PUBLIC_OLW_STORE_AVAILABILITY: process.env.NEXT_PUBLIC_OLW_STORE_AVAILABILITY,
  NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL: process.env.NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL,
  NEXT_PUBLIC_OLW_GOOGLE_PLAY_URL: process.env.NEXT_PUBLIC_OLW_GOOGLE_PLAY_URL,
  NEXT_PUBLIC_OLW_APPLE_APP_ID: process.env.NEXT_PUBLIC_OLW_APPLE_APP_ID,
  NEXT_PUBLIC_OLW_ANDROID_PACKAGE: process.env.NEXT_PUBLIC_OLW_ANDROID_PACKAGE,
  NEXT_PUBLIC_OLW_STORE_LAUNCH_DATE: process.env.NEXT_PUBLIC_OLW_STORE_LAUNCH_DATE,
  NEXT_PUBLIC_OLW_PARTNERS_ENABLED: process.env.NEXT_PUBLIC_OLW_PARTNERS_ENABLED,
  NEXT_PUBLIC_OLW_LAUNCH_SIGNUP_ENDPOINT: process.env.NEXT_PUBLIC_OLW_LAUNCH_SIGNUP_ENDPOINT,
  NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL: process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
});
