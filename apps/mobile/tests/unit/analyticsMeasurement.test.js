import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { deliverAnalyticsEvent, resetAnalyticsTransport, setAnalyticsTransport } from '../../src/analytics.js';
import { buildAnalyticsEvent } from '../../src/analyticsEventsModel.js';
import { sanitizeAcquisitionContext } from '../../src/analyticsProductContext.js';
import {
  createPosthogAnalyticsTransport,
  readAnalyticsConsent,
  revokeAnalyticsConsent,
  setAnalyticsConsent,
} from '../../src/posthogAnalyticsTransport.js';

afterEach(() => resetAnalyticsTransport());

test('private family fields are rejected recursively before transport', () => {
  assert.throws(() => buildAnalyticsEvent('moment_saved', {
    surface: 'add',
    save_source: 'add_sheet',
    media_kind: 'photo',
    media_count_bucket: '1',
    has_voice: false,
    has_text_note: true,
    nested: { caption: 'first smile' },
  }), /Forbidden analytics field: caption|Unknown analytics property: nested/);

  assert.throws(() => buildAnalyticsEvent('gift_redeemed', {
    surface: 'purchase',
    redemption_type: 'gift',
    plan_state_after: 'gift',
    redemptionCode: 'GIFT-PRIVATE',
  }), /Forbidden analytics field: redemptionCode/);
});

test('valid first-memory attribution contains only coarse dimensions', () => {
  const event = buildAnalyticsEvent('moment_saved', {
    surface: 'add',
    save_source: 'add_sheet',
    media_kind: 'photo',
    media_count_bucket: '1',
    has_voice: false,
    has_text_note: true,
  }, {
    family_id: 'family-1',
    angle: 'unfinished-baby-book',
    campaign: 'july-organic',
    creative: 'one-photo-one-line',
    channel: 'instagram',
    landing_page: '/for/unfinished-baby-book',
  });

  assert.equal(event.angle, 'unfinished-baby-book');
  assert.equal(JSON.stringify(event).includes('caption'), false);
  assert.equal(JSON.stringify(event).includes('birthday'), false);
});

test('acquisition sanitizer rejects contact data and URLs', () => {
  assert.deepEqual(sanitizeAcquisitionContext({
    campaign: 'parent@example.com',
    angle: 'unfinished-baby-book',
    creative: 'https://private.example/photo',
    channel: 'instagram',
    landing_page: '/for/unfinished-baby-book',
    caption: 'private text',
  }), {
    angle: 'unfinished-baby-book',
    channel: 'instagram',
    landing_page: '/for/unfinished-baby-book',
  });
});

test('mobile consent supports grant, deny, change, and revoke', async () => {
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
  };

  assert.equal(await readAnalyticsConsent(storage), 'unknown');
  assert.equal((await setAnalyticsConsent('granted', storage)).consent, 'granted');
  assert.equal(await readAnalyticsConsent(storage), 'granted');
  assert.equal((await setAnalyticsConsent('denied', storage)).consent, 'denied');
  assert.equal(await readAnalyticsConsent(storage), 'denied');
  assert.equal((await setAnalyticsConsent('granted', storage)).consent, 'granted');
  assert.equal((await revokeAnalyticsConsent(storage)).consent, 'denied');
  assert.equal(await readAnalyticsConsent(storage), 'denied');
});

test('denied consent immediately replaces delivery with a blocked transport', async () => {
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
  };
  setAnalyticsTransport(async () => ({ accepted: true }));
  await setAnalyticsConsent('denied', storage);

  const result = await deliverAnalyticsEvent('purchase_started', {
    surface: 'purchase',
    purchase_source: 'paywall',
    product_key: 'family_year',
    purchase_channel: 'in_app',
  });
  assert.equal(result.delivered, false);
  assert.equal(result.result.reason, 'consent_not_granted');
});

test('PostHog transport disables person profiles and emits no private fields', async () => {
  const requests = [];
  const transport = createPosthogAnalyticsTransport({
    apiKey: 'phc_our_little_world_test_only',
    consent: 'granted',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  const event = buildAnalyticsEvent('purchase_completed', {
    surface: 'purchase',
    product_key: 'family_year',
    purchase_channel: 'in_app',
    plan_state_after: 'active',
  }, { family_id: 'family-1' });
  await transport(event);

  const payload = JSON.parse(requests[0].init.body);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(JSON.stringify(payload).includes('email'), false);
  assert.equal(JSON.stringify(payload).includes('gift_code'), false);
});
