import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENT_SPECS,
  buildAnalyticsEvent,
  bucketCount,
} from '../../src/analyticsEventsModel.js';
import {
  deliverAnalyticsEvent,
  resetAnalyticsTransport,
  setAnalyticsTransport,
  trackAnalyticsEvent,
} from '../../src/analytics.js';
import { createPosthogAnalyticsTransport } from '../../src/posthogAnalyticsTransport.js';

const requiredEventNames = [
  'onboarding_started',
  'child_profile_created',
  'reference_photo_confirmed',
  'photo_permission_granted',
  'assistant_review_opened',
  'assistant_suggestion_kept',
  'assistant_suggestion_dismissed',
  'review_batch_saved',
  'auto_save_enabled',
  'auto_save_disabled',
  'auto_saved_moment_removed',
  'moment_saved',
  'post_save_nudge_shown',
  'post_save_nudge_accepted',
  'prompt_answered',
  'missed_prompt_answered',
  'first_saved',
  'letter_saved',
  'digest_opened',
  'book_opened',
  'book_export_started',
  'invite_sent',
  'gift_started',
  'gift_redeemed',
  'purchase_started',
  'purchase_completed',
  'tonight_opened',
  'tonight_item_decided',
  'tonight_completed',
  'tonight_notification_scheduled',
  'collection_correction_applied',
  'shared_annotation_saved',
];

afterEach(() => {
  resetAnalyticsTransport();
});

test('analytics catalog covers every J1 event name', () => {
  assert.deepEqual(ANALYTICS_EVENT_NAMES, requiredEventNames);
  for (const eventName of requiredEventNames) {
    assert.ok(ANALYTICS_EVENT_SPECS[eventName], `${eventName} is specified`);
    assert.ok(ANALYTICS_EVENT_SPECS[eventName].required.length > 0, `${eventName} has required properties`);
  }
});

test('valid analytics events include the privacy-safe common envelope', () => {
  const event = buildAnalyticsEvent('moment_saved', {
    surface: 'add',
    save_source: 'add_sheet',
    media_kind: 'photo',
    media_count_bucket: bucketCount(3),
    has_voice: false,
    has_text_note: true,
    happened_at_changed: true,
    child_age_band: '6_12m',
  }, {
    family_id: 'family-1',
    child_id: 'child-1',
    actor_role: 'creator',
    plan_state: 'active',
    platform: 'ios',
    environment: 'production',
    app_version: '1.0.3',
  });

  assert.equal(event.event_name, 'moment_saved');
  assert.equal(event.schema_version, 1);
  assert.equal(event.source, 'mobile');
  assert.equal(event.family_id, 'family-1');
  assert.equal(event.child_id, 'child-1');
  assert.equal(event.media_count_bucket, '2_4');
  assert.equal(event.has_text_note, true);
});

test('analytics events require event-specific properties', () => {
  assert.throws(
    () => buildAnalyticsEvent('book_opened', {
      surface: 'book',
      open_source: 'bottom_nav',
      book_state: 'building',
      moment_count_bucket: '2_4',
    }),
    /chapter_count_bucket/,
  );
});

test('analytics events reject unknown event names and unknown properties', () => {
  assert.throws(
    () => buildAnalyticsEvent('memory_caption_saved', {}),
    /Unknown analytics event/,
  );
  assert.throws(
    () => buildAnalyticsEvent('book_opened', {
      surface: 'book',
      open_source: 'bottom_nav',
      book_state: 'building',
      chapter_count_bucket: '1',
      moment_count_bucket: '2_4',
      screenTitle: 'Book',
    }),
    /Unknown analytics property/,
  );
});

test('analytics events reject content-like keys before payloads can leak', () => {
  assert.throws(
    () => buildAnalyticsEvent('moment_saved', {
      surface: 'add',
      save_source: 'add_sheet',
      media_kind: 'photo',
      media_count_bucket: '1',
      has_voice: false,
      has_text_note: true,
      happened_at_changed: false,
      child_age_band: '6_12m',
      caption: 'Tiny smile on the kitchen floor.',
    }),
    /Forbidden analytics field: caption/,
  );
  assert.throws(
    () => buildAnalyticsEvent('prompt_answered', {
      surface: 'today',
      prompt_key: 'daily_roll',
      prompt_age_band: '6_12m',
      has_linked_moment: false,
      prompt_text: 'What surprised you today?',
    }),
    /Forbidden analytics field: prompt_text/,
  );
});

test('analytics events reject unsafe string values such as URLs and emails', () => {
  assert.throws(
    () => buildAnalyticsEvent('prompt_answered', {
      surface: 'today',
      prompt_key: 'https://example.com/prompt',
      prompt_age_band: '6_12m',
      has_linked_moment: false,
    }),
    /Unsafe analytics value/,
  );
  assert.throws(
    () => buildAnalyticsEvent('invite_sent', {
      surface: 'settings',
      invite_role: 'partner',
      send_method: 'email',
    }, {
      family_id: 'parent@example.com',
    }),
    /Unsafe analytics value/,
  );
});

test('analytics events reject values outside documented enums', () => {
  assert.throws(
    () => buildAnalyticsEvent('book_opened', {
      surface: 'library',
      open_source: 'bottom_nav',
      book_state: 'building',
      chapter_count_bucket: '1',
      moment_count_bucket: '2_4',
    }),
    /Invalid analytics value/,
  );
});

test('bucket count helper only returns documented coarse count buckets', () => {
  assert.equal(bucketCount(0), '0');
  assert.equal(bucketCount(1), '1');
  assert.equal(bucketCount(4), '2_4');
  assert.equal(bucketCount(9), '5_9');
  assert.equal(bucketCount(24), '10_24');
  assert.equal(bucketCount(25), '25_plus');
});

test('central analytics wrapper validates before sending to the transport', () => {
  const sent = [];
  setAnalyticsTransport((event) => sent.push(event));

  const event = trackAnalyticsEvent('book_opened', {
    surface: 'book',
    open_source: 'bottom_nav',
    book_state: 'building',
    chapter_count_bucket: '1',
    moment_count_bucket: '2_4',
  }, {
    platform: 'ios',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0], event);
  assert.throws(
    () => trackAnalyticsEvent('book_opened', {
      surface: 'book',
      open_source: 'bottom_nav',
      book_state: 'building',
      chapter_count_bucket: '1',
      moment_count_bucket: '2_4',
      mediaUrl: 'https://example.com/photo.jpg',
    }),
    /Forbidden analytics field: mediaUrl/,
  );
  assert.equal(sent.length, 1);
});

test('provider transport is disabled unless consent is explicitly granted', async () => {
  const transport = createPosthogAnalyticsTransport({ consent: 'unknown' });
  const result = await transport({ event_name: 'book_opened' });
  assert.deepEqual(result, { accepted: false, reason: 'consent_not_granted' });
});

test('provider transport sends a privacy-validated event without person profiles', async () => {
  const requests = [];
  setAnalyticsTransport(createPosthogAnalyticsTransport({
    apiKey: 'phc_our_little_world_test_only',
    host: 'https://us.i.posthog.com',
    consent: 'granted',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  }));

  const delivery = await deliverAnalyticsEvent('purchase_started', {
    surface: 'purchase',
    purchase_source: 'paywall',
    product_key: 'family_year',
    purchase_channel: 'in_app',
  }, {
    family_id: '2ec3c328-9004-4a46-92e6-dc6f437b11ba',
    platform: 'ios',
    environment: 'preview',
  });

  assert.equal(delivery.delivered, true);
  assert.equal(requests.length, 1);
  const payload = JSON.parse(requests[0].init.body);
  assert.equal(payload.event, 'purchase_started');
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.distinct_id, '2ec3c328-9004-4a46-92e6-dc6f437b11ba');
  assert.equal(JSON.stringify(payload).includes('email'), false);
  assert.equal(JSON.stringify(payload).includes('caption'), false);
});

test('provider transport rejects non-HTTPS hosts and non-OLW tokens', () => {
  assert.throws(
    () => createPosthogAnalyticsTransport({ apiKey: 'wrong-token', consent: 'granted' }),
    /dedicated Our Little World/,
  );
  assert.throws(
    () => createPosthogAnalyticsTransport({ apiKey: 'phc_test', host: 'http://example.com', consent: 'granted' }),
    /HTTPS/,
  );
});
