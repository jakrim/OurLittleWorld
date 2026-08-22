import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeSupabaseTarget,
  isApprovedHostedQaSupabaseUrl,
  isApprovedRealWriteQaTarget,
  isLocalSupabaseUrl,
} from '../../src/supabaseQaGuard.js';

test('real-write QA guard allows only local Supabase targets', () => {
  assert.equal(isLocalSupabaseUrl('http://127.0.0.1:54321'), true);
  assert.equal(isLocalSupabaseUrl('http://localhost:54321'), true);
  assert.equal(isLocalSupabaseUrl('http://[::1]:54321'), true);
  assert.equal(isLocalSupabaseUrl('https://example.supabase.co'), false);
  assert.equal(isLocalSupabaseUrl('not-a-url'), false);
  assert.equal(isLocalSupabaseUrl(null), false);
});

test('hosted real-write QA accepts only the exact non-production project', () => {
  assert.equal(isApprovedHostedQaSupabaseUrl(
    'https://qaexample.supabase.co',
    'qaexample',
  ), true);
  assert.equal(isApprovedRealWriteQaTarget(
    'https://qaexample.supabase.co',
    'qaexample',
  ), true);
  assert.equal(isApprovedHostedQaSupabaseUrl(
    'https://other.supabase.co',
    'qaexample',
  ), false);
  assert.equal(isApprovedHostedQaSupabaseUrl(
    'http://qaexample.supabase.co',
    'qaexample',
  ), false);
  assert.equal(isApprovedHostedQaSupabaseUrl(
    'https://baxgullapuksjbzkogii.supabase.co',
    'baxgullapuksjbzkogii',
  ), false);
  assert.equal(isApprovedHostedQaSupabaseUrl(
    'https://qaexample.supabase.co.attacker.invalid',
    'qaexample',
  ), false);
});

test('real-write QA target description omits keys and paths', () => {
  assert.equal(describeSupabaseTarget('http://127.0.0.1:54321/rest/v1?apikey=secret'), 'http://127.0.0.1:54321');
  assert.equal(describeSupabaseTarget('https://example.supabase.co'), 'https://example.supabase.co');
  assert.equal(describeSupabaseTarget(''), 'missing Supabase URL');
  assert.equal(describeSupabaseTarget('nope'), 'invalid Supabase URL');
});
