import {
  assertEquals,
} from 'jsr:@std/assert@1';

import worker from './index.js';
import { accountDeletionMarkerKey, handleAccountDeletion } from './accountDeletion.js';

const FAMILY_ID = '10000000-0000-4000-8000-000000000001';

Deno.test('R2 account deletion is authenticated and family-prefixed', async () => {
  const deleted = [];
  const written = [];
  const objects = new Set([`${FAMILY_ID}/orphan-original`]);
  const env = {
    MEDIA_DELETION_SECRET: 'test-secret',
    ORIGINALS: {
      delete: (keys) => {
        deleted.push(...keys);
        keys.forEach((key) => objects.delete(key));
      },
      put: (key) => written.push(key),
      list: ({ prefix }) => ({
        objects: [...objects]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key })),
        truncated: false,
      }),
    },
  };
  const response = await handleAccountDeletion(new Request('https://worker.test/internal/account-deletion', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      familyId: FAMILY_ID,
      objectIds: ['original-1', '../other-family', 'original-1'],
    }),
  }), env);

  assertEquals(response.status, 200);
  assertEquals(written, [accountDeletionMarkerKey(FAMILY_ID)]);
  assertEquals(deleted, [`${FAMILY_ID}/original-1`, `${FAMILY_ID}/orphan-original`]);
  assertEquals(await response.json(), { deletedCount: 2, verified: true });
});

Deno.test('R2 account deletion rejects missing secret and invalid family', async () => {
  const binding = { delete: () => {}, list: () => ({ objects: [], truncated: false }), put: () => {} };
  const unauthorized = await handleAccountDeletion(new Request('https://worker.test/internal/account-deletion', {
    method: 'POST',
    body: '{}',
  }), { MEDIA_DELETION_SECRET: 'test-secret', ORIGINALS: binding });
  assertEquals(unauthorized.status, 401);

  const invalid = await handleAccountDeletion(new Request('https://worker.test/internal/account-deletion', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ familyId: '../family', objectIds: ['original-1'] }),
  }), { MEDIA_DELETION_SECRET: 'test-secret', ORIGINALS: binding });
  assertEquals(invalid.status, 400);
});

Deno.test('R2 account deletion fails closed when verification finds leftovers', async () => {
  const response = await handleAccountDeletion(new Request('https://worker.test/internal/account-deletion', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ familyId: FAMILY_ID, objectIds: ['original-1'] }),
  }), {
    MEDIA_DELETION_SECRET: 'test-secret',
    ORIGINALS: {
      delete: () => {},
      put: () => {},
      list: () => ({ objects: [{ key: `${FAMILY_ID}/original-1` }], truncated: false }),
    },
  });
  assertEquals(response.status, 503);
});

Deno.test('deleted-family marker overrides a valid media session before cache lookup', async () => {
  const secret = 'media-session-test-secret';
  const expires = Math.floor(Date.now() / 1000) + 60;
  const body = base64url(new TextEncoder().encode(JSON.stringify({
    f: FAMILY_ID,
    u: '10000000-0000-4000-8000-000000000002',
    t: 'vault',
    exp: expires,
  })));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const token = `${body}.${base64url(new Uint8Array(signature))}`;

  const response = await worker.fetch(
    new Request(`https://worker.test/media/${FAMILY_ID}/original/original-1?session=${token}`),
    {
      MEDIA_SESSION_SECRET: secret,
      ORIGINALS: {
        head: (objectKey) => objectKey === accountDeletionMarkerKey(FAMILY_ID) ? {} : null,
      },
    },
    { waitUntil: () => {} },
  );

  assertEquals(response.status, 410);
  assertEquals(response.headers.get('x-olw-cache'), 'denied');
});

function base64url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
