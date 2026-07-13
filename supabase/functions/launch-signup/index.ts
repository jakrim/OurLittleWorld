import {
  acquisitionMetadataFromBody,
  env,
  HttpError,
  requiredEnv,
  rpc,
} from '../_shared/billing.ts';
import {
  MARKETING_CONSENT_VERSION,
  normalizeMarketingEmail,
  safeConsentSource,
  sha256Text,
} from '../_shared/marketing.ts';
import {
  assertAllowedWebsiteOrigin,
  readBoundedJson,
  websiteCorsHeaders,
  websiteErrorResponse,
  websiteJson,
  websiteRequestHash,
} from '../_shared/public_web.ts';

Deno.serve(async (req) => {
  try {
    assertAllowedWebsiteOrigin(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: websiteCorsHeaders(req) });
    if (req.method === 'GET') {
      if (env('OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED') !== 'true') {
        throw new HttpError(503, 'Marketing synchronization is disabled.');
      }
      requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_API_KEY');
      requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_SERVER_PREFIX');
      requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID');
      await rpc('marketing_sync_health', {});
      return websiteJson(req, { status: 'ok' });
    }
    if (req.method !== 'POST') return websiteJson(req, { error: 'Method not allowed.' }, 405);

    const rateLimitPayload = await rpc('consume_marketing_signup_rate_limit', {
      target_request_hash: await websiteRequestHash(req),
      target_limit: 8,
      target_window_seconds: 900,
    });
    const rateLimitState = Array.isArray(rateLimitPayload)
      ? rateLimitPayload[0]
      : rateLimitPayload;
    const rateLimitAllowed = rateLimitState?.allowed === true;
    if (!rateLimitAllowed) throw new HttpError(429, 'Please wait before trying again.');

    const body = await readBoundedJson(req);
    // Honeypot submissions receive a success-shaped response without storing data.
    if (String(body.website || '').trim()) {
      return websiteJson(req, { accepted: true, delivery: 'saved' });
    }

    const email = normalizeMarketingEmail(body.email);
    if (body.marketing_consent !== true) {
      throw new HttpError(400, 'Marketing consent is required for launch emails.');
    }

    const eventKey = `web-signup:${crypto.randomUUID()}`;
    await rpc('record_marketing_signup', {
      target_email: email,
      target_email_hash: await sha256Text(email),
      target_consent_source: safeConsentSource(body.source),
      target_attribution: acquisitionMetadataFromBody(body),
      target_event_key: eventKey,
      target_consent_version: MARKETING_CONSENT_VERSION,
    });
    // The response deliberately does not enumerate whether an address had an
    // earlier unsubscribe/suppression. The canonical ledger preserves it and
    // the authenticated background worker owns all provider traffic.
    return websiteJson(req, { accepted: true, delivery: 'saved' });
  } catch (error) {
    return websiteErrorResponse(req, error);
  }
});
