import {
  HttpError,
  assertFamilyWriter,
  corsHeaders,
  env,
  errorResponse,
  json,
  limitsForPlan,
  msToIso,
  readJson,
  recordBillingEvent,
  requireUser,
  restInsert,
  rpc,
  unixToIso,
} from '../_shared/billing.ts';

const PLAN_BY_PRODUCT: Record<string, string> = {
  'olw.family.monthly': 'family_monthly',
  'olw.family.yearly': 'family_yearly',
  'olw.vault.monthly': 'vault_monthly',
  'olw.vault.yearly': 'vault_yearly',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { user } = await requireUser(req);
    const body = await readJson(req);
    const familyId = String(body.familyId || body.family_id || '').trim();
    const purchase = body.purchase || {};
    const productId = String(body.productId || purchase.productId || purchase.currentPlanId || '').trim();
    const provider = normalizeProvider(String(body.provider || purchase.store || purchase.platform || '').trim());

    if (!familyId) throw new HttpError(400, 'Family is required.');
    if (!PLAN_BY_PRODUCT[productId]) throw new HttpError(400, 'Product is not allowed.');
    if (!provider) throw new HttpError(400, 'Store provider is required.');
    await assertFamilyWriter(familyId, user.id);

    const verified = provider === 'apple'
      ? await verifyApplePurchase({ purchase, productId, userId: user.id })
      : await verifyGooglePurchase({ purchase, productId, userId: user.id });

    const planKey = PLAN_BY_PRODUCT[productId];
    const rows = await restInsert('billing_subscriptions', {
      family_id: familyId,
      purchaser_user_id: user.id,
      provider,
      product_id: productId,
      plan_key: planKey,
      provider_subscription_id: verified.providerSubscriptionId,
      provider_original_id: verified.providerOriginalId,
      provider_transaction_id: verified.providerTransactionId,
      status: verified.status,
      current_period_start: verified.startsAt,
      current_period_end: verified.expiresAt,
      latest_receipt: verified.receipt,
      metadata: verified.metadata,
    }, { onConflict: 'provider,provider_subscription_id', merge: true });

    const saved = Array.isArray(rows) ? rows[0] : null;
    await rpc('apply_family_entitlement', {
      target_family_id: familyId,
      next_source: provider,
      next_status: verified.status,
      next_plan_key: planKey,
      next_billing_owner_user_id: user.id,
      next_billing_owner_email: user.email || null,
      next_provider_subscription_id: verified.providerSubscriptionId,
      next_starts_at: verified.startsAt,
      next_expires_at: verified.expiresAt,
      next_grace_ends_at: verified.graceEndsAt,
      next_metadata: {
        billing_subscription_id: saved?.id || null,
        product_id: productId,
      },
    });

    await recordBillingEvent({
      provider,
      eventId: `${provider}:${verified.providerTransactionId || verified.providerSubscriptionId}`,
      eventType: `${provider}.purchase.verified`,
      familyId,
      userId: user.id,
      payload: verified.receipt || {},
    });

    return json({
      entitlement: {
        family_id: familyId,
        status: verified.status,
        source: provider,
        plan_key: planKey,
        expires_at: verified.expiresAt,
        ...limitsForPlan(planKey),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

function normalizeProvider(value: string) {
  const normalized = value.toLowerCase();
  if (['ios', 'apple', 'appstore', 'app_store'].includes(normalized)) return 'apple';
  if (['android', 'google', 'play', 'googleplay', 'google_play'].includes(normalized)) return 'google';
  return null;
}

async function verifyApplePurchase({
  purchase,
  productId,
  userId,
}: {
  purchase: Record<string, any>;
  productId: string;
  userId: string;
}) {
  const transactionId = String(purchase.transactionId || purchase.id || '').trim();
  const bundleId = env('APPLE_BUNDLE_ID', 'com.jessekrim.ourlittleworld');
  let transactionPayload: Record<string, any> | null = null;
  let receipt: Record<string, unknown> = { purchase };

  if (hasAppleApiCredentials() && transactionId) {
    const response = await appleApiGetTransaction(transactionId);
    receipt = response;
    transactionPayload = decodeJwsPayload(String(response.signedTransactionInfo || ''));
  } else if (env('BILLING_ALLOW_UNVERIFIED_STORE_PURCHASES') === 'true') {
    transactionPayload = decodeJwsPayload(String(purchase.purchaseToken || purchase.transactionReceipt || '')) || {
      productId,
      bundleId,
      transactionId,
      originalTransactionId: String(purchase.originalTransactionId || transactionId || purchase.purchaseToken || ''),
      purchaseDate: purchase.transactionDate,
      expiresDate: purchase.expirationDateIOS || fallbackExpiry(productId),
      appAccountToken: purchase.appAccountToken,
    };
  } else {
    throw new HttpError(501, 'Apple receipt verification is not configured.');
  }

  if (!transactionPayload) throw new HttpError(400, 'Apple transaction payload is invalid.');
  if (transactionPayload.bundleId && transactionPayload.bundleId !== bundleId) {
    throw new HttpError(400, 'Apple bundle ID did not match.');
  }
  if (transactionPayload.productId !== productId) {
    throw new HttpError(400, 'Apple product ID did not match.');
  }
  if (transactionPayload.appAccountToken && transactionPayload.appAccountToken !== userId) {
    throw new HttpError(403, 'This purchase belongs to a different account.');
  }

  const expiresAt = msToIso(transactionPayload.expiresDate) || msToIso(purchase.expirationDateIOS);
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    throw new HttpError(402, 'Apple subscription is not active.');
  }

  return {
    status: 'active',
    startsAt: msToIso(transactionPayload.purchaseDate || purchase.transactionDate) || new Date().toISOString(),
    expiresAt,
    graceEndsAt: null,
    providerSubscriptionId: String(transactionPayload.originalTransactionId || transactionPayload.transactionId || transactionId),
    providerOriginalId: String(transactionPayload.originalTransactionId || transactionId),
    providerTransactionId: String(transactionPayload.transactionId || transactionId),
    receipt,
    metadata: {
      app_account_token: transactionPayload.appAccountToken || null,
      environment: transactionPayload.environment || purchase.environmentIOS || null,
    },
  };
}

async function verifyGooglePurchase({
  purchase,
  productId,
  userId,
}: {
  purchase: Record<string, any>;
  productId: string;
  userId: string;
}) {
  const purchaseToken = String(purchase.purchaseToken || '').trim();
  if (!purchaseToken) throw new HttpError(400, 'Google purchase token is required.');

  let payload: Record<string, any> | null = null;
  if (hasGoogleCredentials()) {
    payload = await googleGetSubscription(purchaseToken);
  } else if (env('BILLING_ALLOW_UNVERIFIED_STORE_PURCHASES') === 'true') {
    payload = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId, expiryTime: new Date(fallbackExpiry(productId)).toISOString() }],
      externalAccountIdentifiers: { obfuscatedExternalAccountId: purchase.obfuscatedAccountIdAndroid || userId },
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    };
  } else {
    throw new HttpError(501, 'Google Play verification is not configured.');
  }
  if (!payload) throw new HttpError(400, 'Google subscription payload is invalid.');

  const lineItem = Array.isArray(payload.lineItems)
    ? payload.lineItems.find((item: Record<string, any>) => item.productId === productId) || payload.lineItems[0]
    : null;
  if (!lineItem || lineItem.productId !== productId) throw new HttpError(400, 'Google product ID did not match.');

  const accountId = payload.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (accountId && accountId !== userId) throw new HttpError(403, 'This purchase belongs to a different account.');

  const expiresAt = lineItem.expiryTime || lineItem.expiryTimeMillis && msToIso(lineItem.expiryTimeMillis);
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    throw new HttpError(402, 'Google subscription is not active.');
  }

  if (hasGoogleCredentials() && payload.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
    await googleAcknowledgeSubscription(productId, purchaseToken).catch(() => undefined);
  }

  return {
    status: mapGoogleStatus(payload.subscriptionState),
    startsAt: purchase.transactionDate ? msToIso(purchase.transactionDate) : new Date().toISOString(),
    expiresAt,
    graceEndsAt: payload.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ? expiresAt : null,
    providerSubscriptionId: purchaseToken,
    providerOriginalId: String(payload.latestOrderId || purchase.transactionId || purchaseToken),
    providerTransactionId: String(payload.latestOrderId || purchase.transactionId || purchaseToken),
    receipt: payload,
    metadata: {
      package_name: env('GOOGLE_PLAY_PACKAGE_NAME', purchase.packageNameAndroid || ''),
      acknowledgement_state: payload.acknowledgementState || null,
    },
  };
}

function mapGoogleStatus(state?: string) {
  if (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') return 'grace_period';
  if (state === 'SUBSCRIPTION_STATE_ACTIVE') return 'active';
  if (state === 'SUBSCRIPTION_STATE_CANCELED') return 'canceled';
  if (state === 'SUBSCRIPTION_STATE_EXPIRED') return 'expired';
  if (state === 'SUBSCRIPTION_STATE_ON_HOLD') return 'past_due';
  return 'pending';
}

function hasAppleApiCredentials() {
  return Boolean(env('APPLE_ISSUER_ID') && env('APPLE_KEY_ID') && env('APPLE_PRIVATE_KEY'));
}

async function appleApiGetTransaction(transactionId: string) {
  const token = await appStoreServerToken();
  const paths = [
    `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
  ];

  let lastStatus = 0;
  for (const url of paths) {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    lastStatus = response.status;
    if (response.ok) return response.json();
    if (![401, 404].includes(response.status)) break;
  }
  throw new HttpError(502, `Apple transaction lookup failed (${lastStatus}).`);
}

async function appStoreServerToken() {
  const issuerId = env('APPLE_ISSUER_ID');
  const keyId = env('APPLE_KEY_ID');
  const privateKey = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const bundleId = env('APPLE_BUNDLE_ID', 'com.jessekrim.ourlittleworld');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const claims = {
    iss: issuerId,
    iat: now,
    exp: now + 1800,
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  };
  const signingInput = `${base64urlJson(header)}.${base64urlJson(claims)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlBytes(new Uint8Array(signature))}`;
}

function hasGoogleCredentials() {
  return Boolean(env('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') && env('GOOGLE_PLAY_PACKAGE_NAME'));
}

async function googleGetSubscription(purchaseToken: string) {
  const accessToken = await googleAccessToken();
  const packageName = env('GOOGLE_PLAY_PACKAGE_NAME');
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(response.status, payload?.error?.message || 'Google Play lookup failed.');
  return payload;
}

async function googleAcknowledgeSubscription(productId: string, purchaseToken: string) {
  const accessToken = await googleAccessToken();
  const packageName = env('GOOGLE_PLAY_PACKAGE_NAME');
  await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    },
  );
}

async function googleAccessToken() {
  const serviceAccount = JSON.parse(env('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64urlJson(header)}.${base64urlJson(claims)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(String(serviceAccount.private_key || '').replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${base64urlBytes(new Uint8Array(signature))}`;
  const params = new URLSearchParams();
  params.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.set('assertion', assertion);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const payload = await response.json();
  if (!response.ok) throw new HttpError(response.status, payload?.error_description || 'Google auth failed.');
  return payload.access_token;
}

function decodeJwsPayload(jws: string) {
  const payload = jws.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
  } catch {
    return null;
  }
}

function fallbackExpiry(productId: string) {
  const days = productId.endsWith('.monthly') ? 31 : 366;
  return Date.now() + days * 86400000;
}

function base64urlJson(value: Record<string, unknown>) {
  return base64urlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64urlBytes(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s/g, '');
  return base64urlToStandardBytes(base64).buffer;
}

function base64urlToStandardBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
