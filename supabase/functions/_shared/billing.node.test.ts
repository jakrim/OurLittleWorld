import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquisitionMetadataFromBody,
  appendAcquisitionMetadata,
  checkoutCode,
  checkoutIdempotencyKey,
  decryptCode,
  encryptCode,
  HttpError,
  originFromRequest,
  planFromInput,
  stripeReceiptSummary,
  verifyStripeWebhook,
} from './billing.ts';

const environment = new Map<string, string>();
(globalThis as any).Deno = {
  env: {
    get(name: string) {
      return environment.get(name);
    },
  },
};

test.beforeEach(() => {
  environment.clear();
  environment.set('OLW_WEB_ORIGIN', 'https://ourlittleworld.me');
  environment.set('OLW_ALLOWED_ORIGINS', 'https://ourlittleworld.me,http://localhost:3000');
  environment.set('OLW_CODE_ENCRYPTION_KEY', 'unit-test-only-key-material');
  environment.set('STRIPE_WEBHOOK_SECRET', 'whsec_unit_test');
  environment.set('STRIPE_MODE', 'test');
});

test('checkout plans are server allowlisted', () => {
  assert.equal(planFromInput('family_yearly').planKey, 'family_yearly');
  assert.throws(() => planFromInput('price_attacker_supplied'), HttpError);
});

test('checkout redirects cannot be moved to an arbitrary request origin', () => {
  const hostile = new Request('https://functions.example/checkout', { headers: { origin: 'https://evil.example' } });
  assert.equal(originFromRequest(hostile), 'https://ourlittleworld.me');
  const local = new Request('https://functions.example/checkout', { headers: { origin: 'http://localhost:3000' } });
  assert.equal(originFromRequest(local), 'http://localhost:3000');
});

test('purchase codes are encrypted at rest and round-trip only with the server key', async () => {
  const code = 'GIFT-2345-6789-ABCD';
  const ciphertext = await encryptCode(code);
  assert.doesNotMatch(ciphertext, /GIFT|2345|ABCD/);
  assert.equal(await decryptCode(ciphertext), code);
});

test('checkout retries use a stable provider idempotency key', () => {
  const attempt = '019f5be4-8808-7443-8de9-0e405cfc8d6a';
  assert.equal(checkoutIdempotencyKey('gift', attempt), checkoutIdempotencyKey('gift', attempt));
  assert.notEqual(checkoutIdempotencyKey('gift', attempt), checkoutIdempotencyKey('self', attempt));
});

test('checkout retries reuse stable code material and ciphertext', async () => {
  const attempt = '019f5be4-8808-7443-8de9-0e405cfc8d6a';
  const firstCode = await checkoutCode('GIFT', 'gift', attempt);
  const secondCode = await checkoutCode('GIFT', 'gift', attempt);
  assert.equal(firstCode, secondCode);
  assert.equal(
    await encryptCode(firstCode, `gift:${attempt}`),
    await encryptCode(secondCode, `gift:${attempt}`),
  );
});

test('stored receipt summaries exclude metadata, email, codes, and payment details', () => {
  const summary = stripeReceiptSummary({
    id: 'sub_test',
    object: 'subscription',
    livemode: false,
    status: 'active',
    customer: 'cus_test',
    metadata: { recipient_email: 'private@example.com', code: 'GIFT-SECRET' },
    customer_details: { email: 'private@example.com' },
    payment_method: { card: { last4: '4242' } },
  });
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /private@example|GIFT-SECRET|4242|metadata/);
  assert.equal(summary.status, 'active');
});

test('checkout attribution preserves safe first and last touches without PII', () => {
  const acquisition = acquisitionMetadataFromBody({
    attribution_campaign: 'current-campaign',
    attribution_first_campaign: 'first-campaign',
    attribution_first_landing_page: '/for/unfinished-baby-book',
    attribution_last_campaign: 'last-campaign',
    attribution_last_landing_page: '/pricing',
    attribution_creative: 'private@example.com',
  });
  const params = new URLSearchParams();
  appendAcquisitionMetadata(params, acquisition);
  assert.equal(params.get('metadata[acquisition_first_campaign]'), 'first-campaign');
  assert.equal(params.get('metadata[acquisition_last_campaign]'), 'last-campaign');
  assert.equal(params.get('metadata[acquisition_first_landing_page]'), '/for/unfinished-baby-book');
  assert.equal(params.get('metadata[acquisition_creative]'), null);
});

test('webhook signatures require a current timestamp and matching test/live mode', async () => {
  const now = 1_800_000_000;
  const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_123' } } });
  const validRequest = await signedRequest(payload, now);
  const event = await verifyStripeWebhook(validRequest, now);
  assert.equal(event.id, 'evt_test');

  const expiredRequest = await signedRequest(payload, now - 301);
  await assert.rejects(() => verifyStripeWebhook(expiredRequest, now), /Expired Stripe signature/);

  environment.set('STRIPE_MODE', 'live');
  const wrongModeRequest = await signedRequest(payload, now);
  await assert.rejects(() => verifyStripeWebhook(wrongModeRequest, now), /environment does not match/);
});

async function signedRequest(payload: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(environment.get('STRIPE_WEBHOOK_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const signature = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://functions.example/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}
