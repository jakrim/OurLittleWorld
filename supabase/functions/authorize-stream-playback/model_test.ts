import { assertEquals } from 'jsr:@std/assert@1';

import { canonicalStreamAuthorizationInput, safeSecretEqual } from './model.ts';

Deno.test('canonical Stream authorization accepts only bounded opaque identities', () => {
  assertEquals(canonicalStreamAuthorizationInput({
    familyId: '10000000-0000-4000-8000-000000000001',
    userId: '20000000-0000-4000-8000-000000000002',
    providerObjectId: 'stream-safe_123',
  }), {
    familyId: '10000000-0000-4000-8000-000000000001',
    userId: '20000000-0000-4000-8000-000000000002',
    providerObjectId: 'stream-safe_123',
  });
  assertEquals(canonicalStreamAuthorizationInput({
    familyId: 'not-a-family',
    userId: '20000000-0000-4000-8000-000000000002',
    providerObjectId: '../provider-capability',
  }), null);
});

Deno.test('gateway authentication requires the exact dedicated secret', async () => {
  assertEquals(await safeSecretEqual('gateway-secret', 'gateway-secret'), true);
  assertEquals(await safeSecretEqual('gateway-secret', 'another-secret'), false);
  assertEquals(await safeSecretEqual('', 'gateway-secret'), false);
});
