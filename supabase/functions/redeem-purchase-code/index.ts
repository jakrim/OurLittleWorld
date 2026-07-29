import {
  corsHeaders,
  errorResponse,
  json,
  limitsForPlan,
  readJson,
  requireUser,
  rpc,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { token, user } = await requireUser(req);
    const body = await readJson(req);
    const code = String(body.code || '').trim();
    const familyId = String(body.familyId || body.family_id || '').trim();
    if (!code || !familyId) return json({ error: 'Code and family are required.' }, 400);

    const result = await rpc('redeem_purchase_code', {
      p_code: code,
      target_family_id: familyId,
    }, token);

    const entitlement = Array.isArray(result) ? result[0] : result;
    let attributionAttached = false;
    if (entitlement?.source === 'gift' || entitlement?.source === 'stripe') {
      try {
        const attribution = await rpc('attach_redeemed_acquisition_attribution', {
          target_family_id: familyId,
          target_user_id: user.id,
          target_source: entitlement.source,
        });
        attributionAttached = Boolean(attribution && Object.keys(attribution).length);
      } catch (error) {
        // Redemption is authoritative and must not be rolled back or reported as a
        // failure if the non-critical attribution copy needs repair.
        console.warn('purchase attribution attach failed', error instanceof Error ? error.message : error);
      }
    }
    return json({
      entitlement: entitlement ? { ...entitlement, ...limitsForPlan(entitlement.plan_key) } : entitlement,
      attribution_attached: attributionAttached,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
