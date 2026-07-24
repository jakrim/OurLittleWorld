import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function source(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('account deletion remains reachable across lifecycle and entitlement gates', () => {
  const settingsRoute = source('app/settings-menu.jsx');
  const deletionRoute = source('app/delete-account.jsx');
  for (const contract of [
    'allowMissingFamily',
    'allowIncompleteSetup',
    'allowFirstLook',
    'allowFirstValue',
    'allowMissingSubscription',
    'allowReadOnlyArchive',
  ]) {
    assert.match(settingsRoute, new RegExp(contract));
    assert.match(deletionRoute, new RegExp(contract));
  }
});

test('deletion UI offers export and has no analytics transport', () => {
  const screen = source('src/DeleteAccountScreen.js');
  assert.match(screen, /Open archive export/);
  assert.match(screen, /Send deletion code/);
  assert.match(screen, /Permanently delete account/);
  assert.doesNotMatch(screen, /trackAnalyticsEvent|PostHog|Sentry|captureException/);
});

test('sign-out and revoked-session paths clear private local account state', () => {
  const auth = source('src/AuthContext.js');
  assert.match(auth, /isRevokedSessionError/);
  assert.match(auth, /event === 'SIGNED_OUT'/);
  assert.ok((auth.match(/clearDeletedAccountLocalData/g) || []).length >= 3);
});

test('server contract is service-only, role-locked, and aggregate-audited', () => {
  const migration = source('../../supabase/migrations/20260724120000_account_deletion_lifecycle.sql');
  const edge = source('../../supabase/functions/delete-account/index.ts');
  assert.match(migration, /revoke all on table public\.account_deletion_requests from public, anon, authenticated/);
  assert.match(migration, /family account deletion is in progress/);
  assert.match(migration, /account deletion is blocked by a legal hold/);
  assert.match(edge, /providerCleanupSummary/);
  assert.doesNotMatch(edge, /console\.(log|warn|error)/);
});
