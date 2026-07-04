import {
  codeHint,
  corsHeaders,
  errorResponse,
  generateCode,
  hashCode,
  json,
  originFromRequest,
  planFromInput,
  readJson,
  requiredEnv,
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
    const claimCode = generateCode('OLW');
    const claimCodeHash = await hashCode(claimCode);
    const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&claim_code=${encodeURIComponent(claimCode)}`;
    const cancelUrl = `${origin}/pricing/?checkout=cancelled`;

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('customer_email', email);
    params.set('client_reference_id', `self-${crypto.randomUUID()}`);
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('allow_promotion_codes', 'true');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[kind]', 'self_subscription');
    params.set('metadata[plan_key]', plan.planKey);
    params.set('metadata[stripe_price_id]', priceId);
    params.set('metadata[claim_code_hash]', claimCodeHash);
    params.set('metadata[claim_code_hint]', codeHint(claimCode));
    params.set('metadata[name]', String(body.name || '').slice(0, 120));
    params.set('metadata[stage]', String(body.stage || '').slice(0, 80));
    params.set('subscription_data[metadata][kind]', 'self_subscription');
    params.set('subscription_data[metadata][plan_key]', plan.planKey);
    params.set('subscription_data[metadata][claim_code_hash]', claimCodeHash);
    params.set('subscription_data[metadata][claim_code_hint]', codeHint(claimCode));

    const session = await stripeFormRequest('/v1/checkout/sessions', params);
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
});
