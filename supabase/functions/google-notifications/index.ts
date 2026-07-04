import {
  HttpError,
  corsHeaders,
  env,
  errorResponse,
  json,
  readJson,
  recordBillingEvent,
  restPatch,
  rpc,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const expectedToken = env('GOOGLE_PUBSUB_VERIFICATION_TOKEN');
    if (expectedToken) {
      const url = new URL(req.url);
      const actual = url.searchParams.get('token') || req.headers.get('x-goog-channel-token') || '';
      if (actual !== expectedToken) throw new HttpError(403, 'Invalid Google notification token.');
    }

    const body = await readJson(req);
    const data = body.message?.data ? JSON.parse(atob(String(body.message.data))) : body;
    const notification = data.subscriptionNotification || {};
    const purchaseToken = String(notification.purchaseToken || '');
    const eventId = String(body.message?.messageId || data.eventTimeMillis || crypto.randomUUID());
    const status = mapGoogleNotificationStatus(Number(notification.notificationType));

    await recordBillingEvent({
      provider: 'google',
      eventId,
      eventType: `google.subscription.${notification.notificationType || 'notification'}`,
      payload: data,
    });

    if (purchaseToken && status) {
      const rows = await restPatch(
        'billing_subscriptions',
        `provider=eq.google&provider_subscription_id=eq.${encodeURIComponent(purchaseToken)}`,
        {
          status,
          latest_receipt: data,
        },
      );
      const saved = Array.isArray(rows) ? rows[0] : null;
      if (saved?.family_id) {
        await rpc('apply_family_entitlement', {
          target_family_id: saved.family_id,
          next_source: 'google',
          next_status: status,
          next_plan_key: saved.plan_key,
          next_billing_owner_user_id: saved.purchaser_user_id || null,
          next_billing_owner_email: null,
          next_provider_subscription_id: purchaseToken,
          next_starts_at: saved.current_period_start,
          next_expires_at: saved.current_period_end,
          next_grace_ends_at: status === 'grace_period' ? saved.current_period_end : null,
          next_metadata: { google_message_id: eventId },
        });
      }
    }

    return json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
});

function mapGoogleNotificationStatus(type: number) {
  if ([1, 2, 4, 7].includes(type)) return 'active';
  if (type === 6) return 'grace_period';
  if (type === 5) return 'past_due';
  if (type === 3) return 'canceled';
  if (type === 12) return 'refunded';
  if (type === 13) return 'expired';
  return null;
}
