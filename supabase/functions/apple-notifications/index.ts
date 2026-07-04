import {
  corsHeaders,
  errorResponse,
  json,
  readJson,
  recordBillingEvent,
  restPatch,
  restSelect,
  rpc,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await readJson(req);
    const notification = decodeJwsPayload(String(body.signedPayload || '')) || body;
    const data = notification.data || {};
    const transaction = decodeJwsPayload(String(data.signedTransactionInfo || '')) || {};
    const originalId = String(transaction.originalTransactionId || '');
    const eventId = String(notification.notificationUUID || crypto.randomUUID());
    const status = mapAppleNotificationStatus(notification.notificationType, notification.subtype);

    await recordBillingEvent({
      provider: 'apple',
      eventId,
      eventType: `apple.${notification.notificationType || 'notification'}`,
      payload: notification,
    });

    if (originalId && status) {
      const rows = await restPatch(
        'billing_subscriptions',
        `provider=eq.apple&provider_original_id=eq.${encodeURIComponent(originalId)}`,
        {
          status,
          current_period_end: transaction.expiresDate ? new Date(Number(transaction.expiresDate)).toISOString() : null,
          latest_receipt: notification,
        },
      );
      const saved = Array.isArray(rows) ? rows[0] : null;
      if (saved?.family_id) {
        await rpc('apply_family_entitlement', {
          target_family_id: saved.family_id,
          next_source: 'apple',
          next_status: status,
          next_plan_key: saved.plan_key,
          next_billing_owner_user_id: saved.purchaser_user_id || null,
          next_billing_owner_email: null,
          next_provider_subscription_id: saved.provider_subscription_id,
          next_starts_at: saved.current_period_start,
          next_expires_at: transaction.expiresDate ? new Date(Number(transaction.expiresDate)).toISOString() : saved.current_period_end,
          next_grace_ends_at: status === 'grace_period' ? new Date(Number(transaction.expiresDate)).toISOString() : null,
          next_metadata: { apple_notification_uuid: eventId },
        });
      }
    } else if (originalId) {
      await restSelect(
        'billing_subscriptions',
        `provider=eq.apple&provider_original_id=eq.${encodeURIComponent(originalId)}&select=id&limit=1`,
      );
    }

    return json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
});

function mapAppleNotificationStatus(type?: string, subtype?: string) {
  if (type === 'DID_RENEW' || type === 'SUBSCRIBED' || type === 'DID_CHANGE_RENEWAL_STATUS') return 'active';
  if (type === 'DID_FAIL_TO_RENEW' && subtype === 'GRACE_PERIOD') return 'grace_period';
  if (type === 'DID_FAIL_TO_RENEW') return 'past_due';
  if (type === 'EXPIRED') return 'expired';
  if (type === 'REFUND' || type === 'REFUND_REVERSED') return type === 'REFUND' ? 'refunded' : 'active';
  if (type === 'REVOKE') return 'refunded';
  return null;
}

function decodeJwsPayload(jws: string) {
  const payload = jws.split('.')[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
