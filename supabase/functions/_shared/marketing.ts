import {
  env,
  HttpError,
  requiredEnv,
  rpc,
  safeJson,
} from './billing.ts';

export const MARKETING_CONSENT_VERSION = '2026-07-13';
export const MAILCHIMP_VISITOR_TAG = 'olw-interested-visitor-v1';

export type MarketingSyncClaim = {
  contact_id: string;
  outbox_id: string;
  claim_token: string;
  email: string;
  consent_source: string;
  consented_at: string;
  attribution?: Record<string, unknown> | null;
  audience_id?: string | null;
  attempt_count: number;
  sync_action: 'upsert' | 'reconfirm' | 'suppress' | 'reconcile';
  welcome_enrolled_at?: string | null;
  welcome_enrolled?: boolean | null;
};

export type MarketingSyncResult = {
  contactId: string;
  providerStatus: string;
  state: 'synced' | 'pending' | 'blocked' | 'retry';
};

export type MarketingLifecycleClaim = {
  outbox_id: string;
  event_id: string;
  claim_token: string;
  contact_id: string;
  email: string;
  event_name: string;
  occurred_at: string;
  lifecycle_state: string;
  attempt_count: number;
};

export type MarketingLifecycleSyncResult = {
  contactId: string;
  eventName: string;
  lifecycleState: string;
  state: 'synced' | 'blocked' | 'retry';
};

const LIFECYCLE_STATE_TAGS: Record<string, string> = Object.freeze({
  marketing_subscriber: 'olw-state-marketing-subscriber',
  unactivated_user: 'olw-state-unactivated',
  activated_user: 'olw-state-activated',
  trial_user: 'olw-state-trial',
  paid_customer: 'olw-state-paid',
  entitled_user: 'olw-state-entitled',
  lapsed_user: 'olw-state-lapsed',
});

const LIFECYCLE_EVENT_TAGS: Record<string, string> = Object.freeze({
  marketing_subscribed: 'olw-lifecycle-subscribed',
  registered: 'olw-lifecycle-registered',
  first_memory_saved: 'olw-activated-first-memory',
  caregiver_invited: 'olw-value-caregiver-invited',
  first_created: 'olw-value-first-created',
  letter_created: 'olw-value-letter-created',
  trial_started: 'olw-conversion-trial',
  paid_started: 'olw-converted-paid',
  gift_purchased: 'olw-gift-purchaser',
  gift_redeemed: 'olw-gift-redeemed',
  entitlement_granted: 'olw-entitlement-granted',
  entitlement_lapsed: 'olw-entitlement-lapsed',
});

export class ProviderError extends Error {
  code: string;
  retryAfterSeconds: number;
  terminal: boolean;

  constructor(
    code: string,
    options: { retryAfterSeconds?: number; terminal?: boolean } = {},
  ) {
    super(code);
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds || 0;
    this.terminal = options.terminal === true;
  }
}

export function normalizeMarketingEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

// Mailchimp identifies members with MD5(lowercase email). This small local
// implementation avoids pulling runtime code from a remote package.
export function mailchimpSubscriberHash(value: string) {
  const input = new TextEncoder().encode(value.trim().toLowerCase());
  const originalLength = input.length;
  const paddedLength = (((originalLength + 8) >>> 6) + 1) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(input);
  buffer[originalLength] = 0x80;
  const bitLength = BigInt(originalLength) * 8n;
  for (let index = 0; index < 8; index += 1) {
    buffer[paddedLength - 8 + index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0
  );

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] = (
        buffer[start]
        | (buffer[start + 1] << 8)
        | (buffer[start + 2] << 16)
        | (buffer[start + 3] << 24)
      ) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const sum = (a + f + constants[index] + words[g]) >>> 0;
      const rotated = ((sum << shifts[index]) | (sum >>> (32 - shifts[index]))) >>> 0;
      [a, b, c, d] = [d, (b + rotated) >>> 0, b, c];
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join(''))
    .join('');
}

export function safeConsentSource(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  return /^web_[a-z0-9_-]{1,60}$/.test(source) ? source : 'web_unknown';
}

export function sourceTag(consentSource: string) {
  const normalized = consentSource.replace(/^web_/, '').replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
  return `source-web-${normalized || 'unknown'}`;
}

export function retryDelaySeconds(attemptCount: number) {
  return Math.min(6 * 60 * 60, Math.max(60, 60 * (2 ** Math.max(0, attemptCount - 1))));
}

export function providerContactDisposition(status: string) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'subscribed') return 'subscribed';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'cleaned') return 'suppressed';
  if (['unsubscribed', 'transactional', 'archived'].includes(normalized)) return 'unsubscribed';
  return 'unknown';
}

export function providerStatusForMailchimpEvent(
  eventType: string,
  unsubscribeReason = '',
  unsubscribeAction = '',
) {
  const type = String(eventType || '').trim().toLowerCase();
  const reason = String(unsubscribeReason || '').trim().toLowerCase();
  const action = String(unsubscribeAction || '').trim().toLowerCase();
  const complaintSignals = new Set([
    'abuse',
    'abuse_report',
    'abuse-report',
    'complaint',
    'spam',
    'spam_complaint',
    'spam-complaint',
  ]);
  if (type === 'subscribe') return 'subscribed';
  if (type === 'unsubscribe') {
    return complaintSignals.has(reason) || complaintSignals.has(action)
      ? 'complained'
      : 'unsubscribed';
  }
  if (type === 'cleaned') return 'cleaned';
  if (type === 'upemail' || type === 'profile') return 'unchanged';
  return 'unknown';
}

export async function verifyMailchimpSignature(
  signatureHeader: string,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
) {
  const timestamp = signatureHeader.split(',').find((part) => part.trim().startsWith('t='))?.trim().slice(2) || '';
  const received = signatureHeader.split(',').find((part) => part.trim().startsWith('v1='))?.trim().slice(3) || '';
  if (!/^\d{10,}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(received)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return timingSafeEqualHex(received.toLowerCase(), expected);
}

export async function syncMarketingContacts(options: { contactId?: string; batchSize?: number } = {}) {
  if (env('OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED') !== 'true') return [];
  const batchSize = Math.min(50, Math.max(1, options.batchSize || 20));
  const claimsPayload = await rpc('claim_marketing_contact_sync', {
    batch_size: batchSize,
    target_contact_id: options.contactId || null,
  });
  const claims = Array.isArray(claimsPayload) ? claimsPayload as MarketingSyncClaim[] : [];
  const results: MarketingSyncResult[] = [];

  for (const claim of claims) {
    try {
      const member = await syncClaimToMailchimp(claim);
      const disposition = providerContactDisposition(member.status);
      const blocked = disposition === 'unsubscribed' || disposition === 'suppressed' || disposition === 'unknown';
      const completionPayload = await rpc('complete_marketing_contact_sync', {
        target_contact_id: claim.contact_id,
        target_provider_status: member.status,
        target_member_hash: member.id || mailchimpSubscriberHash(claim.email),
        target_welcome_enrolled: member.welcomeEnrolled,
        target_outbox_id: claim.outbox_id,
        target_claim_token: claim.claim_token,
      });
      const completion = marketingRpcResult(completionPayload);
      if (completion.completed !== true) {
        const state = unappliedClaimState(completion.outbox_state);
        console.error('marketing_sync_completion_not_applied', {
          contact_id: claim.contact_id,
          outbox_id: claim.outbox_id,
          outbox_state: completion.outbox_state || 'missing',
        });
        results.push({
          contactId: claim.contact_id,
          providerStatus: member.status,
          state,
        });
        continue;
      }
      results.push({
        contactId: claim.contact_id,
        providerStatus: member.status,
        state: disposition === 'pending' ? 'pending' : blocked ? 'blocked' : 'synced',
      });
    } catch (error) {
      const providerError = error instanceof ProviderError
        ? error
        : new ProviderError('provider_unavailable', {
          retryAfterSeconds: retryDelaySeconds(claim.attempt_count),
        });
      const terminal = providerError.terminal || claim.attempt_count >= 8;
      const failurePayload = await rpc('fail_marketing_contact_sync', {
        target_contact_id: claim.contact_id,
        target_error_code: providerError.code,
        target_retry_after_seconds: providerError.retryAfterSeconds || retryDelaySeconds(claim.attempt_count),
        target_terminal: terminal,
        target_outbox_id: claim.outbox_id,
        target_claim_token: claim.claim_token,
      });
      const failure = marketingRpcResult(failurePayload);
      const state = unappliedClaimState(failure.outbox_state);
      if (failure.failed !== true) {
        console.error('marketing_sync_failure_not_applied', {
          contact_id: claim.contact_id,
          outbox_id: claim.outbox_id,
          outbox_state: failure.outbox_state || 'missing',
        });
      }
      results.push({
        contactId: claim.contact_id,
        providerStatus: '',
        state,
      });
    }
  }

  return results;
}

export function lifecycleMailchimpActions(claim: MarketingLifecycleClaim) {
  const activeStateTag = LIFECYCLE_STATE_TAGS[claim.lifecycle_state];
  const eventTag = LIFECYCLE_EVENT_TAGS[claim.event_name];
  if (!activeStateTag || !eventTag) {
    throw new ProviderError('invalid_lifecycle_mapping', { terminal: true });
  }
  return {
    tags: [
      ...Object.values(LIFECYCLE_STATE_TAGS).map((name) => ({
        name,
        status: name === activeStateTag ? 'active' : 'inactive',
      })),
      { name: eventTag, status: 'active' },
    ],
    mergeFields: { LSTATE: claim.lifecycle_state.slice(0, 60) },
  };
}

export async function syncLifecycleClaimToMailchimp(claim: MarketingLifecycleClaim) {
  const audienceId = requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID');
  const memberHash = mailchimpSubscriberHash(claim.email);
  const member = await mailchimpRequest(
    `/lists/${encodeURIComponent(audienceId)}/members/${memberHash}`,
    { method: 'GET' },
    { allowNotFound: true },
  );
  if (!member || providerContactDisposition(member.status) !== 'subscribed') {
    throw new ProviderError('provider_contact_not_marketable', { terminal: true });
  }

  const actions = lifecycleMailchimpActions(claim);
  await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberHash}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tags: actions.tags }),
  });
  await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberHash}`, {
    method: 'PATCH',
    body: JSON.stringify({ merge_fields: actions.mergeFields }),
  });

  return { memberHash, eventTag: LIFECYCLE_EVENT_TAGS[claim.event_name] };
}

export async function syncMarketingLifecycleEvents(options: { batchSize?: number } = {}) {
  if (env('OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED') !== 'true') return [];
  const batchSize = Math.min(50, Math.max(1, options.batchSize || 20));
  const claimsPayload = await rpc('claim_marketing_lifecycle_events', { batch_size: batchSize });
  const claims = Array.isArray(claimsPayload) ? claimsPayload as MarketingLifecycleClaim[] : [];
  const results: MarketingLifecycleSyncResult[] = [];

  for (const claim of claims) {
    try {
      await syncLifecycleClaimToMailchimp(claim);
      const completionPayload = await rpc('complete_marketing_lifecycle_event', {
        target_outbox_id: claim.outbox_id,
        target_claim_token: claim.claim_token,
      });
      const completion = marketingRpcResult(completionPayload);
      if (completion.completed !== true) {
        console.error('marketing_lifecycle_completion_not_applied', {
          contact_id: claim.contact_id,
          outbox_id: claim.outbox_id,
        });
        results.push({
          contactId: claim.contact_id,
          eventName: claim.event_name,
          lifecycleState: claim.lifecycle_state,
          state: 'retry',
        });
        continue;
      }
      results.push({
        contactId: claim.contact_id,
        eventName: claim.event_name,
        lifecycleState: claim.lifecycle_state,
        state: 'synced',
      });
    } catch (error) {
      const providerError = error instanceof ProviderError
        ? error
        : new ProviderError('provider_unavailable', {
          retryAfterSeconds: retryDelaySeconds(claim.attempt_count),
        });
      const terminal = providerError.terminal || claim.attempt_count >= 8;
      const failurePayload = await rpc('fail_marketing_lifecycle_event', {
        target_outbox_id: claim.outbox_id,
        target_claim_token: claim.claim_token,
        target_error_code: providerError.code,
        target_retry_after_seconds: providerError.retryAfterSeconds || retryDelaySeconds(claim.attempt_count),
        target_terminal: terminal,
      });
      const failure = marketingRpcResult(failurePayload);
      if (failure.failed !== true) {
        console.error('marketing_lifecycle_failure_not_applied', {
          contact_id: claim.contact_id,
          outbox_id: claim.outbox_id,
        });
      }
      results.push({
        contactId: claim.contact_id,
        eventName: claim.event_name,
        lifecycleState: claim.lifecycle_state,
        state: terminal ? 'blocked' : 'retry',
      });
    }
  }

  return results;
}

function marketingRpcResult(payload: unknown) {
  const value = Array.isArray(payload) ? payload[0] : payload;
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

function unappliedClaimState(outboxState: unknown): 'blocked' | 'retry' {
  return ['terminal', 'canceled'].includes(String(outboxState || '').toLowerCase())
    ? 'blocked'
    : 'retry';
}

export async function syncClaimToMailchimp(claim: MarketingSyncClaim) {
  const audienceId = requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID');
  if (claim.audience_id && claim.audience_id !== audienceId) {
    throw new ProviderError('provider_audience_mismatch', { terminal: true });
  }
  // A member 404 is meaningful only after proving that the configured API
  // credential can see the configured audience. This prevents an account/key
  // mismatch from being misdiagnosed as a missing subscriber.
  await mailchimpRequest(
    `/lists/${encodeURIComponent(audienceId)}?fields=id`,
    { method: 'GET' },
    { notFoundErrorCode: 'provider_audience_not_found' },
  );
  const memberHash = mailchimpSubscriberHash(claim.email);
  const existing = await mailchimpRequest(
    `/lists/${encodeURIComponent(audienceId)}/members/${memberHash}`,
    { method: 'GET' },
    { allowNotFound: true },
  );

  let member = existing || await findMailchimpMember(audienceId, claim.email);
  let memberId = String(member?.id || memberHash);

  // A public re-submission may record fresh consent evidence, but it must not
  // directly flip a prior opt-out back to subscribed. Mailchimp's `pending`
  // state requires the address owner to confirm again; the signed subscribe
  // webhook is the only path that reactivates the canonical contact.
  if (claim.sync_action === 'reconfirm') {
    if (!member) {
      member = await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({
          email_address: claim.email,
          status_if_new: 'pending',
          merge_fields: safeMarketingMergeFields(claim),
        }),
      });
    } else if (providerContactDisposition(member.status) === 'unsubscribed') {
      member = await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'pending',
          merge_fields: safeMarketingMergeFields(claim),
        }),
      });
    }

    return {
      id: String(member?.id || memberId),
      status: String(member?.status || 'unknown').toLowerCase(),
      welcomeEnrolled: Boolean(claim.welcome_enrolled_at || claim.welcome_enrolled),
    };
  }

  // A suppression job may only move a provider member away from marketable
  // states. It never creates a subscribed member when Mailchimp has no record.
  if (claim.sync_action === 'suppress') {
    if (!member) {
      return { id: memberHash, status: 'unsubscribed', welcomeEnrolled: false };
    }
    if (['subscribed', 'pending'].includes(String(member.status || '').toLowerCase())) {
      member = await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'unsubscribed' }),
      });
    }
    return {
      id: String(member?.id || memberId),
      status: String(member?.status || 'unknown').toLowerCase(),
      welcomeEnrolled: false,
    };
  }

  // Reconciliation reads provider state only. Provider webhooks own identity
  // and suppression changes; this worker must not manufacture them.
  if (claim.sync_action === 'reconcile') {
    if (!member) throw new ProviderError('provider_contact_missing', { terminal: true });
    return {
      id: String(member?.id || memberId),
      status: String(member?.status || 'unknown').toLowerCase(),
      welcomeEnrolled: Boolean(claim.welcome_enrolled_at || claim.welcome_enrolled),
    };
  }

  if (!member) {
    member = await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberHash}`, {
      method: 'PUT',
      body: JSON.stringify({
        email_address: claim.email,
        status_if_new: 'subscribed',
        merge_fields: safeMarketingMergeFields(claim),
      }),
    });
  } else if (providerContactDisposition(member.status) === 'subscribed') {
    member = await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ merge_fields: safeMarketingMergeFields(claim) }),
    });
  }

  const subscribed = providerContactDisposition(member?.status) === 'subscribed';
  memberId = String(member?.id || memberId);
  const welcomeEnrolled = Boolean(claim.welcome_enrolled_at || claim.welcome_enrolled);
  if (subscribed) {
    const tags = [
      { name: 'consent-explicit', status: 'active' },
      { name: sourceTag(claim.consent_source), status: 'active' },
    ];
    if (!welcomeEnrolled) tags.push({ name: MAILCHIMP_VISITOR_TAG, status: 'active' });
    await mailchimpRequest(`/lists/${encodeURIComponent(audienceId)}/members/${memberId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    });
  }

  return {
    id: String(member?.id || memberId),
    status: String(member?.status || 'unknown').toLowerCase(),
    // Audience subscription is transport state, not enrollment in a lifecycle
    // sequence. Website visitors keep the dedicated visitor tag and remain
    // unenrolled until a separate, explicitly eligible flow records enrollment.
    welcomeEnrolled,
  };
}

async function findMailchimpMember(audienceId: string, email: string) {
  const payload = await mailchimpRequest(
    `/search-members?query=${encodeURIComponent(email)}&list_id=${encodeURIComponent(audienceId)}`,
    { method: 'GET' },
  );
  const candidates = [
    ...(Array.isArray(payload?.exact_matches?.members) ? payload.exact_matches.members : []),
    ...(Array.isArray(payload?.full_search?.members) ? payload.full_search.members : []),
  ];
  const normalizedEmail = normalizeMarketingEmail(email);
  return candidates.find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as Record<string, unknown>;
    const candidateListId = String(value.list_id || audienceId);
    try {
      return candidateListId === audienceId
        && normalizeMarketingEmail(String(value.email_address || '')) === normalizedEmail;
    } catch {
      return false;
    }
  }) || null;
}

export function safeMarketingMergeFields(claim: MarketingSyncClaim) {
  const date = mailchimpDate(claim.consented_at);
  const fields: Record<string, string> = {
    CSOURCE: claim.consent_source.slice(0, 60),
    CONSENTAT: date,
  };
  const attribution = claim.attribution || {};
  for (const [mergeTag, key] of [
    ['CAMPAIGN', 'campaign'],
    ['ANGLE', 'angle'],
    ['CREATIVE', 'creative'],
    ['CHANNEL', 'channel'],
  ] as const) {
    const value = safeProviderAttribution(attribution[`last_${key}`] || attribution[key]);
    if (value) fields[mergeTag] = value;
  }
  return fields;
}

// Mailchimp's Date merge field accepts the audience-configured US display
// format, not an ISO date. Keep the conversion explicit so a valid consent
// timestamp cannot quarantine an otherwise eligible subscriber.
export function mailchimpDate(value: string, fallback = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[2]}/${match[3]}/${match[1]}`;

  const iso = fallback.toISOString();
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
}

function safeProviderAttribution(value: unknown) {
  const normalized = String(value || '').trim().slice(0, 120);
  if (!normalized || normalized.includes('@') || normalized.includes('://')) return '';
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(normalized) ? normalized : '';
}

async function mailchimpRequest(
  path: string,
  init: RequestInit,
  options: { allowNotFound?: boolean; notFoundErrorCode?: string } = {},
) {
  const apiKey = requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_API_KEY');
  const serverPrefix = requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_SERVER_PREFIX');
  const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0${path}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(8_000),
    headers: {
      authorization: `Basic ${btoa(`olw:${apiKey}`)}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? safeJson(text) : {};
  if (response.status === 404 && options.allowNotFound) return null;
  if (response.status === 404 && options.notFoundErrorCode) {
    throw new ProviderError(options.notFoundErrorCode, { terminal: true });
  }
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    if (response.status === 429) {
      throw new ProviderError('provider_rate_limited', {
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 300,
      });
    }
    if (response.status >= 500) {
      throw new ProviderError('provider_unavailable', { retryAfterSeconds: 300 });
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('provider_configuration_error', { terminal: true });
    }
    const code = mailchimpProviderErrorCode(payload);
    console.error('mailchimp_provider_terminal_rejection', {
      status: response.status,
      code,
      diagnostic: safeMailchimpDiagnostic(payload),
    });
    if (code === 'provider_contact_signup_rate_limited') {
      throw new ProviderError(code, { retryAfterSeconds: 86_400 });
    }
    throw new ProviderError(code, { terminal: true });
  }
  return payload || {};
}

export function mailchimpProviderErrorCode(payload: unknown) {
  const body = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const title = String(body.title || '').toLowerCase();
  const detail = String(body.detail || '').toLowerCase();
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const fields = errors.map((entry) => {
    if (!entry || typeof entry !== 'object') return '';
    return String((entry as Record<string, unknown>).field || '').toLowerCase();
  }).join(' ');
  const messages = errors.map((entry) => {
    if (!entry || typeof entry !== 'object') return '';
    return String((entry as Record<string, unknown>).message || '').toLowerCase();
  }).join(' ');
  const diagnostic = `${title} ${detail} ${fields} ${messages}`;

  if (diagnostic.includes('consentat')) return 'provider_merge_field_consent_date';
  if (diagnostic.includes('merge')) return 'provider_merge_field_error';
  if (diagnostic.includes('compliance')) return 'provider_contact_compliance_state';
  if (diagnostic.includes('forgotten') || diagnostic.includes('permanently deleted')) {
    return 'provider_contact_forgotten';
  }
  if (diagnostic.includes('already a list member')) return 'provider_contact_conflict';
  if (diagnostic.includes('signed up to a lot of lists')) {
    return 'provider_contact_signup_rate_limited';
  }
  if (diagnostic.includes('required') || diagnostic.includes('please enter a value')) {
    if (fields.includes('fname')) return 'provider_required_first_name';
    if (fields.includes('lname')) return 'provider_required_last_name';
    return 'provider_required_merge_field';
  }
  if (diagnostic.includes('fake') || diagnostic.includes('invalid email')) {
    return 'provider_contact_invalid';
  }
  return 'provider_contact_rejected';
}

export function safeMailchimpDiagnostic(payload: unknown) {
  const body = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const redact = (value: unknown) => String(value || '')
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/\b[a-f0-9]{24,}\b/gi, '[token]')
    .slice(0, 300);
  const errors = Array.isArray(body.errors) ? body.errors : [];

  return {
    title: redact(body.title),
    detail: redact(body.detail),
    fields: errors.slice(0, 5).map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      return redact((entry as Record<string, unknown>).field);
    }),
    messages: errors.slice(0, 5).map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      return redact((entry as Record<string, unknown>).message);
    }),
  };
}

function timingSafeEqualHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
