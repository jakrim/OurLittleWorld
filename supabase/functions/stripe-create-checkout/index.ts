import {
  checkoutAttributionFromInput,
  codeHint,
  corsHeaders,
  encryptCode,
  errorResponse,
  hashCode,
  json,
  originFromRequest,
  planFromInput,
  readJson,
  requiredEnv,
  setStripeMetadata,
  stripeFormRequest,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await readJson(req);
    const email = String(body.email || '').trim();
    if (!email || !email.includes('@')) return json({ error: 'A valid email is required.' }, 400);

    const plan = planFromInput(String(body.plan || 'annual'));
    const priceId = requiredEnv(plan.priceEnv);
    const origin = originFromRequest(req);
    const attemptId = checkoutAttemptId(body.checkout_attempt_id);
    const claimCode = await checkoutCode('OLW', 'self', attemptId);
    const claimCodeHash = await hashCode(claimCode);
    const claimCodeCiphertext = await encryptCode(claimCode, `self:${attemptId}`);
    const successUrl = `${origin}/checkout/success#session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/pricing/?checkout=cancelled`;

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('customer_email', email);
    params.set('client_reference_id', `self-${attemptId}`);
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('allow_promotion_codes', 'true');
    params.set('payment_method_types[0]', 'card');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[kind]', 'self_subscription');
    params.set('metadata[plan_key]', plan.planKey);
    params.set('metadata[stripe_price_id]', priceId);
    params.set('metadata[claim_code_hash]', claimCodeHash);
    params.set('metadata[claim_code_hint]', codeHint(claimCode));
    params.set('subscription_data[metadata][kind]', 'self_subscription');
    params.set('subscription_data[metadata][plan_key]', plan.planKey);
    params.set('subscription_data[metadata][claim_code_hash]', claimCodeHash);
    params.set('subscription_data[metadata][claim_code_hint]', codeHint(claimCode));
    const attribution = checkoutAttributionFromInput(body);
    setStripeMetadata(params, attribution);
    setStripeMetadata(params, attribution, 'subscription_data[metadata]');

    const session = await stripeFormRequest('/v1/checkout/sessions', params, 'POST', {
      idempotencyKey: checkoutIdempotencyKey('self', attemptId),
    });
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
});
