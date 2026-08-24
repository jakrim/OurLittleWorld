import { env, HttpError, rpc } from '../_shared/billing.ts';
import {
  syncMarketingContacts,
  syncMarketingLifecycleEvents,
} from '../_shared/marketing.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  try {
    if (env('OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED') !== 'true') {
      throw new HttpError(503, 'Marketing synchronization is disabled.');
    }
    const suppliedToken = req.headers.get('x-olw-worker-secret') || '';
    const verifiedPayload = await rpc('verify_marketing_sync_worker_token', {
      target_token: suppliedToken,
    });
    const verified = Array.isArray(verifiedPayload)
      ? Boolean(verifiedPayload[0])
      : Boolean(verifiedPayload);
    if (!verified) throw new HttpError(401, 'Worker authentication failed.');

    const body = await req.json().catch(() => ({}));
    const requestedBatch = Number(body?.batch_size || 20);
    const batchSize = Number.isFinite(requestedBatch)
      ? Math.min(50, Math.max(1, Math.floor(requestedBatch)))
      : 20;
    const results = await syncMarketingContacts({ batchSize });
    const lifecycleResults = await syncMarketingLifecycleEvents({ batchSize });
    const healthPayload = await rpc('marketing_sync_health', {});
    const health = Array.isArray(healthPayload) ? healthPayload[0] || {} : healthPayload || {};
    const lifecycleHealthPayload = await rpc('marketing_lifecycle_health', {});
    const lifecycleHealth = Array.isArray(lifecycleHealthPayload)
      ? lifecycleHealthPayload[0] || {}
      : lifecycleHealthPayload || {};
    const counts = results.reduce((summary, result) => {
      summary[result.state] += 1;
      return summary;
    }, { synced: 0, pending: 0, retry: 0, blocked: 0 });
    const lifecycleCounts = lifecycleResults.reduce((summary, result) => {
      summary[result.state] += 1;
      return summary;
    }, { synced: 0, retry: 0, blocked: 0 });

    if (
      Number(health?.dead_letter_count || health?.blocked_count || 0) > 0
      || Number(lifecycleHealth?.quarantined || 0) > 0
    ) {
      console.error('marketing_sync_attention_required', {
        dead_letter_count: Number(health?.dead_letter_count || health?.blocked_count || 0),
        lifecycle_quarantined: Number(lifecycleHealth?.quarantined || 0),
        oldest_pending_at: health?.oldest_pending_at || null,
        lifecycle_oldest_due_at: lifecycleHealth?.oldest_due_at || null,
      });
    } else if (counts.pending > 0) {
      console.warn('marketing_sync_confirmation_pending', counts);
    } else {
      console.log('marketing_sync_completed', { contacts: counts, lifecycle: lifecycleCounts });
    }

    return response({
      processed: results.length,
      ...counts,
      health,
      lifecycle: {
        processed: lifecycleResults.length,
        ...lifecycleCounts,
        health: lifecycleHealth,
      },
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = status >= 500
      ? 'The service is temporarily unavailable.'
      : error instanceof Error ? error.message : 'Unexpected error.';
    return response({ error: message }, status);
  }
});

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
