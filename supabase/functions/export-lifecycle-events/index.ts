import { env, HttpError, rpc } from '../_shared/billing.ts';
import { exportLifecycleEvents } from '../_shared/lifecycle_export.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  try {
    if (env('OUR_LITTLE_WORLD_LIFECYCLE_EXPORT_ENABLED') !== 'true') {
      throw new HttpError(503, 'Lifecycle measurement export is disabled.');
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
    const results = await exportLifecycleEvents({ batchSize });
    const healthPayload = await rpc('marketing_measurement_health', {});
    const health = Array.isArray(healthPayload) ? healthPayload[0] || {} : healthPayload || {};
    const counts = results.reduce((summary, result) => {
      summary[result.state] += 1;
      return summary;
    }, { synced: 0, retry: 0, blocked: 0 });

    if (counts.blocked > 0 || Number(health?.quarantined || 0) > 0) {
      console.error('lifecycle_measurement_attention_required', {
        blocked: counts.blocked,
        quarantined: Number(health?.quarantined || 0),
      });
    } else {
      console.log('lifecycle_measurement_export_completed', counts);
    }

    return response({ processed: results.length, ...counts, health });
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
