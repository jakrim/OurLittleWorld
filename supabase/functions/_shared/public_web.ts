import { env, HttpError, requiredEnv } from './billing.ts';
import { hmacSha256Hex } from './marketing.ts';

const DEFAULT_ORIGINS = [
  'https://ourlittleworld.me',
  'https://www.ourlittleworld.me',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function assertAllowedWebsiteOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return;
  if (!allowedOrigins().includes(normalizeOrigin(origin))) {
    throw new HttpError(403, 'Origin is not allowed.');
  }
}

export function websiteCorsHeaders(req: Request) {
  const origin = normalizeOrigin(req.headers.get('origin') || '');
  const allowed = allowedOrigins();
  const responseOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

export function websiteJson(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...websiteCorsHeaders(req),
      'content-type': 'application/json',
    },
  });
}

export function websiteErrorResponse(req: Request, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = status >= 500
    ? 'The service is temporarily unavailable.'
    : error instanceof Error ? error.message : 'Unexpected error.';
  return websiteJson(req, { error: message }, status);
}

export async function readBoundedJson(req: Request, maxBytes = 16_384) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Use application/json.');
  }
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'Request is too large.');
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new HttpError(413, 'Request is too large.');
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON request body.');
  }
}

export async function websiteRequestHash(req: Request, scope = 'launch-signup') {
  const forwarded = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = req.headers.get('cf-connecting-ip') || forwarded || req.headers.get('x-real-ip') || 'unknown';
  const secret = requiredEnv('OUR_LITTLE_WORLD_SIGNUP_RATE_LIMIT_SECRET');
  return hmacSha256Hex(secret, `${scope}:${ip}`);
}

function allowedOrigins() {
  const configured = env('OUR_LITTLE_WORLD_WEB_ORIGINS')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ORIGINS;
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return '';
    return url.origin;
  } catch {
    return '';
  }
}
