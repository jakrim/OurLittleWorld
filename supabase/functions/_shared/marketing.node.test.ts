import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';

import {
  mailchimpSubscriberHash,
  lifecycleMailchimpActions,
  mailchimpDate,
  mailchimpProviderErrorCode,
  normalizeMarketingEmail,
  providerContactDisposition,
  providerStatusForMailchimpEvent,
  retryDelaySeconds,
  safeMarketingMergeFields,
  safeMailchimpDiagnostic,
  sha256Text,
  sourceTag,
  syncLifecycleClaimToMailchimp,
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
    CONSENTAT: '07/13/2026',
    CAMPAIGN: 'launch-2026',
    ANGLE: 'unfinished-baby-book',
    CREATIVE: 'hero-a',
    CHANNEL: 'newsletter',
  });
});

test('Mailchimp consent dates use the configured US date format', () => {
  assert.equal(mailchimpDate('2026-07-13T12:00:00Z'), '07/13/2026');
  assert.equal(mailchimpDate('not-a-date', new Date('2026-07-14T00:00:00Z')), '07/14/2026');
});

test('Mailchimp rejections collapse to privacy-safe actionable categories', () => {
  assert.equal(
    mailchimpProviderErrorCode({ title: 'Forgotten Email Not Subscribed' }),
    'provider_contact_forgotten',
  );
  assert.equal(
    mailchimpProviderErrorCode({ title: 'Member In Compliance State' }),
    'provider_contact_compliance_state',
  );
  assert.equal(
    mailchimpProviderErrorCode({
      title: 'Invalid Resource',
      errors: [{ field: 'merge_fields.CONSENTAT' }],
    }),
    'provider_merge_field_consent_date',
  );
  assert.equal(
    mailchimpProviderErrorCode({
      title: 'Invalid Resource',
      errors: [{ field: 'email_address', message: 'This value is already a list member.' }],
    }),
    'provider_contact_conflict',
  );
  assert.equal(
    mailchimpProviderErrorCode({
      title: 'Invalid Resource',
      detail: 'This address has signed up to a lot of lists very recently.',
    }),
    'provider_contact_signup_rate_limited',
  );
});

test('Mailchimp terminal diagnostics redact addresses and provider URLs', () => {
  assert.deepEqual(
    safeMailchimpDiagnostic({
      title: 'Invalid Resource',
      detail: 'owner@example.com was rejected; see https://provider.example/error',
      errors: [{ field: 'email_address', message: 'owner@example.com cannot be added' }],
    }),
    {
      title: 'Invalid Resource',
      detail: '[email] was rejected; see [url]',
      fields: ['email_address'],
      messages: ['[email] cannot be added'],
    },
  );
});

test('lifecycle actions activate one coarse state and one milestone tag', () => {
  const actions = lifecycleMailchimpActions({
    outbox_id: 'outbox-1',
    event_id: 'olw:first_memory_saved:event-1',
    claim_token: 'claim-1',
    contact_id: 'contact-1',
    email: 'parent@example.com',
    event_name: 'first_memory_saved',
    occurred_at: '2026-07-13T12:00:00Z',
    lifecycle_state: 'activated_user',
    attempt_count: 1,
  });
  assert.deepEqual(actions.mergeFields, { LSTATE: 'activated_user' });
  assert.equal(
    actions.tags.find((tag) => tag.name === 'olw-state-activated')?.status,
    'active',
  );
  assert.equal(
    actions.tags.find((tag) => tag.name === 'olw-state-unactivated')?.status,
    'inactive',
  );
  assert.equal(
    actions.tags.find((tag) => tag.name === 'olw-activated-first-memory')?.status,
    'active',
  );
});

test('lifecycle provider writes are retry-safe and refuse non-subscribed members', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const writes: Array<{ method?: string; body?: Record<string, unknown> }> = [];
  (globalThis as { Deno?: unknown }).Deno = {
    env: {
      get(name: string) {
        const values: Record<string, string> = {
          OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID: 'controlled-audience',
          OUR_LITTLE_WORLD_MAILCHIMP_API_KEY: 'controlled-key',
          OUR_LITTLE_WORLD_MAILCHIMP_SERVER_PREFIX: 'us1',
        };
        return values[name] || '';
      },
    },
  };

  const claim = {
    outbox_id: 'outbox-1',
    event_id: 'olw:first_memory_saved:event-1',
    claim_token: 'claim-1',
    contact_id: 'contact-1',
    email: 'parent@example.com',
    event_name: 'first_memory_saved',
    occurred_at: '2026-07-13T12:00:00Z',
    lifecycle_state: 'activated_user',
    attempt_count: 1,
  };

  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === 'GET') return Response.json({ status: 'subscribed' });
    writes.push({
      method: init.method,
      body: JSON.parse(String(init.body || '{}')),
    });
    return Response.json({ status: 'subscribed' });
  };

  try {
    await syncLifecycleClaimToMailchimp(claim);
    await syncLifecycleClaimToMailchimp(claim);
    assert.equal(writes.length, 4);
    assert.deepEqual(writes.map((write) => write.method), ['POST', 'PATCH', 'POST', 'PATCH']);
    assert.deepEqual(writes[1].body, { merge_fields: { LSTATE: 'activated_user' } });

    globalThis.fetch = async () => Response.json({ status: 'unsubscribed' });
    await assert.rejects(
      () => syncLifecycleClaimToMailchimp(claim),
      (error: unknown) => error instanceof Error && error.message === 'provider_contact_not_marketable',
    );
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
  }
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
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (String(input).endsWith('/lists/controlled-audience?fields=id')) {
      return Response.json({ id: 'controlled-audience' });
    }
    if (url.includes('/search-members?')) {
      return Response.json({ exact_matches: { members: [] }, full_search: { members: [] } });
    }
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

test('an exact search match repairs a stale member lookup without a new signup', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const writes: Array<{ url: string; method?: string }> = [];
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
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/lists/controlled-audience?fields=id')) {
      return Response.json({ id: 'controlled-audience' });
    }
    if (init.method === 'GET' && url.includes('/members/')) {
      return new Response('{}', { status: 404 });
    }
    if (url.includes('/search-members?')) {
      return Response.json({
        exact_matches: {
          members: [{
            id: 'provider-member-id',
            list_id: 'controlled-audience',
            email_address: 'owner@example.com',
            status: 'subscribed',
          }],
        },
      });
    }
    writes.push({ url, method: init.method });
    return Response.json({ id: 'provider-member-id', status: 'subscribed' });
  };

  try {
    const member = await syncClaimToMailchimp({
      contact_id: 'contact-1',
      outbox_id: 'outbox-1',
      claim_token: 'claim-token-1',
      email: 'owner@example.com',
      consent_source: 'web_home',
      consented_at: '2026-07-13T12:00:00Z',
      attempt_count: 1,
      sync_action: 'upsert',
      welcome_enrolled: false,
    });
    assert.equal(member.status, 'subscribed');
    assert.deepEqual(writes.map((write) => write.method), ['PATCH', 'POST']);
    assert.ok(writes.every((write) => write.url.includes('provider-member-id')));
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
    if (url.endsWith('/lists/controlled-audience?fields=id')) {
      return Response.json({ id: 'controlled-audience' });
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
