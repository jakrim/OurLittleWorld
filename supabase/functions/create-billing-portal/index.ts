import {
  HttpError,
  corsHeaders,
  errorResponse,
  json,
  originFromRequest,
  readJson,
  requireUser,
  restSelect,
  rpc,
  stripeFormRequest,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { token, user } = await requireUser(req);
    const body = await readJson(req);
    const familyId = String(body.familyId || body.family_id || '').trim();
    if (!familyId) return json({ error: 'Family is required.' }, 400);

    const entitlementRows = await rpc('get_my_family_entitlement', {
      target_family_id: familyId,
    }, token);
    const entitlement = Array.isArray(entitlementRows) ? entitlementRows[0] : null;
    if (!entitlement?.is_billing_owner) {
      throw new HttpError(403, 'The billing owner can manage this subscription. Contact support to change billing owner.');
    }

    const subscriptions = await restSelect(
      'billing_subscriptions',
      `provider=eq.stripe&family_id=eq.${encodeURIComponent(familyId)}&purchaser_user_id=eq.${encodeURIComponent(user.id)}&select=provider_customer_id&limit=1`,
    );
    const customerId = Array.isArray(subscriptions) ? subscriptions[0]?.provider_customer_id : null;
    if (!customerId) throw new HttpError(404, 'No Stripe subscription is attached to this family.');

    const params = new URLSearchParams();
    params.set('customer', customerId);
    params.set('return_url', `${originFromRequest(req)}/pricing/`);
    const configuration = Deno.env.get('STRIPE_BILLING_PORTAL_CONFIGURATION');
    if (configuration) params.set('configuration', configuration);

    const session = await stripeFormRequest('/v1/billing_portal/sessions', params);
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
});
