import {
  corsHeaders,
  errorResponse,
  json,
  readJson,
  recordBillingEvent,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await readJson(req);
    const email = String(body.email || '').trim();
    if (!email.includes('@')) return json({ error: 'A valid email is required.' }, 400);

    await recordBillingEvent({
      provider: 'partner',
      eventId: `inquiry:${crypto.randomUUID()}`,
      eventType: 'partner.inquiry',
      payload: {
        name: String(body.name || '').slice(0, 120),
        email,
        partner_type: String(body.partner_type || '').slice(0, 120),
        message: String(body.message || '').slice(0, 1200),
      },
    });

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
