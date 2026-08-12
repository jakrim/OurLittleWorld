import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldBlockBillingGateDuringRefresh } from '../../src/billingRefreshModel.js';

test('routine entitlement refreshes preserve the current product screen', () => {
  assert.equal(shouldBlockBillingGateDuringRefresh(), false);
  assert.equal(shouldBlockBillingGateDuringRefresh({}), false);
  assert.equal(shouldBlockBillingGateDuringRefresh({ showLoading: false }), false);
});

test('only bootstrap refreshes block the app gate', () => {
  assert.equal(shouldBlockBillingGateDuringRefresh({ showLoading: true }), true);
});
