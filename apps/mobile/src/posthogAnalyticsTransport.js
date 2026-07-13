import AsyncStorage from '@react-native-async-storage/async-storage';

import { setAnalyticsTransport } from './analytics.js';

const CONSENT_KEY = 'our-little-world.analytics-consent.v1';
const ALLOWED_CONSENT = new Set(['granted', 'denied', 'unknown']);
const DEFAULT_HOST = 'https://us.i.posthog.com';

let sessionId = null;

function anonymousSessionId() {
  if (sessionId) return sessionId;
  if (globalThis.crypto?.randomUUID) sessionId = globalThis.crypto.randomUUID();
  else sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return sessionId;
}

export function createPosthogAnalyticsTransport({
  apiKey,
  host = DEFAULT_HOST,
  consent = 'unknown',
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedConsent = String(consent || 'unknown').toLowerCase();
  if (!ALLOWED_CONSENT.has(normalizedConsent)) throw new Error('Invalid analytics consent state');
  if (normalizedConsent !== 'granted') {
    return async () => ({ accepted: false, reason: 'consent_not_granted' });
  }
  if (!apiKey || !String(apiKey).startsWith('phc_')) {
    throw new Error('A dedicated Our Little World PostHog project token is required');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Analytics fetch transport is unavailable');
  const endpoint = normalizePosthogHost(host);

  return async (event) => {
    const distinctId = event.family_id || anonymousSessionId();
    const response = await fetchImpl(`${endpoint}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: event.event_name,
        properties: {
          ...event,
          distinct_id: distinctId,
          $lib: 'our-little-world-privacy-wrapper',
          $process_person_profile: false,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`PostHog capture failed with status ${response.status}`);
    }
    return { accepted: true, provider: 'posthog', status: response.status };
  };
}

export async function readAnalyticsConsent() {
  const stored = await AsyncStorage.getItem(CONSENT_KEY);
  if (ALLOWED_CONSENT.has(stored)) return stored;
  const configuredDefault = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_DEFAULT_CONSENT;
  return configuredDefault === 'granted' ? 'granted' : 'unknown';
}

export async function setAnalyticsConsent(consent) {
  const normalized = String(consent || '').toLowerCase();
  if (!ALLOWED_CONSENT.has(normalized)) throw new Error('Invalid analytics consent state');
  await AsyncStorage.setItem(CONSENT_KEY, normalized);
  return initializePosthogAnalytics({ consent: normalized });
}

export async function initializePosthogAnalytics({ consent } = {}) {
  const resolvedConsent = consent || await readAnalyticsConsent();
  const apiKey = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_API_KEY;
  const host = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_HOST || DEFAULT_HOST;
  if (!apiKey || resolvedConsent !== 'granted') {
    setAnalyticsTransport(createPosthogAnalyticsTransport({ consent: resolvedConsent }));
    return { enabled: false, consent: resolvedConsent, reason: apiKey ? 'consent_not_granted' : 'token_not_configured' };
  }
  const transport = createPosthogAnalyticsTransport({ apiKey, host, consent: resolvedConsent });
  setAnalyticsTransport(transport);
  return { enabled: true, consent: resolvedConsent, provider: 'posthog' };
}

function normalizePosthogHost(host) {
  const parsed = new URL(String(host || DEFAULT_HOST));
  if (parsed.protocol !== 'https:') throw new Error('PostHog host must use HTTPS');
  return parsed.origin.replace(/\/$/, '');
}
