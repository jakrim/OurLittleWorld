import {
  corsHeaders,
  errorResponse,
  json,
  normalizePlanKey,
  recordBillingEvent,
  restInsert,
  restPatch,
  restSelect,
  rpc,
  stripeGet,
  unixToIso,
  verifyStripeWebhook,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const event = await verifyStripeWebhook(req);
    await recordBillingEvent({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      payload: event,
    });

    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type?.startsWith('customer.subscription.')) {
      await handleSubscription(event.data.object, event.type);
    } else if (event.type === 'invoice.payment_failed') {
      await handleInvoicePaymentFailed(event.data.object);
    } else if (event.type === 'charge.refunded') {
      await handleChargeRefunded(event.data.object);
    }

    return json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
});

async function handleCheckoutCompleted(session: Record<string, any>) {
  const kind = session.metadata?.kind;
  if (kind === 'gift_year' || kind === 'gift_vault_year') {
    await provisionGift(session);
    return;
  }

  if (kind !== 'self_subscription') return;
  const subscriptionId = stringValue(session.subscription);
  if (!subscriptionId) return;

  let subscription: Record<string, any> | null = null;
  try {
    subscription = await stripeGet(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch {
    subscription = null;
  }

  const metadata = {
    ...(subscription?.metadata || {}),
    ...(session.metadata || {}),
  };
  const planKey = normalizePlanKey(metadata.plan_key);
  const status = mapStripeStatus(subscription?.status || 'active');

  await restInsert('billing_subscriptions', {
    provider: 'stripe',
    provider_customer_id: stringValue(session.customer || subscription?.customer),
    provider_subscription_id: subscriptionId,
    product_id: metadata.stripe_price_id || null,
    plan_key: planKey,
    claim_code_hash: metadata.claim_code_hash || null,
    claim_code_hint: metadata.claim_code_hint || null,
    status,
    current_period_start: unixToIso(subscription?.current_period_start),
    current_period_end: unixToIso(subscription?.current_period_end),
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    latest_receipt: subscription || session,
    metadata,
  }, { onConflict: 'provider,provider_subscription_id', merge: true });
}

async function provisionGift(session: Record<string, any>) {
  const metadata = session.metadata || {};
  const deliveryDay = /^\d{4}-\d{2}-\d{2}$/.test(metadata.delivery_day || '') ? metadata.delivery_day : null;
  const rows = await restInsert('gift_purchases', {
    giver_name: metadata.giver_name || null,
    giver_email: metadata.giver_email || session.customer_details?.email || '',
    recipient_name: metadata.recipient_name || null,
    recipient_email: metadata.recipient_email || '',
    gift_note: metadata.gift_message || null,
    delivery_day: deliveryDay,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: stringValue(session.payment_intent),
    status: 'paid',
    paid_at: new Date().toISOString(),
    metadata,
  }, { onConflict: 'stripe_checkout_session_id', merge: true });

  const gift = Array.isArray(rows) ? rows[0] : null;
  if (!gift?.id || !metadata.code_hash) return;

  await restInsert('gift_redemptions', {
    gift_purchase_id: gift.id,
    code_hash: metadata.code_hash,
    code_hint: metadata.code_hint || null,
    status: 'available',
    plan_key: session.metadata?.kind === 'gift_vault_year' ? 'gift_vault_year' : 'gift_year',
    duration_days: 365,
    metadata: {
      stripe_checkout_session_id: session.id,
      delivery_day: deliveryDay,
    },
  }, { onConflict: 'code_hash', merge: true });
}

async function handleSubscription(subscription: Record<string, any>, eventType: string) {
  const subscriptionId = stringValue(subscription.id);
  if (!subscriptionId) return;

  const existingRows = await restSelect(
    'billing_subscriptions',
    `provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*&limit=1`,
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  const metadata = {
    ...(existing?.metadata || {}),
    ...(subscription.metadata || {}),
  };
  const planKey = normalizePlanKey(metadata.plan_key);
  const status = eventType === 'customer.subscription.deleted'
    ? 'canceled'
    : mapStripeStatus(subscription.status);

  const rows = await restInsert('billing_subscriptions', {
    provider: 'stripe',
    provider_customer_id: stringValue(subscription.customer),
    provider_subscription_id: subscriptionId,
    product_id: metadata.stripe_price_id || existing?.product_id || null,
    plan_key: planKey,
    status,
    current_period_start: unixToIso(subscription.current_period_start),
    current_period_end: unixToIso(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    latest_receipt: subscription,
    metadata,
  }, { onConflict: 'provider,provider_subscription_id', merge: true });

  const saved = Array.isArray(rows) ? rows[0] : null;
  if (saved?.family_id) {
    await rpc('apply_family_entitlement', {
      target_family_id: saved.family_id,
      next_source: 'stripe',
      next_status: status,
      next_plan_key: planKey,
      next_billing_owner_user_id: saved.purchaser_user_id || null,
      next_billing_owner_email: null,
      next_provider_subscription_id: subscriptionId,
      next_starts_at: unixToIso(subscription.current_period_start),
      next_expires_at: unixToIso(subscription.current_period_end),
      next_grace_ends_at: null,
      next_metadata: { stripe_subscription_id: subscriptionId },
    });
  }
}

async function handleInvoicePaymentFailed(invoice: Record<string, any>) {
  const subscriptionId = stringValue(invoice.subscription);
  if (!subscriptionId) return;

  const rows = await restPatch(
    'billing_subscriptions',
    `provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
    {
      status: 'past_due',
      latest_receipt: invoice,
    },
  );
  const saved = Array.isArray(rows) ? rows[0] : null;
  if (saved?.family_id) {
    await rpc('apply_family_entitlement', {
      target_family_id: saved.family_id,
      next_source: 'stripe',
      next_status: 'past_due',
      next_plan_key: saved.plan_key,
      next_billing_owner_user_id: saved.purchaser_user_id || null,
      next_billing_owner_email: null,
      next_provider_subscription_id: subscriptionId,
      next_starts_at: saved.current_period_start,
      next_expires_at: saved.current_period_end,
      next_grace_ends_at: null,
      next_metadata: { invoice_id: invoice.id },
    });
  }
}

async function handleChargeRefunded(charge: Record<string, any>) {
  const paymentIntent = stringValue(charge.payment_intent);
  if (!paymentIntent) return;

  const giftRows = await restPatch(
    'gift_purchases',
    `stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntent)}&status=neq.redeemed`,
    {
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      metadata: { refund_charge_id: charge.id },
    },
  );
  const gift = Array.isArray(giftRows) ? giftRows[0] : null;
  if (gift?.id) {
    await restPatch(
      'gift_redemptions',
      `gift_purchase_id=eq.${encodeURIComponent(gift.id)}&status=eq.available`,
      { status: 'revoked' },
    );
  }
}

function mapStripeStatus(status?: string) {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled') return 'canceled';
  if (status === 'incomplete_expired') return 'expired';
  return 'pending';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : value && typeof value === 'object' && 'id' in value ? String((value as { id: unknown }).id) : null;
}
