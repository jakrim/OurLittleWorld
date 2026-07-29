import { HttpError, requiredEnv, rpc } from '../_shared/billing.ts';
import {
  normalizeMarketingEmail,
  providerStatusForMailchimpEvent,
  sha256Text,
  verifyMailchimpSignature,
} from '../_shared/marketing.ts';

const MAX_WEBHOOK_BYTES = 65_536;

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response('ok', { status: 200, headers: { 'cache-control': 'no-store' } });
  }
  if (req.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  try {
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
      throw new HttpError(413, 'Webhook is too large.');
    }
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
      throw new HttpError(413, 'Webhook is too large.');
    }
    const signature = req.headers.get('x-mailchimp-signature') || '';
    const verified = await verifyMailchimpSignature(
      signature,
      rawBody,
      requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_WEBHOOK_SIGNING_SECRET'),
    );
    if (!verified) throw new HttpError(401, 'Invalid webhook signature.');

    const fields = new URLSearchParams(rawBody);
    const audienceId = fields.get('data[list_id]') || '';
    if (audienceId !== requiredEnv('OUR_LITTLE_WORLD_MAILCHIMP_AUDIENCE_ID')) {
      throw new HttpError(400, 'Unexpected audience.');
    }

    const eventType = String(fields.get('type') || '').trim().toLowerCase();
    const eventKey = `mailchimp:${await sha256Text(rawBody)}`;
    const firedAt = safeOccurredAt(fields.get('fired_at'));
    const rawEmail = eventType === 'upemail'
      ? fields.get('data[new_email]') || fields.get('data[email]') || fields.get('data[merges][EMAIL]') || ''
      : fields.get('data[email]') || fields.get('data[new_email]') || fields.get('data[merges][EMAIL]') || '';
    const rawOldEmail = fields.get('data[old_email]') || '';

    // Campaign notifications have no contact to reconcile and are intentionally
    // excluded from this consent/suppression endpoint.
    if (!rawEmail || eventType === 'campaign') {
      return response({ accepted: true });
    }

    const email = normalizeMarketingEmail(rawEmail);
    const oldEmail = rawOldEmail ? normalizeMarketingEmail(rawOldEmail) : '';
    await rpc('reconcile_marketing_provider_event', {
      target_event_key: eventKey,
      target_email_hash: await sha256Text(email),
      target_provider_status: providerStatusForMailchimpEvent(
        eventType,
        fields.get('data[reason]') || '',
        fields.get('data[action]') || '',
      ),
      target_event_type: eventType,
      target_occurred_at: firedAt,
      target_old_email_hash: oldEmail ? await sha256Text(oldEmail) : null,
      target_email: eventType === 'upemail' ? email : null,
    });

    console.log('mailchimp_provider_event_reconciled', { event_type: eventType });
    return response({ accepted: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = status >= 500
      ? 'The service is temporarily unavailable.'
      : error instanceof Error ? error.message : 'Unexpected error.';
    return response({ error: message }, status);
  }
});

function safeOccurredAt(value: string | null) {
  if (!value) return new Date().toISOString();
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
