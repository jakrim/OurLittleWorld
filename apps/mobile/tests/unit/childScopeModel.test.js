import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  childIdForRow,
  childScopeContext,
  filterRowsForChildScope,
  normalizeChildId,
  rowMatchesChildScope,
} from '../../src/childScopeModel.js';

test('child scope helpers normalize active child ids', () => {
  assert.equal(normalizeChildId(' child-a '), 'child-a');
  assert.equal(normalizeChildId(''), null);
  assert.deepEqual(childScopeContext('child-a'), { childId: 'child-a', childScoped: true });
  assert.deepEqual(childScopeContext(null), { childId: null, childScoped: false });
});

test('child scope helpers read current and future row shapes', () => {
  assert.equal(childIdForRow({ child_id: 'child-a' }), 'child-a');
  assert.equal(childIdForRow({ childId: 'child-b' }), 'child-b');
  assert.equal(childIdForRow({ child: { id: 'child-c' } }), 'child-c');
  assert.equal(childIdForRow({ metadata: { childId: 'child-d' } }), 'child-d');
  assert.equal(childIdForRow({ moment_media: { metadata: { child_id: 'child-e' } } }), 'child-e');
});

test('child scope includes legacy rows until child_id backfill lands', () => {
  const rows = [
    { id: 'legacy' },
    { id: 'active-child', child_id: 'child-a' },
    { id: 'other-child', child_id: 'child-b' },
  ];

  assert.equal(rowMatchesChildScope(rows[0], 'child-a'), true);
  assert.equal(rowMatchesChildScope(rows[2], 'child-a'), false);
  assert.deepEqual(
    filterRowsForChildScope(rows, 'child-a').map((row) => row.id),
    ['legacy', 'active-child'],
  );
  assert.deepEqual(
    filterRowsForChildScope(rows, 'child-a', { includeUnscoped: false }).map((row) => row.id),
    ['active-child'],
  );
});
