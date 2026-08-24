import {
  corsHeaders,
  errorResponse,
  hashCode,
  HttpError,
  json,
  readJson,
  restSelect,
  stripeGet,
} from '../_shared/billing.ts';

const READY_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'grace_period']);
const READY_GIFT_STATUSES = new Set(['paid', 'scheduled', 'sent', 'redeemed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await readJson(req);
    const sessionId = String(body.session_id || body.sessionId || '').trim();
    const code = String(body.code || '').trim();
    const requestedKind = body.kind === 'gift' ? 'gift' : 'purchase';
    if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]{16,240}$/.test(sessionId)) {
      throw new HttpError(400, 'A valid checkout session is required.');
    }
    if (!code || code.length > 80) throw new HttpError(400, 'A valid purchase code is required.');

    const session = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const metadata = session?.metadata || {};
    const actualKind = metadata.kind === 'self_subscription'
      ? 'purchase'
      : ['gift_year', 'gift_vault_year'].includes(metadata.kind)
        ? 'gift'
        : 'unknown';
    if (actualKind !== requestedKind) throw new HttpError(400, 'Checkout type does not match.');

    const expectedCodeHash = requestedKind === 'gift' ? metadata.code_hash : metadata.claim_code_hash;
    const providedCodeHash = await hashCode(code);
    if (!expectedCodeHash || providedCodeHash !== expectedCodeHash) {
      throw new HttpError(400, 'Purchase code does not match this checkout.');
    }

    const checkoutComplete = session.status === 'complete'
      && ['paid', 'no_payment_required'].includes(session.payment_status);
    if (!checkoutComplete) {
      return json({
        checkout_status: session.status === 'expired' ? 'expired' : 'pending',
        claim_status: 'pending',
      });
    }

    const claim = requestedKind === 'gift'
      ? await giftClaimStatus(sessionId, providedCodeHash)
      : await subscriptionClaimStatus(session.subscription, providedCodeHash);

    return json({
      checkout_status: 'complete',
      claim_status: claim.status,
      plan_key: claim.planKey || metadata.plan_key || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

async function subscriptionClaimStatus(subscriptionValue: unknown, codeHash: string) {
  const subscriptionId = stringValue(subscriptionValue);
  if (!subscriptionId) return { status: 'pending', planKey: null };
  const rows = await restSelect(
    'billing_subscriptions',
    `provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=status,plan_key,claim_code_hash,claim_code_redeemed_at&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.claim_code_hash !== codeHash || !READY_SUBSCRIPTION_STATUSES.has(row.status)) {
    return { status: 'pending', planKey: row?.plan_key || null };
  }
  return {
    status: row.claim_code_redeemed_at ? 'claimed' : 'ready',
    planKey: row.plan_key || null,
  };
}

async function giftClaimStatus(sessionId: string, codeHash: string) {
  const purchases = await restSelect(
    'gift_purchases',
    `stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=id,status&limit=1`,
  );
  const purchase = Array.isArray(purchases) ? purchases[0] : null;
  if (!purchase?.id || !READY_GIFT_STATUSES.has(purchase.status)) {
    return { status: 'pending', planKey: null };
  }
  const redemptions = await restSelect(
    'gift_redemptions',
    `gift_purchase_id=eq.${encodeURIComponent(purchase.id)}&code_hash=eq.${encodeURIComponent(codeHash)}&select=status,plan_key&limit=1`,
  );
  const redemption = Array.isArray(redemptions) ? redemptions[0] : null;
  if (!redemption) return { status: 'pending', planKey: null };
  return {
    status: redemption.status === 'available' ? 'ready' : redemption.status === 'redeemed' ? 'claimed' : 'pending',
    planKey: redemption.plan_key || null,
  };
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id);
  return '';
}
