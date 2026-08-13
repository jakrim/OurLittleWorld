import { errorResponse, HttpError, json, readJson, requiredEnv, rpc } from '../_shared/billing.ts';
import { canonicalStreamAuthorizationInput, safeSecretEqual } from './model.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const suppliedSecret = req.headers.get('x-olw-media-gateway-secret') || '';
    if (!await safeSecretEqual(suppliedSecret, requiredEnv('MEDIA_GATEWAY_AUTH_SECRET'))) {
      throw new HttpError(401, 'Gateway authentication failed.');
    }
    const input = canonicalStreamAuthorizationInput(await readJson(req));
    if (!input) throw new HttpError(400, 'Stream authorization scope is invalid.');

    const result = await rpc('authorize_canonical_stream_playback', {
      target_family_id: input.familyId,
      target_user_id: input.userId,
      p_provider_object_id: input.providerObjectId,
    });
    return response({ authorized: result === true });
  } catch (error) {
    return noStore(errorResponse(error));
  }
});

function response(body: Record<string, unknown>, status = 200) {
  return noStore(json(body, status));
}

function noStore(value: Response) {
  const headers = new Headers(value.headers);
  headers.set('cache-control', 'no-store');
  return new Response(value.body, { status: value.status, headers });
}
