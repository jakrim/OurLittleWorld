import {
  checkoutAttributionFromInput,
  codeHint,
  corsHeaders,
  errorResponse,
  generateCode,
  giftPlanFromInput,
  hashCode,
  json,
  originFromRequest,
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
    const giverEmail = String(body.giver_email || '').trim();
    const recipientEmail = String(body.recipient_email || '').trim();
    if (!giverEmail.includes('@') || !recipientEmail.includes('@')) {
      return json({ error: 'Giver and recipient email are required.' }, 400);
    }

    const giftPlan = giftPlanFromInput(String(body.plan || 'gift_year'));
    const priceId = requiredEnv(giftPlan.priceEnv);
    const origin = originFromRequest(req);
    const giftCode = generateCode('GIFT');
    const giftCodeHash = await hashCode(giftCode);
    const successUrl = `${origin}/checkout/gift-success?session_id={CHECKOUT_SESSION_ID}&gift_code=${encodeURIComponent(giftCode)}`;
    const cancelUrl = `${origin}/gift/?checkout=cancelled`;

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('customer_email', giverEmail);
    params.set('client_reference_id', `gift-${crypto.randomUUID()}`);
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[kind]', giftPlan.kind);
    params.set('metadata[plan_key]', giftPlan.planKey);
    params.set('metadata[stripe_price_id]', priceId);
    params.set('metadata[giver_name]', String(body.giver_name || '').slice(0, 120));
    params.set('metadata[giver_email]', giverEmail);
    params.set('metadata[recipient_name]', String(body.recipient_name || '').slice(0, 120));
    params.set('metadata[recipient_email]', recipientEmail);
    params.set('metadata[gift_message]', String(body.gift_message || '').slice(0, 700));
    params.set('metadata[delivery_day]', String(body.delivery_day || '').slice(0, 32));
    params.set('metadata[code_hash]', giftCodeHash);
    params.set('metadata[code_hint]', codeHint(giftCode));
    setStripeMetadata(params, checkoutAttributionFromInput(body));

    const session = await stripeFormRequest('/v1/checkout/sessions', params);
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
});
