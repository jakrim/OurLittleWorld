import assert from 'node:assert/strict';
import test from 'node:test';

import { hasReadOnlyArchiveAccess } from '../../src/entitlementAccessModel.js';

test('active and historical subscribers retain archive access', () => {
  assert.equal(hasReadOnlyArchiveAccess({ status: 'active', isActive: true }), true);
  assert.equal(hasReadOnlyArchiveAccess({ status: 'canceled', isActive: false }), true);
  assert.equal(hasReadOnlyArchiveAccess({ status: 'expired', isActive: false }), true);
  assert.equal(hasReadOnlyArchiveAccess({ status: 'past_due', isActive: false }), true);
});

test('a family that never activated a plan still enters purchase setup', () => {
  assert.equal(hasReadOnlyArchiveAccess(null), false);
  assert.equal(hasReadOnlyArchiveAccess({ status: 'inactive', isActive: false }), false);
});
