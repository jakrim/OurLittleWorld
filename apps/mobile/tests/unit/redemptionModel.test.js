import assert from 'node:assert/strict';
import test from 'node:test';

import { redemptionAnalyticsProperties, redemptionStatus } from '../../src/redemptionModel.js';

test('website subscription codes are not classified as gifts', () => {
  assert.deepEqual(redemptionAnalyticsProperties({ source: 'stripe' }), {
    redemption_type: 'website',
    plan_state_after: 'active',
  });
});

test('gift and partner codes retain their distinct classifications', () => {
  assert.deepEqual(redemptionAnalyticsProperties({ source: 'gift' }), {
    redemption_type: 'gift',
    plan_state_after: 'gift',
  });
  assert.deepEqual(redemptionAnalyticsProperties({ source: 'partner' }), {
    redemption_type: 'partner',
    plan_state_after: 'active',
  });
});

test('server redemption message is preferred when available', () => {
  assert.equal(redemptionStatus({ message: 'Website subscription connected.' }, 'Code redeemed.'), 'Website subscription connected.');
  assert.equal(redemptionStatus(null, 'Code redeemed.'), 'Code redeemed.');
});
