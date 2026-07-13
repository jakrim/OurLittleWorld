import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';

import {
  mailchimpSubscriberHash,
  normalizeMarketingEmail,
  providerContactDisposition,
  providerStatusForMailchimpEvent,
  retryDelaySeconds,
  safeMarketingMergeFields,
  sha256Text,
  sourceTag,
  syncClaimToMailchimp,
  syncMarketingContacts,
  verifyMailchimpSignature,
} from './marketing.ts';

test('marketing email normalization preserves meaningful punctuation', async () => {
  const dotted = normalizeMarketingEmail(' A.B+launch@Example.com ');
  const plain = normalizeMarketingEmail('ablaunch@example.com');
  assert.equal(dotted, 'a.b+launch@example.com');
  assert.notEqual(await sha256Text(dotted), await sha256Text(plain));
  assert.rejects(async () => normalizeMarketingEmail('not-an-email'));
});

test('Mailchimp subscriber hash matches MD5 reference vectors', () => {
  for (const email of ['test@example.com', 'a.b+launch@example.com', 'JESSE@EXAMPLE.COM']) {
    const normalized = email.toLowerCase();
    assert.equal(
      mailchimpSubscriberHash(email),
      createHash('md5').update(normalized).digest('hex'),
    );
  }
});

test('Mailchimp signature validation rejects replay and mutation', async () => {
  const secret = 'controlled-test-secret';
  const timestamp = 1_720_000_000;
  const body = 'type=unsubscribe&data%5Bemail%5D=test%40example.com';
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const header = `t=${timestamp},v1=${signature}`;
  assert.equal(await verifyMailchimpSignature(header, body, secret, timestamp), true);
  assert.equal(await verifyMailchimpSignature(header, `${body}x`, secret, timestamp), false);
  assert.equal(await verifyMailchimpSignature(header, body, secret, timestamp + 301), false);
});

test('provider status and retry policies fail closed', () => {
  assert.equal(providerContactDisposition('subscribed'), 'subscribed');
  assert.equal(providerContactDisposition('cleaned'), 'suppressed');
  assert.equal(providerContactDisposition('unsubscribed'), 'unsubscribed');
  assert.equal(providerContactDisposition('unexpected'), 'unknown');
  assert.equal(retryDelaySeconds(1), 60);
  assert.equal(retryDelaySeconds(20), 21_600);
  assert.equal(sourceTag('web_gift-success'), 'source-web-gift-success');
  assert.equal(providerStatusForMailchimpEvent('unsubscribe', 'manual', 'unsub'), 'unsubscribed');
  assert.equal(providerStatusForMailchimpEvent('unsubscribe', 'abuse', 'unsub'), 'complained');
  assert.equal(providerStatusForMailchimpEvent('unsubscribe', 'manual', 'spam'), 'complained');
  assert.equal(providerStatusForMailchimpEvent('cleaned'), 'cleaned');
  assert.equal(providerStatusForMailchimpEvent('profile'), 'unchanged');
});

test('Mailchimp merge fields contain only coarse, allowlisted attribution', () => {
  const fields = safeMarketingMergeFields({
    contact_id: 'contact-1',
    outbox_id: 'outbox-1',
    claim_token: 'claim-token-1',
    email: 'owner@example.com',
    consent_source: 'web_home',
    consented_at: '2026-07-13T12:00:00Z',
    attempt_count: 1,
    sync_action: 'upsert',
    attribution: {
      first_campaign: 'first-campaign',
      campaign: 'fallback-campaign',
      last_campaign: 'launch-2026',
      last_angle: 'unfinished-baby-book',
      last_creative: 'hero-a',
      last_channel: 'newsletter',
      private_note: 'never copy this',
      last_landing_page: '/private/path',
      last_angle_unsafe: 'owner@example.com',
    },
  });
  assert.deepEqual(fields, {
    CSOURCE: 'web_home',
    CONSENTAT: '2026-07-13',
    LSTATE: 'launch_interest',
    CAMPAIGN: 'launch-2026',
    ANGLE: 'unfinished-baby-book',
    CREATIVE: 'hero-a',
    CHANNEL: 'newsletter',
  });
});

test('a prior opt-out is never directly resubscribed by the sync worker', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const writes: Array<Record<string, unknown>> = [];
  (globalThis as { Deno?: unknown }).Deno = {
    env: {
      get(name: string) {
        if (name === 'OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID') return 'controlled-audience';
        if (name === 'OUR_LITTLE_WORLD_MAILCHIMP_API_KEY') return 'controlled-key';
        if (name === 'OUR_LITTLE_WORLD_MAILCHIMP_SERVER_PREFIX') return 'us1';
        return '';
      },
    },
  };
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === 'GET') return new Response('{}', { status: 404 });
    writes.push(JSON.parse(String(init.body || '{}')));
    return Response.json({ id: '0123456789abcdef0123456789abcdef', status: 'pending' });
  };

  try {
    const member = await syncClaimToMailchimp({
      contact_id: 'contact-1',
      outbox_id: 'outbox-1',
      claim_token: 'claim-token-1',
      email: 'owner+reconfirm@example.com',
      consent_source: 'web_home',
      consented_at: '2026-07-13T12:00:00Z',
      attempt_count: 1,
      sync_action: 'reconfirm',
      welcome_enrolled: false,
    });
    assert.equal(member.status, 'pending');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status_if_new, 'pending');
    assert.notEqual(writes[0].status_if_new, 'subscribed');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
  }
});

test('stale completion and failure leases never report a successful sync', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const originalConsoleError = console.error;
  const completionBodies: Array<Record<string, unknown>> = [];
  const failureBodies: Array<Record<string, unknown>> = [];
  const errors: unknown[][] = [];
  const successfulEmail = 'successful-lease@example.com';
  const successfulMemberHash = mailchimpSubscriberHash(successfulEmail);

  (globalThis as { Deno?: unknown }).Deno = {
    env: {
      get(name: string) {
        const values: Record<string, string> = {
          SUPABASE_URL: 'https://supabase.test',
          SUPABASE_SERVICE_ROLE_KEY: 'controlled-service-key',
          OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED: 'true',
          OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID: 'controlled-audience',
          OUR_LITTLE_WORLD_MAILCHIMP_API_KEY: 'controlled-key',
          OUR_LITTLE_WORLD_MAILCHIMP_SERVER_PREFIX: 'us1',
        };
        return values[name] || '';
      },
    },
  };
  console.error = (...args: unknown[]) => errors.push(args);
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/rest/v1/rpc/claim_marketing_contact_sync')) {
      return Response.json([
        {
          contact_id: 'successful-contact',
          outbox_id: 'successful-outbox',
          claim_token: 'successful-token',
          email: successfulEmail,
          consent_source: 'web_home',
          consented_at: '2026-07-13T12:00:00Z',
          attempt_count: 1,
          sync_action: 'upsert',
          audience_id: 'controlled-audience',
          welcome_enrolled: false,
        },
        {
          contact_id: 'failed-contact',
          outbox_id: 'failed-outbox',
          claim_token: 'failed-token',
          email: 'failed-lease@example.com',
          consent_source: 'web_home',
          consented_at: '2026-07-13T12:00:00Z',
          attempt_count: 8,
          sync_action: 'upsert',
          audience_id: 'controlled-audience',
          welcome_enrolled: false,
        },
      ]);
    }
    if (url.endsWith('/rest/v1/rpc/complete_marketing_contact_sync')) {
      completionBodies.push(JSON.parse(String(init.body || '{}')));
      return Response.json({ completed: false, duplicate: true, outbox_state: 'missing' });
    }
    if (url.endsWith('/rest/v1/rpc/fail_marketing_contact_sync')) {
      failureBodies.push(JSON.parse(String(init.body || '{}')));
      return Response.json({ failed: false, duplicate: true, outbox_state: 'missing' });
    }
    if (init.method === 'GET' && url.includes(successfulMemberHash)) {
      return Response.json({ id: successfulMemberHash, status: 'subscribed' });
    }
    if (init.method === 'GET') {
      return Response.json({ title: 'Temporary provider error' }, { status: 500 });
    }
    if (init.method === 'PATCH') {
      return Response.json({ id: successfulMemberHash, status: 'subscribed' });
    }
    if (init.method === 'POST') return Response.json({});
    throw new Error(`Unexpected request: ${init.method || 'GET'} ${url}`);
  };

  try {
    const results = await syncMarketingContacts({ batchSize: 2 });
    assert.deepEqual(results.map((result) => result.state), ['retry', 'retry']);
    assert.deepEqual(completionBodies, [{
      target_contact_id: 'successful-contact',
      target_provider_status: 'subscribed',
      target_member_hash: successfulMemberHash,
      target_welcome_enrolled: false,
      target_outbox_id: 'successful-outbox',
      target_claim_token: 'successful-token',
    }]);
    assert.equal(failureBodies.length, 1);
    assert.equal(failureBodies[0].target_contact_id, 'failed-contact');
    assert.equal(failureBodies[0].target_outbox_id, 'failed-outbox');
    assert.equal(failureBodies[0].target_claim_token, 'failed-token');
    assert.equal(failureBodies[0].target_terminal, true);
    assert.equal(errors.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
    console.error = originalConsoleError;
  }
});

test('provider pending is distinct from synced for upsert and reconfirm claims', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const completionBodies: Array<Record<string, unknown>> = [];

  (globalThis as { Deno?: unknown }).Deno = {
    env: {
      get(name: string) {
        const values: Record<string, string> = {
          SUPABASE_URL: 'https://supabase.test',
          SUPABASE_SERVICE_ROLE_KEY: 'controlled-service-key',
          OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED: 'true',
          OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID: 'controlled-audience',
          OUR_LITTLE_WORLD_MAILCHIMP_API_KEY: 'controlled-key',
          OUR_LITTLE_WORLD_MAILCHIMP_SERVER_PREFIX: 'us1',
        };
        return values[name] || '';
      },
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/rest/v1/rpc/claim_marketing_contact_sync')) {
      return Response.json([
        {
          contact_id: 'upsert-pending-contact',
          outbox_id: 'upsert-pending-outbox',
          claim_token: 'upsert-pending-token',
          email: 'upsert-pending@example.com',
          consent_source: 'web_home',
          consented_at: '2026-07-13T12:00:00Z',
          attempt_count: 1,
          sync_action: 'upsert',
          audience_id: 'controlled-audience',
          welcome_enrolled: false,
        },
        {
          contact_id: 'reconfirm-pending-contact',
          outbox_id: 'reconfirm-pending-outbox',
          claim_token: 'reconfirm-pending-token',
          email: 'reconfirm-pending@example.com',
          consent_source: 'web_home',
          consented_at: '2026-07-13T12:00:00Z',
          attempt_count: 1,
          sync_action: 'reconfirm',
          audience_id: 'controlled-audience',
          welcome_enrolled: false,
        },
      ]);
    }
    if (url.endsWith('/rest/v1/rpc/complete_marketing_contact_sync')) {
      completionBodies.push(JSON.parse(String(init.body || '{}')));
      return Response.json({ completed: true, duplicate: false, outbox_state: 'completed' });
    }
    if (init.method === 'GET') {
      return Response.json({ id: '0123456789abcdef0123456789abcdef', status: 'pending' });
    }
    throw new Error(`Unexpected request: ${init.method || 'GET'} ${url}`);
  };

  try {
    const results = await syncMarketingContacts({ batchSize: 2 });
    assert.deepEqual(results.map((result) => result.state), ['pending', 'pending']);
    assert.deepEqual(results.map((result) => result.providerStatus), ['pending', 'pending']);
    assert.deepEqual(
      completionBodies.map((body) => [body.target_outbox_id, body.target_claim_token]),
      [
        ['upsert-pending-outbox', 'upsert-pending-token'],
        ['reconfirm-pending-outbox', 'reconfirm-pending-token'],
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
  }
});
