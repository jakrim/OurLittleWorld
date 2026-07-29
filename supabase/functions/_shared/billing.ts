export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-olw-admin-secret, x-olw-worker-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  });
}

export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = status >= 500
    ? 'The service is temporarily unavailable.'
    : error instanceof Error ? error.message : 'Unexpected error.';
  return json({ error: message }, status);
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON request body.');
  }
}

export function env(name: string, fallback = '') {
  return Deno.env.get(name) || fallback;
}

export function requiredEnv(name: string) {
  const value = env(name);
  if (!value) throw new HttpError(500, `${name} is not configured.`);
  return value;
}

export function bearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export async function requireUser(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Sign in is required.');

  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new HttpError(401, 'Sign in is required.');
  const payload = await response.json();
  if (!payload?.id) throw new HttpError(401, 'Sign in is required.');
  return { token, user: payload as { id: string; email?: string } };
}

export async function supabaseRequest(path: string, init: RequestInit = {}, authToken?: string) {
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(init.headers);
  headers.set('apikey', serviceRoleKey);
  headers.set('authorization', `Bearer ${authToken || serviceRoleKey}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(`${supabaseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.error || text || 'Supabase request failed.';
    throw new HttpError(response.status, message);
  }
  return payload;
}

export function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function rpc(name: string, body: Record<string, unknown>, authToken?: string) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(body),
  }, authToken);
}

export async function restSelect(table: string, query: string) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
}

export async function restInsert(
  table: string,
  rows: Record<string, unknown> | Array<Record<string, unknown>>,
  options: { onConflict?: string; merge?: boolean } = {},
) {
  const query = options.onConflict ? `?on_conflict=${options.onConflict}` : '';
  const prefer = options.merge
    ? 'resolution=merge-duplicates,return=representation'
    : 'return=representation';
  return supabaseRequest(`/rest/v1/${table}${query}`, {
    method: 'POST',
    headers: { prefer },
    body: JSON.stringify(rows),
  });
}

export async function restPatch(table: string, query: string, body: Record<string, unknown>) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}

export async function recordBillingEvent({
  provider,
  eventId,
  eventType,
  familyId,
  userId,
  payload,
}: {
  provider: string;
  eventId: string;
  eventType: string;
  familyId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
}) {
  return restInsert('billing_events', {
    provider,
    event_id: eventId,
    event_type: eventType,
    family_id: familyId || null,
    user_id: userId || null,
    processed_at: null,
    payload: payload || {},
  }, { onConflict: 'provider,event_id', merge: true });
}

export async function assertFamilyWriter(familyId: string, userId: string) {
  const rows = await restSelect(
    'family_members',
    `family_id=eq.${encodeURIComponent(familyId)}&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
  );
  const role = Array.isArray(rows) ? rows[0]?.role : null;
  if (!['creator', 'partner'].includes(role)) {
    throw new HttpError(403, 'Only a co-parent can manage billing for this family.');
  }
}

export const SUBSCRIPTION_PLANS: Record<string, { planKey: string; priceEnv: string; label: string }> = {
  family_monthly: { planKey: 'family_monthly', priceEnv: 'STRIPE_PRICE_FAMILY_MONTHLY', label: 'Family monthly' },
  family_yearly: { planKey: 'family_yearly', priceEnv: 'STRIPE_PRICE_FAMILY_YEARLY', label: 'Family yearly' },
  vault_monthly: { planKey: 'vault_monthly', priceEnv: 'STRIPE_PRICE_VAULT_MONTHLY', label: 'Vault monthly' },
  vault_yearly: { planKey: 'vault_yearly', priceEnv: 'STRIPE_PRICE_VAULT_YEARLY', label: 'Vault yearly' },
};

export function planFromInput(plan: string | undefined) {
  const normalized = String(plan || '').trim().toLowerCase();
  if (['monthly', 'family_monthly', 'month'].includes(normalized)) return SUBSCRIPTION_PLANS.family_monthly;
  if (['annual', 'yearly', 'family_yearly', 'year'].includes(normalized)) return SUBSCRIPTION_PLANS.family_yearly;
  if (normalized === 'vault_monthly') return SUBSCRIPTION_PLANS.vault_monthly;
  if (['vault_yearly', 'vault_annual'].includes(normalized)) return SUBSCRIPTION_PLANS.vault_yearly;
  throw new HttpError(400, 'Choose a valid subscription plan.');
}

export function giftPlanFromInput(plan: string | undefined) {
  const normalized = String(plan || '').trim().toLowerCase();
  if (['gift_vault_year', 'vault'].includes(normalized)) {
    return { planKey: 'gift_vault_year', priceEnv: 'STRIPE_PRICE_GIFT_VAULT_YEAR', kind: 'gift_vault_year', label: 'Vault gift year' };
  }
  if (['gift_year', 'family', 'family_year'].includes(normalized)) {
    return { planKey: 'gift_year', priceEnv: 'STRIPE_PRICE_GIFT_YEAR', kind: 'gift_year', label: 'Family gift year' };
  }
  throw new HttpError(400, 'Choose a valid gift plan.');
}

export function normalizePlanKey(value: unknown, fallback = 'family_yearly') {
  const normalized = String(value || '').trim().toLowerCase();
  return SUBSCRIPTION_PLANS[normalized] ? normalized : fallback;
}

// Mirrors public.plan_storage_limits in the database; used to decorate
// entitlement responses without an extra round trip.
export function limitsForPlan(planKey: string | null | undefined) {
  const vault = ['vault_monthly', 'vault_yearly', 'gift_vault_year'].includes(String(planKey || ''));
  return {
    storage_tier: vault ? 'vault' : planKey === 'partner_year' ? 'partner' : planKey === 'comp_year' ? 'comp' : 'family',
    media_quota_bytes: vault ? 100000000000 : 20000000000,
    optimized_media_quota_bytes: vault ? 100000000000 : 20000000000,
    original_quota_bytes: vault ? 100000000000 : 0,
    video_quota_seconds: vault ? 60000 : 18000,
    video_quota_bytes: vault ? 50000000000 : 10000000000,
    originals_enabled: vault,
    max_video_duration_sec: vault ? 600 : 120,
    max_video_source_bytes: vault ? 2000000000 : 500000000,
  };
}

export function normalizeCode(code: string) {
  return code.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function hashCode(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new HttpError(400, 'Code is required.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function codeHint(code: string) {
  const normalized = normalizeCode(code);
  return normalized.slice(-4);
}

export function generateCode(prefix = 'OLW') {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const random = new Uint8Array(12);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${prefix}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export async function checkoutCode(prefix: 'OLW' | 'GIFT', kind: 'self' | 'gift', attemptId: string) {
  const normalizedAttempt = checkoutAttemptId(attemptId);
  const secret = requiredEnv('OLW_CODE_ENCRYPTION_KEY');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`checkout-code:${kind}:${normalizedAttempt}`),
  ));
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const chars = Array.from(digest.slice(0, 12), (byte) => alphabet[byte % alphabet.length]).join('');
  return `${prefix}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function originFromRequest(req: Request) {
  const fallback = normalizedOrigin(env('OLW_WEB_ORIGIN', 'https://ourlittleworld.me'))
    || 'https://ourlittleworld.me';
  const allowlist = env('OLW_ALLOWED_ORIGINS', fallback)
    .split(',')
    .map(normalizedOrigin)
    .filter(Boolean);
  const requested = normalizedOrigin(req.headers.get('origin') || '');
  return requested && allowlist.includes(requested) ? requested : fallback;
}

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function supportEmail() {
  return env('OLW_SUPPORT_EMAIL', 'support@ourlittleworld.me');
}

const CHECKOUT_ATTRIBUTION_KEYS = [
  'first_utm_source',
  'first_utm_medium',
  'first_utm_campaign',
  'first_utm_term',
  'first_utm_content',
  'last_utm_source',
  'last_utm_medium',
  'last_utm_campaign',
  'last_utm_term',
  'last_utm_content',
  'landing_path',
  'landing_angle',
] as const;

/**
 * Keep paid-acquisition context useful without accepting arbitrary metadata or
 * form contents. Attribution is persisted only after the visitor has granted
 * the website's analytics preference.
 */
export function checkoutAttributionFromInput(input: Record<string, unknown>) {
  if (input.attribution_consent !== 'granted') return {};

  const attribution: Record<string, string> = { attribution_consent: 'granted' };
  for (const key of CHECKOUT_ATTRIBUTION_KEYS) {
    const value = boundedMetadataValue(input[key], key === 'landing_path' ? 240 : 160);
    if (value) attribution[key] = value;
  }
  return attribution;
}

export function setStripeMetadata(
  params: URLSearchParams,
  metadata: Record<string, string>,
  prefix = 'metadata',
) {
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`${prefix}[${key}]`, value);
  }
}

function boundedMetadataValue(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

export async function stripeFormRequest(path: string, params: URLSearchParams, method = 'POST') {
  const secretKey = requiredEnv('STRIPE_SECRET_KEY');
  const headers = new Headers({
    authorization: `Basic ${btoa(`${secretKey}:`)}`,
    'content-type': 'application/x-www-form-urlencoded',
  });
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : params,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status, payload?.error?.message || 'Stripe request failed.');
  }
  assertStripeMode(payload);
  return payload;
}

export async function stripeGet(path: string) {
  const secretKey = requiredEnv('STRIPE_SECRET_KEY');
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      authorization: `Basic ${btoa(`${secretKey}:`)}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status, payload?.error?.message || 'Stripe request failed.');
  }
  assertStripeMode(payload);
  return payload;
}

export async function verifyStripeWebhook(req: Request, nowSeconds = Math.floor(Date.now() / 1000)) {
  const webhookSecret = requiredEnv('STRIPE_WEBHOOK_SECRET');
  const signature = req.headers.get('stripe-signature') || '';
  const payload = await req.text();
  const timestamp = signature.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signatures = signature.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) throw new HttpError(400, 'Missing Stripe signature.');
  const signedAt = Number(timestamp);
  if (!Number.isFinite(signedAt) || Math.abs(nowSeconds - signedAt) > 300) {
    throw new HttpError(400, 'Expired Stripe signature.');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!signatures.some((value) => timingSafeEqual(value, expected))) {
    throw new HttpError(400, 'Invalid Stripe signature.');
  }

  const event = JSON.parse(payload);
  assertStripeMode(event);
  return event;
}

export function assertStripeMode(payload: Record<string, any>) {
  if (typeof payload?.livemode !== 'boolean') return;
  const mode = requiredEnv('STRIPE_MODE').trim().toLowerCase();
  if (!['test', 'live'].includes(mode)) throw new HttpError(500, 'Stripe mode is invalid.');
  if (payload.livemode !== (mode === 'live')) {
    throw new HttpError(409, 'Stripe environment does not match this deployment.');
  }
}

export function checkoutIdempotencyKey(kind: 'self' | 'gift', value: unknown) {
  return `olw:${kind}:${checkoutAttemptId(value)}`;
}

export function checkoutAttemptId(value: unknown) {
  const attemptId = String(value || '').trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attemptId)) {
    return attemptId;
  }
  return crypto.randomUUID();
}

export async function encryptCode(code: string, nonceContext = '') {
  const displayCode = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,64}$/.test(displayCode)) throw new HttpError(400, 'Purchase code is invalid.');
  const key = await codeEncryptionKey(['encrypt']);
  const iv = nonceContext
    ? (await deterministicCodeIv(nonceContext)).slice(0, 12)
    : crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(displayCode),
  );
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptCode(value: string) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new HttpError(400, 'Purchase code is unavailable.');
  const key = await codeEncryptionKey(['decrypt']);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(parts[1]) },
      key,
      fromBase64Url(parts[2]),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new HttpError(400, 'Purchase code is unavailable.');
  }
}

async function codeEncryptionKey(usages: KeyUsage[]) {
  const secret = requiredEnv('OLW_CODE_ENCRYPTION_KEY');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages);
}

async function deterministicCodeIv(context: string) {
  const secret = requiredEnv('OLW_CODE_ENCRYPTION_KEY');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`checkout-code-iv:${context}`),
  ));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function stripeEventSummary(event: Record<string, any>) {
  const object = event?.data?.object || {};
  return compactRecord({
    event_id: stringOrNull(event.id),
    event_type: stringOrNull(event.type),
    livemode: typeof event.livemode === 'boolean' ? event.livemode : null,
    created: typeof event.created === 'number' ? event.created : null,
    object_id: stringOrNull(object.id),
    object_type: stringOrNull(object.object),
    object_status: stringOrNull(object.status),
    payment_status: stringOrNull(object.payment_status),
  });
}

export function stripeReceiptSummary(object: Record<string, any> | null) {
  return compactRecord({
    id: stringOrNull(object?.id),
    object: stringOrNull(object?.object),
    livemode: typeof object?.livemode === 'boolean' ? object.livemode : null,
    status: stringOrNull(object?.status),
    payment_status: stringOrNull(object?.payment_status),
    customer_id: providerObjectId(object?.customer),
    subscription_id: providerObjectId(object?.subscription),
    payment_intent_id: providerObjectId(object?.payment_intent),
    current_period_start: periodNumber(object, 'current_period_start'),
    current_period_end: periodNumber(object, 'current_period_end'),
    cancel_at_period_end: typeof object?.cancel_at_period_end === 'boolean' ? object.cancel_at_period_end : null,
  });
}

function providerObjectId(value: unknown) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && 'id' in value
    ? String((value as { id: unknown }).id)
    : null;
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}

function periodNumber(object: Record<string, any> | null, field: string) {
  const value = object?.[field] ?? object?.items?.data?.[0]?.[field];
  return typeof value === 'number' ? value : null;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function unixToIso(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

export function msToIso(ms?: number | string | null) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}
