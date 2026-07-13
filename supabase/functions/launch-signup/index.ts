import {
  acquisitionMetadataFromBody,
  corsHeaders,
  errorResponse,
  hashCode,
  json,
  readJson,
  restInsert,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await readJson(req);
    // Honeypot submissions receive a success-shaped response without storing data.
    if (String(body.website || '').trim()) return json({ accepted: true });

    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }
    if (body.marketing_consent !== true) {
      return json({ error: 'Marketing consent is required for launch emails.' }, 400);
    }

    const source = String(body.source || '').trim().toLowerCase();
    const consentSource = /^web_[a-z0-9_-]{1,60}$/.test(source) ? source : 'web_unknown';
    const consentedAt = new Date().toISOString();
    await restInsert('marketing_contacts', {
      email,
      email_hash: await hashCode(email),
      status: 'subscribed',
      marketing_consent: true,
      consented_at: consentedAt,
      consent_source: consentSource,
      attribution: acquisitionMetadataFromBody(body),
    }, { onConflict: 'email_hash', merge: true });

    return json({ accepted: true });
  } catch (error) {
    return errorResponse(error);
  }
});
