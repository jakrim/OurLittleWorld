import assert from 'node:assert/strict';
import test from 'node:test';

import {
  lifecycleEventFromClaim,
  lifecycleIngestUrl,
  lifecycleSource,
  exportLifecycleEvents,
  portfolioEventId,
  productContactKey,
  signedLifecycleRequest,
  type MeasurementClaim,
} from './lifecycle_export.ts';

const contactSecret = 'contact-key-secret-longer-than-thirty-two-characters';
const ingestSecret = 'product-ingest-secret-longer-than-thirty-two-characters';

function claim(overrides: Partial<MeasurementClaim> = {}): MeasurementClaim {
  return {
    outbox_id: 'outbox-1',
    lifecycle_event_id: 'lifecycle-1',
    event_id: 'olw:first_memory_saved:event-1',
    claim_token: 'claim-1',
    email: 'Parent@Example.com ',
    event_name: 'first_memory_saved',
    occurred_at: '2026-07-14T04:00:00Z',
    lifecycle_state: 'activated_user',
    billing_state: 'none',
    campaign_id: 'founder-story-v1',
    angle_id: 'one-photo-one-line',
    creative_id: 'welcome-email',
    channel: 'email',
    attempt_count: 1,
    ...overrides,
  };
}

test('contact key is stable, product-scoped, and contains no email', async () => {
  const first = await productContactKey('Parent@Example.com', contactSecret);
  const second = await productContactKey(' parent@example.com ', contactSecret);
  assert.equal(first, second);
  assert.equal(
    first,
    'hmac_sha256:369f0cf0a5151620c7eb2b252271017fd13f56102a576fef65a19924d35eca05',
  );
  assert.match(first, /^hmac_sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(first, /parent|@/i);
});

test('event projection contains only coarse allowlisted lifecycle fields', async () => {
  const event = await lifecycleEventFromClaim(claim(), contactSecret);
  assert.deepEqual(event, {
    product_id: 'our-little-world',
    event_id: await portfolioEventId('olw:first_memory_saved:event-1', contactSecret),
    event_name: 'first_memory_saved',
    occurred_at: '2026-07-14T04:00:00Z',
    contact_key: await productContactKey('parent@example.com', contactSecret),
    source: 'product_backend',
    campaign_id: 'founder-story-v1',
    angle_id: 'one-photo-one-line',
    creative_id: 'welcome-email',
    consent_state: 'subscribed',
    properties: {
      lifecycle_state: 'activated_user',
      billing_state: 'none',
      channel: 'email',
      schema_version: 1,
    },
    schema_version: 1,
  });
  const serialized = JSON.stringify(event);
  for (const forbidden of [
    'Parent@Example.com',
    'olw:first_memory_saved:event-1',
    'child_name',
    'caption',
    'letter_body',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('tracking dimensions that resemble contact data are omitted', async () => {
  const event = await lifecycleEventFromClaim(claim({
    campaign_id: '202607141234567890',
    angle_id: 'https://example.com/private',
    creative_id: 'parent@example.com',
  }), contactSecret);
  assert.equal(event.campaign_id, undefined);
  assert.equal(event.angle_id, undefined);
  assert.equal(event.creative_id, undefined);
});

test('billing and consent events use their authoritative source class', () => {
  assert.equal(lifecycleSource('marketing_subscribed'), 'consent_ledger');
  assert.equal(lifecycleSource('paid_started'), 'billing_webhook');
  assert.equal(lifecycleSource('gift_redeemed'), 'billing_webhook');
  assert.equal(lifecycleSource('first_created'), 'product_backend');
});

test('signed request covers the exact body and requires the product header', async () => {
  const event = await lifecycleEventFromClaim(claim(), contactSecret);
  const request = await signedLifecycleRequest([event], ingestSecret, '1784000000');
  assert.equal(request.headers['x-lifecycle-product'], 'our-little-world');
  assert.equal(request.headers['x-lifecycle-timestamp'], '1784000000');
  assert.match(request.headers['x-lifecycle-signature'], /^v1=[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(JSON.parse(request.body)), ['events']);
});

test('only the exact HTTPS ingest route is accepted outside local tests', () => {
  assert.equal(
    lifecycleIngestUrl('https://lifecycle.example.com/v1/lifecycle/events'),
    'https://lifecycle.example.com/v1/lifecycle/events',
  );
  assert.equal(
    lifecycleIngestUrl('http://127.0.0.1:8080/v1/lifecycle/events'),
    'http://127.0.0.1:8080/v1/lifecycle/events',
  );
  assert.throws(() => lifecycleIngestUrl('http://lifecycle.example.com/v1/lifecycle/events'));
  assert.throws(() => lifecycleIngestUrl('https://lifecycle.example.com/other'));
});

test('successful export completes the independent measurement lease', async () => {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const result = await exportLifecycleEvents({
    rpcImpl: async (name, body) => {
      calls.push({ name, body });
      if (name === 'claim_marketing_measurement_events') return [claim()];
      if (name === 'complete_marketing_measurement_event') {
        return { completed: true, duplicate: false };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    envImpl: (name) => ({
      LIFECYCLE_CONTACT_KEY_SECRET: contactSecret,
      LIFECYCLE_INGEST_OUR_LITTLE_WORLD_SECRET: ingestSecret,
      LIFECYCLE_INGEST_URL: 'https://lifecycle.example.com/v1/lifecycle/events',
    }[name] || ''),
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(String(init?.body || '{}'));
      assert.equal(payload.events.length, 1);
      assert.doesNotMatch(JSON.stringify(payload), /Parent@Example\.com|event-1/);
      return Response.json({ received: 1, inserted: 1, duplicates: 0 }, { status: 202 });
    },
  });
  assert.deepEqual(result, [{ state: 'synced' }]);
  assert.deepEqual(calls.map((call) => call.name), [
    'claim_marketing_measurement_events',
    'complete_marketing_measurement_event',
  ]);
});

test('retryable central failure returns the measurement lease without blocking Mailchimp', async () => {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const result = await exportLifecycleEvents({
    rpcImpl: async (name, body) => {
      calls.push({ name, body });
      if (name === 'claim_marketing_measurement_events') return [claim()];
      if (name === 'fail_marketing_measurement_event') {
        return { failed: true, duplicate: false, state: 'retry' };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    envImpl: (name) => ({
      LIFECYCLE_CONTACT_KEY_SECRET: contactSecret,
      LIFECYCLE_INGEST_OUR_LITTLE_WORLD_SECRET: ingestSecret,
      LIFECYCLE_INGEST_URL: 'https://lifecycle.example.com/v1/lifecycle/events',
    }[name] || ''),
    fetchImpl: async () => Response.json({ error: 'unavailable' }, { status: 503 }),
  });
  assert.deepEqual(result, [{ state: 'retry', errorCode: 'ingest_unavailable' }]);
  const failure = calls.find((call) => call.name === 'fail_marketing_measurement_event');
  assert.equal(failure?.body.target_terminal, false);
  assert.equal(failure?.body.target_error_code, 'ingest_unavailable');
});

test('contract rejection quarantines the measurement row without changing provider delivery', async () => {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const result = await exportLifecycleEvents({
    rpcImpl: async (name, body) => {
      calls.push({ name, body });
      if (name === 'claim_marketing_measurement_events') return [claim()];
      if (name === 'fail_marketing_measurement_event') {
        return { failed: true, duplicate: false, state: 'quarantined' };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    envImpl: (name) => ({
      LIFECYCLE_CONTACT_KEY_SECRET: contactSecret,
      LIFECYCLE_INGEST_OUR_LITTLE_WORLD_SECRET: ingestSecret,
      LIFECYCLE_INGEST_URL: 'https://lifecycle.example.com/v1/lifecycle/events',
    }[name] || ''),
    fetchImpl: async () => Response.json({ error: 'invalid_lifecycle_event' }, { status: 422 }),
  });
  assert.deepEqual(result, [{ state: 'blocked', errorCode: 'ingest_contract_rejected' }]);
  const failure = calls.find((call) => call.name === 'fail_marketing_measurement_event');
  assert.equal(failure?.body.target_terminal, true);
});
