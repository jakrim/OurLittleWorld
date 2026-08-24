import AsyncStorage from '@react-native-async-storage/async-storage';

import { setAnalyticsTransport } from './analytics.js';

export const ANALYTICS_CONSENT_KEY = 'our-little-world.analytics-consent.v1';
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
  const normalizedConsent = normalizeConsent(consent);
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

export async function readAnalyticsConsent(storage = AsyncStorage) {
  const stored = await storage.getItem(ANALYTICS_CONSENT_KEY);
  return normalizeConsent(stored);
}

export async function setAnalyticsConsent(consent, storage = AsyncStorage) {
  const normalized = normalizeConsent(consent);
  await storage.setItem(ANALYTICS_CONSENT_KEY, normalized);
  if (normalized !== 'granted') sessionId = null;
  return initializePosthogAnalytics({ consent: normalized });
}

export async function revokeAnalyticsConsent(storage = AsyncStorage) {
  sessionId = null;
  return setAnalyticsConsent('denied', storage);
}

export async function initializePosthogAnalytics({ consent } = {}) {
  const resolvedConsent = consent || await readAnalyticsConsent();
  const apiKey = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_API_KEY;
  const host = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_HOST || DEFAULT_HOST;
  if (resolvedConsent !== 'granted') {
    setAnalyticsTransport(createPosthogAnalyticsTransport({ consent: resolvedConsent }));
    return { enabled: false, consent: resolvedConsent, reason: 'consent_not_granted' };
  }
  if (!apiKey) {
    setAnalyticsTransport(async () => ({ accepted: false, reason: 'token_not_configured' }));
    return { enabled: false, consent: resolvedConsent, reason: 'token_not_configured' };
  }
  const transport = createPosthogAnalyticsTransport({ apiKey, host, consent: resolvedConsent });
  setAnalyticsTransport(transport);
  return { enabled: true, consent: resolvedConsent, provider: 'posthog' };
}

function normalizeConsent(value) {
  const normalized = String(value || 'unknown').toLowerCase();
  if (!ALLOWED_CONSENT.has(normalized)) throw new Error('Invalid analytics consent state');
  return normalized;
}

function normalizePosthogHost(host) {
  const parsed = new URL(String(host || DEFAULT_HOST));
  if (parsed.protocol !== 'https:') throw new Error('PostHog host must use HTTPS');
  return parsed.origin.replace(/\/$/, '');
}
