import { HttpError, requiredEnv, rpc, safeJson } from './billing.ts';

export const LIFECYCLE_PRODUCT_ID = 'our-little-world';

export type MeasurementClaim = {
  outbox_id: string;
  lifecycle_event_id: string;
  event_id: string;
  claim_token: string;
  email: string;
  event_name: string;
  occurred_at: string;
  lifecycle_state: string;
  billing_state: string;
  campaign_id?: string | null;
  angle_id?: string | null;
  creative_id?: string | null;
  channel?: string | null;
  attempt_count: number;
};

export type LifecycleEventEnvelope = {
  product_id: typeof LIFECYCLE_PRODUCT_ID;
  event_id: string;
  event_name: string;
  occurred_at: string;
  contact_key: string;
  source: 'product_backend' | 'billing_webhook' | 'consent_ledger';
  campaign_id?: string;
  angle_id?: string;
  creative_id?: string;
  consent_state: 'subscribed';
  properties: {
    lifecycle_state: string;
    billing_state: string;
    channel?: string;
    schema_version: 1;
  };
  schema_version: 1;
};

export class LifecycleExportError extends Error {
  code: string;
  retryAfterSeconds: number;
  terminal: boolean;

  constructor(code: string, options: { retryAfterSeconds?: number; terminal?: boolean } = {}) {
    super(code);
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds || 300;
    this.terminal = options.terminal === true;
  }
}

export function normalizeLifecycleEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new LifecycleExportError('invalid_contact_identity', { terminal: true });
  }
  return email;
}

export async function hmacSha256Hex(secret: string, value: string) {
  if (secret.length < 32) {
    throw new LifecycleExportError('invalid_export_secret', { terminal: true });
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function productContactKey(email: string, secret: string) {
  const digest = await hmacSha256Hex(
    secret,
    `${LIFECYCLE_PRODUCT_ID}\0${normalizeLifecycleEmail(email)}`,
  );
  return `hmac_sha256:${digest}`;
}

export async function portfolioEventId(eventId: string, secret: string) {
  const digest = await hmacSha256Hex(
    secret,
    `event\0${LIFECYCLE_PRODUCT_ID}\0${String(eventId || '')}`,
  );
  return `olw_evt:${digest}`;
}

export function lifecycleSource(eventName: string): LifecycleEventEnvelope['source'] {
  if (eventName === 'marketing_subscribed') return 'consent_ledger';
  if ([
    'trial_started',
    'paid_started',
    'gift_purchased',
    'gift_redeemed',
    'entitlement_granted',
    'entitlement_lapsed',
  ].includes(eventName)) return 'billing_webhook';
  return 'product_backend';
}

function safeDimension(value: unknown) {
  const normalized = String(value || '').trim().slice(0, 120);
  if (!normalized || normalized.includes('@') || normalized.includes('://')) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(normalized)
    ? normalized
    : undefined;
}

export async function lifecycleEventFromClaim(
  claim: MeasurementClaim,
  contactKeySecret: string,
): Promise<LifecycleEventEnvelope> {
  const campaignId = safeDimension(claim.campaign_id);
  const angleId = safeDimension(claim.angle_id);
  const creativeId = safeDimension(claim.creative_id);
  const channel = safeDimension(claim.channel);
  return {
    product_id: LIFECYCLE_PRODUCT_ID,
    event_id: await portfolioEventId(claim.event_id, contactKeySecret),
    event_name: claim.event_name,
    occurred_at: claim.occurred_at,
    contact_key: await productContactKey(claim.email, contactKeySecret),
    source: lifecycleSource(claim.event_name),
    ...(campaignId ? { campaign_id: campaignId } : {}),
    ...(angleId ? { angle_id: angleId } : {}),
    ...(creativeId ? { creative_id: creativeId } : {}),
    consent_state: 'subscribed',
    properties: {
      lifecycle_state: String(claim.lifecycle_state || '').slice(0, 60),
      billing_state: String(claim.billing_state || 'none').slice(0, 40),
      ...(channel ? { channel } : {}),
      schema_version: 1,
    },
    schema_version: 1,
  };
}

export async function signedLifecycleRequest(
  events: LifecycleEventEnvelope[],
  ingestSecret: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
) {
  const body = JSON.stringify({ events });
  const signature = await hmacSha256Hex(ingestSecret, `${timestamp}\n${body}`);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-lifecycle-product': LIFECYCLE_PRODUCT_ID,
      'x-lifecycle-timestamp': timestamp,
      'x-lifecycle-signature': `v1=${signature}`,
    },
  };
}

export function lifecycleIngestUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LifecycleExportError('invalid_ingest_url', { terminal: true });
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.pathname.replace(/\/$/, '') !== '/v1/lifecycle/events') {
    throw new LifecycleExportError('invalid_ingest_url', { terminal: true });
  }
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new LifecycleExportError('insecure_ingest_url', { terminal: true });
  }
  return url.toString();
}

export async function exportLifecycleEvents({
  batchSize = 20,
  fetchImpl = fetch,
  rpcImpl = rpc,
  envImpl = requiredEnv,
}: {
  batchSize?: number;
  fetchImpl?: typeof fetch;
  rpcImpl?: typeof rpc;
  envImpl?: typeof requiredEnv;
} = {}) {
  const claimPayload = await rpcImpl('claim_marketing_measurement_events', {
    batch_size: Math.min(50, Math.max(1, Math.floor(batchSize))),
  });
  const claims = (Array.isArray(claimPayload) ? claimPayload : []) as MeasurementClaim[];
  if (!claims.length) return [];

  try {
    const contactKeySecret = envImpl('LIFECYCLE_CONTACT_KEY_SECRET');
    const ingestSecret = envImpl('LIFECYCLE_INGEST_OUR_LITTLE_WORLD_SECRET');
    const endpoint = lifecycleIngestUrl(envImpl('LIFECYCLE_INGEST_URL'));
    const events = await Promise.all(
      claims.map((claim) => lifecycleEventFromClaim(claim, contactKeySecret)),
    );
    const signed = await signedLifecycleRequest(events, ingestSecret);
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    const result = text ? safeJson(text) : null;
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const retryable = response.status === 429 || response.status >= 500;
      throw new LifecycleExportError(
        response.status === 429 ? 'ingest_rate_limited'
          : response.status >= 500 ? 'ingest_unavailable'
          : 'ingest_contract_rejected',
        {
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : 300,
          terminal: !retryable,
        },
      );
    }
    if (
      !result
      || Number(result.received) !== claims.length
      || Number(result.inserted || 0) + Number(result.duplicates || 0) !== claims.length
    ) {
      throw new LifecycleExportError('ingest_receipt_invalid');
    }

    for (const claim of claims) {
      await rpcImpl('complete_marketing_measurement_event', {
        target_outbox_id: claim.outbox_id,
        target_claim_token: claim.claim_token,
      });
    }
    return claims.map(() => ({ state: 'synced' as const }));
  } catch (error) {
    const failure = error instanceof LifecycleExportError
      ? error
      : error instanceof HttpError
      ? new LifecycleExportError('ingest_configuration_error')
      : new LifecycleExportError('ingest_unavailable');
    for (const claim of claims) {
      await rpcImpl('fail_marketing_measurement_event', {
        target_outbox_id: claim.outbox_id,
        target_claim_token: claim.claim_token,
        target_error_code: failure.code,
        target_retry_after_seconds: failure.retryAfterSeconds,
        target_terminal: failure.terminal,
      });
    }
    return claims.map(() => ({
      state: failure.terminal ? 'blocked' as const : 'retry' as const,
      errorCode: failure.code,
    }));
  }
}
