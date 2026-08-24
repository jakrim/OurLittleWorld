import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTodayManualQaFixture } from '../../src/todayManualQaFixtures.js';

test('photo-first Today fixture is synthetic, bounded and queue-shaped', () => {
  const fixture = buildTodayManualQaFixture('photo-first');
  assert.equal(fixture.session.items.length, 4);
  assert.equal(fixture.summary.count, 4);
  assert.ok(fixture.session.items.every((item) => item.localUri.startsWith('data:image/svg+xml')));
  assert.ok(fixture.session.items.every((item) => item.state === 'queued'));
  assert.equal(buildTodayManualQaFixture('production'), null);
});
