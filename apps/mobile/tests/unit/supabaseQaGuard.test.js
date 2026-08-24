import assert from 'node:assert/strict';
import test from 'node:test';

import { describeSupabaseTarget, isLocalSupabaseUrl } from '../../src/supabaseQaGuard.js';

test('real-write QA guard allows only local Supabase targets', () => {
  assert.equal(isLocalSupabaseUrl('http://127.0.0.1:54321'), true);
  assert.equal(isLocalSupabaseUrl('http://localhost:54321'), true);
  assert.equal(isLocalSupabaseUrl('http://[::1]:54321'), true);
  assert.equal(isLocalSupabaseUrl('https://example.supabase.co'), false);
  assert.equal(isLocalSupabaseUrl('not-a-url'), false);
  assert.equal(isLocalSupabaseUrl(null), false);
});

test('real-write QA target description omits keys and paths', () => {
  assert.equal(describeSupabaseTarget('http://127.0.0.1:54321/rest/v1?apikey=secret'), 'http://127.0.0.1:54321');
  assert.equal(describeSupabaseTarget('https://example.supabase.co'), 'https://example.supabase.co');
  assert.equal(describeSupabaseTarget(''), 'missing Supabase URL');
  assert.equal(describeSupabaseTarget('nope'), 'invalid Supabase URL');
});
