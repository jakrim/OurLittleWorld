import {
  HttpError,
  codeHint,
  corsHeaders,
  env,
  errorResponse,
  generateCode,
  hashCode,
  json,
  readJson,
  restInsert,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const expected = env('OLW_BILLING_ADMIN_SECRET');
    if (!expected || req.headers.get('x-olw-admin-secret') !== expected) {
      throw new HttpError(403, 'Admin billing secret is required.');
    }

    const body = await readJson(req);
    const partnerName = String(body.partnerName || body.partner_name || '').trim();
    const quantity = Math.min(Math.max(Number(body.quantity || 1), 1), 500);
    const durationDays = Math.max(Number(body.durationDays || body.duration_days || 365), 1);
    if (!partnerName) return json({ error: 'Partner name is required.' }, 400);

    const grantRows = await restInsert('partner_grants', {
      partner_name: partnerName,
      grant_type: String(body.grantType || body.grant_type || 'bulk_gift'),
      quantity,
      duration_days: durationDays,
      expires_at: body.expiresAt || body.expires_at || null,
      status: 'active',
      metadata: {
        requested_by: String(body.requestedBy || body.requested_by || ''),
      },
    });
    const grant = Array.isArray(grantRows) ? grantRows[0] : null;
    if (!grant?.id) throw new HttpError(500, 'Could not create partner grant.');

    const codes = [];
    const rows = [];
    for (let i = 0; i < quantity; i += 1) {
      const code = generateCode('PARTNER');
      codes.push(code);
      rows.push({
        partner_grant_id: grant.id,
        code_hash: await hashCode(code),
        code_hint: codeHint(code),
        status: 'available',
      });
    }
    await restInsert('partner_grant_codes', rows);

    return json({
      partner_grant_id: grant.id,
      partner_name: partnerName,
      quantity,
      duration_days: durationDays,
      codes,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
