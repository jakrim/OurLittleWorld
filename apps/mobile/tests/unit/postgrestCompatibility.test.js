import assert from 'node:assert/strict';
import test from 'node:test';

import { isMissingPostgrestRelationship } from '../../src/postgrestCompatibility.js';

test('detects deployed PostgREST relationship-cache misses without masking ordinary errors', () => {
  assert.equal(isMissingPostgrestRelationship({ code: 'PGRST200' }), true);
  assert.equal(isMissingPostgrestRelationship({ message: "Could not find a relationship between 'moments' and 'moment_media' in the schema cache" }), true);
  assert.equal(isMissingPostgrestRelationship({ code: '42501', message: 'permission denied' }), false);
});
