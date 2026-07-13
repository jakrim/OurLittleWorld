import {
  acquisitionMetadataFromRecord,
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
  stripeEventSummary,
  stripeReceiptSummary,
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
      payload: stripeEventSummary(event),
    });

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type?.startsWith('customer.subscription.')) {
      await handleSubscription(event.data.object, event.type);
    } else if (event.type === 'invoice.payment_failed') {
      await handleInvoicePaymentFailed(event.data.object);
    } else if (event.type === 'charge.refunded') {
      await handleChargeRefunded(event.data.object);
    }

    await restPatch(
      'billing_events',
      `provider=eq.stripe&event_id=eq.${encodeURIComponent(event.id)}`,
      { processed_at: new Date().toISOString() },
    );

    return json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
});

async function handleCheckoutCompleted(session: Record<string, any>) {
  if (session.payment_status !== 'paid') return;
  const kind = session.metadata?.kind;
  if (kind === 'gift_year' || kind === 'gift_vault_year') {
    await provisionGift(session);
    return;
  }

  if (kind !== 'self_subscription') return;
  const subscriptionId = stringValue(session.subscription);
  if (!subscriptionId) return;

  const subscription = await stripeGet(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);

  const metadata = {
    ...(subscription?.metadata || {}),
    ...(session.metadata || {}),
    stripe_checkout_session_id: session.id,
  };
  const planKey = normalizePlanKey(metadata.plan_key);
  const status = mapStripeStatus(subscription?.status);

  await restInsert('billing_subscriptions', {
    provider: 'stripe',
    provider_customer_id: stringValue(session.customer || subscription?.customer),
    provider_subscription_id: subscriptionId,
    product_id: metadata.stripe_price_id || null,
    plan_key: planKey,
    claim_code_hash: metadata.claim_code_hash || null,
    claim_code_hint: metadata.claim_code_hint || null,
    status,
    current_period_start: unixToIso(periodStart(subscription)),
    current_period_end: unixToIso(periodEnd(subscription)),
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    latest_receipt: stripeReceiptSummary(subscription),
    metadata,
  }, { onConflict: 'provider,provider_subscription_id', merge: true });
}

async function provisionGift(session: Record<string, any>) {
  const metadata = session.metadata || {};
  const acquisition = acquisitionMetadataFromRecord({
    campaign: metadata.acquisition_campaign,
    angle: metadata.acquisition_angle,
    creative: metadata.acquisition_creative,
    channel: metadata.acquisition_channel,
    landing_page: metadata.acquisition_landing_page,
    first_campaign: metadata.acquisition_first_campaign,
    first_angle: metadata.acquisition_first_angle,
    first_creative: metadata.acquisition_first_creative,
    first_channel: metadata.acquisition_first_channel,
    first_landing_page: metadata.acquisition_first_landing_page,
    last_campaign: metadata.acquisition_last_campaign,
    last_angle: metadata.acquisition_last_angle,
    last_creative: metadata.acquisition_last_creative,
    last_channel: metadata.acquisition_last_channel,
    last_landing_page: metadata.acquisition_last_landing_page,
  });
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
    metadata: {
      kind: metadata.kind,
      plan_key: metadata.plan_key,
      acquisition,
    },
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
      acquisition,
      code_ciphertext: metadata.code_ciphertext,
    },
  }, { onConflict: 'code_hash', merge: true });

  await enqueueGiftEmails(gift, metadata, deliveryDay);

  const paymentIntentId = stringValue(session.payment_intent);
  if (paymentIntentId) await reconcileGiftRefund(paymentIntentId);
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
    current_period_start: unixToIso(periodStart(subscription)),
    current_period_end: unixToIso(periodEnd(subscription)),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    latest_receipt: stripeReceiptSummary(subscription),
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
      next_starts_at: unixToIso(periodStart(subscription)),
      next_expires_at: unixToIso(periodEnd(subscription)),
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
      latest_receipt: stripeReceiptSummary(invoice),
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
    `stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntent)}&status=neq.refunded`,
    {
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    },
  );
  const gift = Array.isArray(giftRows) ? giftRows[0] : null;
  if (gift?.id) {
    const redemptionRows = await restPatch(
      'gift_redemptions',
      `gift_purchase_id=eq.${encodeURIComponent(gift.id)}&status=in.(available,redeemed)`,
      { status: 'revoked' },
    );
    await restPatch(
      'transactional_email_outbox',
      `gift_purchase_id=eq.${encodeURIComponent(gift.id)}&state=in.(pending,failed)`,
      { state: 'canceled' },
    );

    const redemption = Array.isArray(redemptionRows) ? redemptionRows[0] : null;
    if (redemption?.redeemed_family_id) {
      const entitlementRows = await restSelect(
        'family_entitlements',
        `family_id=eq.${encodeURIComponent(redemption.redeemed_family_id)}&select=source,plan_key,metadata&limit=1`,
      );
      const entitlement = Array.isArray(entitlementRows) ? entitlementRows[0] : null;
      if (
        entitlement?.source === 'gift'
        && String(entitlement?.metadata?.gift_redemption_id || '') === String(redemption.id)
      ) {
        await rpc('apply_family_entitlement', {
          target_family_id: redemption.redeemed_family_id,
          next_source: 'gift',
          next_status: 'refunded',
          next_plan_key: entitlement.plan_key || redemption.plan_key || 'gift_year',
          next_billing_owner_user_id: null,
          next_billing_owner_email: null,
          next_provider_subscription_id: null,
          next_starts_at: new Date().toISOString(),
          next_expires_at: new Date().toISOString(),
          next_grace_ends_at: null,
          next_metadata: { refunded_gift_redemption_id: redemption.id },
        });
      }
    }
  }
}

async function enqueueGiftEmails(
  gift: Record<string, any>,
  metadata: Record<string, any>,
  deliveryDay: string | null,
) {
  const now = new Date();
  const requestedDelivery = deliveryDay ? new Date(`${deliveryDay}T15:00:00.000Z`) : now;
  const scheduledFor = Number.isFinite(requestedDelivery.getTime()) && requestedDelivery > now
    ? requestedDelivery.toISOString()
    : now.toISOString();
  const commonPayload = {
    giver_name: metadata.giver_name || '',
    recipient_name: metadata.recipient_name || '',
    gift_message: metadata.gift_message || '',
    plan_key: metadata.plan_key || metadata.kind || 'gift_year',
  };

  await restInsert('transactional_email_outbox', {
    idempotency_key: `gift:${gift.id}:buyer-confirmation`,
    message_type: 'gift_buyer_confirmation',
    recipient_email: gift.giver_email,
    gift_purchase_id: gift.id,
    scheduled_for: now.toISOString(),
    payload: commonPayload,
  }, { onConflict: 'idempotency_key', merge: true });

  await restInsert('transactional_email_outbox', {
    idempotency_key: `gift:${gift.id}:recipient-delivery:${deliveryDay || 'immediate'}`,
    message_type: 'gift_recipient_delivery',
    recipient_email: gift.recipient_email,
    gift_purchase_id: gift.id,
    scheduled_for: scheduledFor,
    payload: {
      ...commonPayload,
      code_ciphertext: metadata.code_ciphertext || '',
    },
  }, { onConflict: 'idempotency_key', merge: true });
}

async function reconcileGiftRefund(paymentIntentId: string) {
  const paymentIntent = await stripeGet(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  const chargeId = stringValue(paymentIntent.latest_charge);
  if (!chargeId) return;
  const charge = await stripeGet(`/v1/charges/${encodeURIComponent(chargeId)}`);
  if (Number(charge.amount_refunded || 0) > 0 || charge.refunded === true) {
    await handleChargeRefunded(charge);
  }
}

// Newer Stripe API versions report the current period on subscription items
// rather than the subscription itself.
function periodStart(subscription: Record<string, any> | null) {
  return subscription?.current_period_start
    ?? subscription?.items?.data?.[0]?.current_period_start
    ?? null;
}

function periodEnd(subscription: Record<string, any> | null) {
  return subscription?.current_period_end
    ?? subscription?.items?.data?.[0]?.current_period_end
    ?? null;
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
