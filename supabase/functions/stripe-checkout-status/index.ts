import {
  corsHeaders,
  decryptCode,
  errorResponse,
  json,
  readJson,
  restSelect,
  stripeGet,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await readJson(req);
    const sessionId = String(body.session_id || '').trim();
    if (!/^cs_(test|live)_[A-Za-z0-9]{20,}$/.test(sessionId)) {
      return privateJson({ ready: false, state: 'invalid' }, 400);
    }

    const session = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (session.payment_status !== 'paid') {
      return privateJson({ ready: false, state: session.status === 'expired' ? 'expired' : 'unpaid' });
    }

    const kind = String(session.metadata?.kind || '');
    if (kind === 'self_subscription') return subscriptionStatus(session);
    if (kind === 'gift_year' || kind === 'gift_vault_year') return giftStatus(session);
    return privateJson({ ready: false, state: 'invalid' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
});

async function subscriptionStatus(session: Record<string, any>) {
  const subscriptionId = providerId(session.subscription);
  const claimHash = String(session.metadata?.claim_code_hash || '');
  const cipher = String(session.metadata?.claim_code_ciphertext || '');
  if (!subscriptionId || !claimHash || !cipher) return privateJson({ ready: false, state: 'processing' });

  const rows = await restSelect(
    'billing_subscriptions',
    `provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(subscriptionId)}&claim_code_hash=eq.${encodeURIComponent(claimHash)}&select=status,claim_code_redeemed_at&limit=1`,
  );
  const subscription = Array.isArray(rows) ? rows[0] : null;
  if (!subscription) return privateJson({ ready: false, state: 'processing' });
  if (subscription.claim_code_redeemed_at) return privateJson({ ready: false, state: 'already_redeemed' });
  if (!['active', 'trialing', 'grace_period'].includes(subscription.status)) {
    return privateJson({ ready: false, state: subscription.status || 'unavailable' });
  }

  return privateJson({
    ready: true,
    state: 'ready',
    kind: 'purchase',
    code: await decryptCode(cipher),
  });
}

async function giftStatus(session: Record<string, any>) {
  const rows = await restSelect(
    'gift_purchases',
    `stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&select=id,status&limit=1`,
  );
  const gift = Array.isArray(rows) ? rows[0] : null;
  if (!gift) return privateJson({ ready: false, state: 'processing' });
  if (gift.status === 'refunded' || gift.status === 'canceled') {
    return privateJson({ ready: false, state: gift.status });
  }

  const redemptions = await restSelect(
    'gift_redemptions',
    `gift_purchase_id=eq.${encodeURIComponent(gift.id)}&select=status,metadata&limit=1`,
  );
  const redemption = Array.isArray(redemptions) ? redemptions[0] : null;
  if (!redemption) return privateJson({ ready: false, state: 'processing' });
  if (redemption.status !== 'available') {
    return privateJson({ ready: false, state: redemption.status === 'redeemed' ? 'already_redeemed' : redemption.status });
  }

  const cipher = String(redemption.metadata?.code_ciphertext || session.metadata?.code_ciphertext || '');
  if (!cipher) return privateJson({ ready: false, state: 'processing' });
  return privateJson({
    ready: true,
    state: 'ready',
    kind: 'gift',
    code: await decryptCode(cipher),
  });
}

function providerId(value: unknown) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && 'id' in value
    ? String((value as { id: unknown }).id)
    : '';
}

function privateJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
      'cache-control': 'private, no-store, max-age=0',
      'referrer-policy': 'no-referrer',
    },
  });
}
