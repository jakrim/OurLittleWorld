const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const MAX_REQUEST_BYTES = 1024 * 1024;

export function accountDeletionMarkerKey(familyId) {
  return `_account-deletions/${familyId}`;
}

export async function handleAccountDeletion(request, env) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  if (!env.MEDIA_DELETION_SECRET || !await authorized(request, env.MEDIA_DELETION_SECRET)) {
    return response({ error: 'Unauthorized.' }, 401);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) return response({ error: 'Request is too large.' }, 413);
  if (!env.ORIGINALS?.delete || !env.ORIGINALS?.list || !env.ORIGINALS?.put) {
    return response({ error: 'Original storage is unavailable.' }, 503);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return response({ error: 'Request is too large.' }, 413);
  }
  const body = parseJson(rawBody);
  const familyId = String(body?.familyId || '').trim();
  if (!UUID_PATTERN.test(familyId)) return response({ error: 'Family is invalid.' }, 400);

  // Persist a non-content denial marker before deletion. Existing media
  // sessions can remain cryptographically valid for up to twenty minutes,
  // and Cache API entries may outlive the R2 object. The read path checks this
  // marker before cache lookup so neither can expose a deleted-family original.
  await env.ORIGINALS.put(
    accountDeletionMarkerKey(familyId),
    JSON.stringify({ deleted: true }),
    { httpMetadata: { contentType: 'application/json' } },
  );

  const objectIds = [...new Set((Array.isArray(body?.objectIds) ? body.objectIds : [])
    .map((value) => String(value || '').trim())
    .filter((value) => OBJECT_ID_PATTERN.test(value)))]
    .slice(0, 5000);
  const prefix = `${familyId}/`;
  const keys = new Set(objectIds.map((objectId) => `${prefix}${objectId}`));
  let cursor;
  do {
    const page = await env.ORIGINALS.list({
      prefix,
      cursor,
      limit: 1000,
    });
    for (const object of page?.objects || []) {
      if (String(object?.key || '').startsWith(prefix)) keys.add(object.key);
    }
    if (keys.size > 100000) {
      return response({ error: 'Original inventory is too large to delete safely.' }, 503);
    }
    if (page?.truncated && !page?.cursor) {
      return response({ error: 'Original inventory did not finish.' }, 503);
    }
    cursor = page?.truncated ? page.cursor : undefined;
  } while (cursor);

  const keyList = [...keys];
  for (let offset = 0; offset < keyList.length; offset += 1000) {
    await env.ORIGINALS.delete(keyList.slice(offset, offset + 1000));
  }

  const verification = await env.ORIGINALS.list({ prefix, limit: 1 });
  if ((verification?.objects || []).length || verification?.truncated) {
    return response({ error: 'Original cleanup did not finish.' }, 503);
  }

  return response({ deletedCount: keyList.length, verified: true });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function authorized(request, expectedSecret) {
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(String(expectedSecret))),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(suppliedHash, expectedHash);
  }
  return timingSafeEqual(new Uint8Array(suppliedHash), new Uint8Array(expectedHash));
}

function timingSafeEqual(a, b) {
  const length = Math.max(a.length, b.length);
  let different = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    different |= (a[index] || 0) ^ (b[index] || 0);
  }
  return different === 0;
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
