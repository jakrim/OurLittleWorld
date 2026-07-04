import {
  corsHeaders,
  errorResponse,
  json,
  readJson,
  requireUser,
  rpc,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { token } = await requireUser(req);
    const body = await readJson(req);
    const code = String(body.code || '').trim();
    const familyId = String(body.familyId || body.family_id || '').trim();
    if (!code || !familyId) return json({ error: 'Code and family are required.' }, 400);

    const result = await rpc('redeem_purchase_code', {
      p_code: code,
      target_family_id: familyId,
    }, token);

    return json({ entitlement: Array.isArray(result) ? result[0] : result });
  } catch (error) {
    return errorResponse(error);
  }
});
