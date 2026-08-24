import {
  HttpError,
  corsHeaders,
  env,
  json,
  readJson,
  requiredEnv,
  requireUser,
  rpc,
  supabaseRequest,
} from '../_shared/billing.ts';
import {
  ACCOUNT_DELETION_STORAGE_BUCKET,
  isUuid,
  normalizeEmail,
  normalizeFamilyIds,
  normalizeFamilyStoragePaths,
  normalizeOtp,
  normalizeProviderObjectIds,
  normalizeStreamUids,
  providerCleanupSummary,
  publicDeletionPreview,
  requireDeletionConfirmation,
  splitStorageListing,
} from '../_shared/accountDeletion.ts';

class DeletionError extends HttpError {
  code: string;

  constructor(status: number, code: string, message: string) {
    super(status, message);
    this.code = code;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let requestId: string | null = null;
  let userId: string | null = null;
  let cleanupSummary = providerCleanupSummary();

  try {
    const { user } = await requireUser(req);
    userId = user.id;
    const body = await readJson(req);
    const action = String(body.action || 'delete').trim().toLowerCase();

    if (action === 'preview') {
      const preview = await rpc('preview_account_deletion', { target_user_id: user.id });
      return json({ preview: publicDeletionPreview(asRecord(preview)) });
    }
    if (action !== 'delete') throw new DeletionError(400, 'invalid_action', 'Deletion action is invalid.');

    requireDeletionConfirmation(body.confirmation);
    const proposedRequestId = String(body.requestId || body.request_id || '').trim();
    if (!isUuid(proposedRequestId)) {
      throw new DeletionError(400, 'invalid_request_id', 'Deletion request is invalid.');
    }

    const email = normalizeEmail(body.email);
    const otp = normalizeOtp(body.otp);
    if (!email || email !== normalizeEmail(user.email) || !otp) {
      throw new DeletionError(401, 'reauthentication_required', 'Enter the fresh code sent to your account email.');
    }
    await verifyDeletionOtp({ email, otp, expectedUserId: user.id });

    const started = asRecord(await rpc('begin_account_deletion', {
      target_user_id: user.id,
      proposed_request_id: proposedRequestId,
      reauthenticated_at: new Date().toISOString(),
    }));
    requestId = String(started.request_id || '');
    if (!isUuid(requestId)) throw new DeletionError(500, 'request_not_created', 'Account deletion could not start.');

    if (started.status === 'completed') {
      return json({ completed: true, requestId, result: completedResult() });
    }

    if (!['database_deleted', 'auth_deleting'].includes(String(started.status || ''))) {
      const familyIds = normalizeFamilyIds(started.sole_family_ids);
      const explicitPaths = normalizeFamilyStoragePathsForFamilies(familyIds, started.storage_paths);
      const storageDeleted = await deleteSupabaseStorage({ familyIds, explicitPaths });
      const streamDeleted = await deleteCloudflareStream({
        familyIds,
        knownUids: normalizeStreamUids(started.stream_uids),
      });
      const r2DeleteRequests = await deleteR2Originals({
        familyIds,
        objectIds: normalizeProviderObjectIds(started.r2_object_ids),
      });
      const stripeCanceled = await cancelStripeSubscriptions(started.stripe_subscription_ids);

      cleanupSummary = providerCleanupSummary({
        storageDeleted,
        streamDeleted,
        r2DeleteRequests,
        stripeCanceled,
      });
      await rpc('mark_account_deletion_status', {
        target_user_id: user.id,
        target_request_id: requestId,
        next_status: 'provider_cleaned',
        summary: cleanupSummary,
        error_code: null,
      });
      await rpc('finalize_account_deletion', {
        target_user_id: user.id,
        target_request_id: requestId,
      });
    }

    await rpc('mark_account_deletion_status', {
      target_user_id: user.id,
      target_request_id: requestId,
      next_status: 'auth_deleting',
      summary: {},
      error_code: null,
    });
    await deleteAuthUser(user.id);
    await rpc('mark_account_deletion_status', {
      target_user_id: user.id,
      target_request_id: requestId,
      next_status: 'completed',
      summary: {},
      error_code: null,
    }).catch(() => undefined);

    return json({
      completed: true,
      requestId,
      result: completedResult(),
    });
  } catch (error) {
    if (requestId && userId) {
      const code = error instanceof DeletionError ? error.code : 'cleanup_failed';
      await rpc('mark_account_deletion_status', {
        target_user_id: userId,
        target_request_id: requestId,
        next_status: 'cleanup_failed',
        summary: cleanupSummary,
        error_code: code,
      }).catch(() => undefined);
    }
    return deletionErrorResponse(error);
  }
});

async function verifyDeletionOtp({
  email,
  otp,
  expectedUserId,
}: {
  email: string;
  otp: string;
  expectedUserId: string;
}) {
  const response = await fetch(`${requiredEnv('SUPABASE_URL')}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      apikey: env('SUPABASE_ANON_KEY') || requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, token: otp, type: 'email' }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.user?.id !== expectedUserId) {
    throw new DeletionError(401, 'reauthentication_failed', 'That code is invalid or expired. Send a fresh code and try again.');
  }
}

async function deleteSupabaseStorage({
  familyIds,
  explicitPaths,
}: {
  familyIds: string[];
  explicitPaths: string[];
}) {
  if (!familyIds.length) return 0;
  const discovered = new Set(explicitPaths);
  for (const familyId of familyIds) {
    const paths = await listFamilyStoragePaths(familyId);
    paths.forEach((path) => discovered.add(path));
  }

  const paths = [...discovered].sort();
  for (let offset = 0; offset < paths.length; offset += 100) {
    const chunk = paths.slice(offset, offset + 100);
    await supabaseRequest(`/storage/v1/object/${ACCOUNT_DELETION_STORAGE_BUCKET}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: chunk }),
    });
  }

  for (const familyId of familyIds) {
    const remaining = await listFamilyStoragePaths(familyId);
    if (remaining.length) {
      throw new DeletionError(503, 'storage_cleanup_incomplete', 'Stored media cleanup did not finish. Try again.');
    }
  }
  return paths.length;
}

async function listFamilyStoragePaths(familyId: string) {
  const files = new Set<string>();
  const pending = [familyId];
  const visited = new Set<string>();

  while (pending.length) {
    const prefix = pending.shift() as string;
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    if (visited.size > 10000) {
      throw new DeletionError(503, 'storage_inventory_too_large', 'Stored media inventory could not finish safely.');
    }

    let offset = 0;
    while (true) {
      const entries = await supabaseRequest(
        `/storage/v1/object/list/${ACCOUNT_DELETION_STORAGE_BUCKET}`,
        {
          method: 'POST',
          body: JSON.stringify({
            prefix,
            limit: 1000,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          }),
        },
      );
      const page = Array.isArray(entries) ? entries as Array<Record<string, unknown>> : [];
      const split = splitStorageListing(familyId, prefix, page);
      split.files.forEach((path) => files.add(path));
      split.folders.forEach((folder) => {
        if (!visited.has(folder)) pending.push(folder);
      });
      if (page.length < 1000) break;
      offset += page.length;
    }
  }

  return [...files].sort();
}

async function deleteCloudflareStream({
  familyIds,
  knownUids,
}: {
  familyIds: string[];
  knownUids: string[];
}) {
  if (!familyIds.length && !knownUids.length) return 0;
  const accountId = env('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = env('CLOUDFLARE_API_TOKEN');
  if (!accountId || !apiToken) {
    if (isLocalSupabaseRuntime() && !knownUids.length) return 0;
    throw new DeletionError(503, 'stream_cleanup_unavailable', 'Video cleanup is temporarily unavailable. Try again.');
  }

  const familySet = new Set(familyIds);
  const uids = new Set(knownUids);
  let page = 1;
  let totalPages = 1;

  do {
    const response = await cloudflareRequest(
      accountId,
      apiToken,
      `/stream?per_page=1000&page=${page}`,
      { method: 'GET' },
    );
    const videos = Array.isArray(response?.result) ? response.result : [];
    for (const video of videos) {
      if (familySet.has(String(video?.meta?.familyId || ''))) {
        normalizeStreamUids([video?.uid]).forEach((uid) => uids.add(uid));
      }
    }
    totalPages = Math.max(1, Math.min(1000, Number(response?.result_info?.total_pages || 1)));
    page += 1;
  } while (page <= totalPages);

  const ids = [...uids];
  for (let offset = 0; offset < ids.length; offset += 10) {
    await Promise.all(ids.slice(offset, offset + 10).map((uid) =>
      cloudflareRequest(accountId, apiToken, `/stream/${encodeURIComponent(uid)}`, { method: 'DELETE' }, true)
    ));
  }
  return ids.length;
}

async function cloudflareRequest(
  accountId: string,
  apiToken: string,
  path: string,
  init: RequestInit,
  allowNotFound = false,
) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !(allowNotFound && response.status === 404)) {
    throw new DeletionError(503, 'stream_cleanup_failed', 'Video cleanup did not finish. Try again.');
  }
  return payload || {};
}

async function deleteR2Originals({
  familyIds,
  objectIds,
}: {
  familyIds: string[];
  objectIds: string[];
}) {
  if (!familyIds.length) return 0;
  const baseUrl = env('MEDIA_GATEWAY_INTERNAL_URL').replace(/\/+$/, '');
  const secret = env('MEDIA_DELETION_SECRET');
  if (!baseUrl || !secret) {
    if (isLocalSupabaseRuntime() && !objectIds.length) return 0;
    throw new DeletionError(503, 'original_cleanup_unavailable', 'Original-backup cleanup is temporarily unavailable. Try again.');
  }

  let requests = 0;
  for (const familyId of familyIds) {
    const response = await fetch(`${baseUrl}/internal/account-deletion`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ familyId, objectIds }),
    });
    if (!response.ok) {
      throw new DeletionError(503, 'original_cleanup_failed', 'Original-backup cleanup did not finish. Try again.');
    }
    requests += 1;
  }
  return requests;
}

async function cancelStripeSubscriptions(values: unknown) {
  const subscriptionIds = normalizeProviderObjectIds(values);
  if (!subscriptionIds.length) return 0;
  const secret = env('STRIPE_SECRET_KEY');
  if (!secret) {
    throw new DeletionError(503, 'billing_cleanup_unavailable', 'Web subscription cancellation is temporarily unavailable. Try again.');
  }

  for (const subscriptionId of subscriptionIds) {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!response.ok && response.status !== 404) {
      throw new DeletionError(503, 'billing_cleanup_failed', 'Web subscription cancellation did not finish. Try again.');
    }
  }
  return subscriptionIds.length;
}

async function deleteAuthUser(userId: string) {
  const response = await fetch(
    `${requiredEnv('SUPABASE_URL')}/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=false`,
    {
      method: 'DELETE',
      headers: {
        apikey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
        authorization: `Bearer ${requiredEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new DeletionError(503, 'auth_cleanup_failed', 'Account sign-in cleanup did not finish. Try again.');
  }
}

function normalizeFamilyStoragePathsForFamilies(familyIds: string[], values: unknown) {
  const paths = new Set<string>();
  for (const familyId of familyIds) {
    normalizeFamilyStoragePaths(familyId, values).forEach((path) => paths.add(path));
  }
  return [...paths].sort();
}

function completedResult() {
  return {
    accountDeleted: true,
    cameraRollOriginalsDeleted: false,
    sharedFamilyHistoryPreservedWhenOtherWritersRemain: true,
  };
}

function isLocalSupabaseRuntime() {
  try {
    const host = new URL(env('SUPABASE_URL')).hostname;
    return host === '127.0.0.1'
      || host === 'localhost'
      || host === 'host.docker.internal'
      || host === 'kong'
      || host.startsWith('supabase_kong_');
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, any> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, any>;
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function deletionErrorResponse(error: unknown) {
  if (error instanceof DeletionError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof Error && error.message === 'Type DELETE to confirm account deletion.') {
    return json({ error: error.message, code: 'confirmation_required' }, 400);
  }
  return json({
    error: 'Account deletion did not finish. Send a fresh code and try again.',
    code: 'deletion_failed',
  }, 500);
}
