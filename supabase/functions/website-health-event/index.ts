import { HttpError, requiredEnv, rpc } from '../_shared/billing.ts';
import { hmacSha256Hex } from '../_shared/marketing.ts';
import {
  assertAllowedWebsiteOrigin,
  readBoundedJson,
  websiteCorsHeaders,
  websiteErrorResponse,
  websiteJson,
  websiteRequestHash,
} from '../_shared/public_web.ts';

const EVENT_TYPES = new Set([
  'client_error',
  'unhandled_rejection',
  'resource_error',
  'form_submit',
  'form_success',
  'form_error',
]);

Deno.serve(async (req) => {
  try {
    assertAllowedWebsiteOrigin(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: websiteCorsHeaders(req) });
    if (req.method !== 'POST') return websiteJson(req, { error: 'Method not allowed.' }, 405);

    const rateHash = await websiteRequestHash(req, 'website-health-event');
    const ratePayload = await rpc('consume_marketing_signup_rate_limit', {
      target_request_hash: rateHash,
      target_limit: 30,
      target_window_seconds: 900,
    });
    const rateState = Array.isArray(ratePayload) ? ratePayload[0] : ratePayload;
    const allowed = rateState?.allowed === true;
    if (!allowed) throw new HttpError(429, 'Please wait before trying again.');

    const body = await readBoundedJson(req, 4096);
    const eventType = cleanToken(body.event_type, 40);
    if (!EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Unsupported event type.');
    const path = cleanPath(body.path);
    const sourcePath = cleanPath(body.source_path, true);
    const errorName = cleanToken(body.error_name, 80) || 'UnknownError';
    const release = cleanToken(body.release, 80);
    const lineBucket = Math.min(100_000, Math.max(0, Number(body.line_bucket || 0) || 0));
    const fingerprint = await hmacSha256Hex(
      requiredEnv('OUR_LITTLE_WORLD_OPERATIONAL_FINGERPRINT_SECRET'),
      `${eventType}:${path}:${sourcePath}:${errorName}:${lineBucket}`,
    );

    await rpc('record_website_operational_event', {
      target_event_type: eventType,
      target_path: path,
      target_source_path: sourcePath,
      target_error_name: errorName,
      target_line_bucket: lineBucket,
      target_fingerprint: fingerprint,
      target_release: release,
    });
    return websiteJson(req, { accepted: true });
  } catch (error) {
    return websiteErrorResponse(req, error);
  }
});

function cleanToken(value: unknown, maxLength: number) {
  const normalized = String(value || '').trim().slice(0, maxLength);
  return /^[A-Za-z0-9_.:-]*$/.test(normalized) ? normalized : '';
}

function cleanPath(value: unknown, allowEmpty = false) {
  const normalized = String(value || '').trim().slice(0, 240);
  if (!normalized && allowEmpty) return '';
  return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(normalized) ? normalized : '/';
}
