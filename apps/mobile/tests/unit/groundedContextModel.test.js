import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeGroundedMomentContext,
  groundedContextAnalytics,
  nearestConfirmedFirst,
  safePlaceLabel,
} from '../../src/groundedContextModel.js';

const capture = '2025-08-14T14:00:00.000Z';

test('composes only date, age, parent place, confirmed First, and saved-event facts', () => {
  const facts = composeGroundedMomentContext({
    capturedAt: capture,
    babyBirthday: '2025-07-23',
    placeName: 'Home',
    contextFacts: [{
      source_id: 'first-1',
      first: { id: 'first-1', title: 'Rolled over', happened_at: '2025-08-02T12:00:00Z', done: true },
    }],
    eventCompanions: [{ momentId: 'a' }, { momentId: 'b' }],
    locale: 'en-US',
  });
  assert.deepEqual(facts.map((fact) => fact.key), ['age', 'place', 'first:first-1', 'shared-event']);
  assert.match(facts[0].label, /Day 23/);
  assert.match(facts[2].label, /12 days after/);
  assert.match(facts[2].label, /your family saved/);
  assert.doesNotMatch(facts.map((fact) => fact.label).join(' '), /emotion|development|confidence|score/i);
});

test('chooses the nearest confirmed source deterministically', () => {
  assert.equal(nearestConfirmedFirst([
    { sourceId: 'later', title: 'Sat', happenedAt: '2025-08-20', done: true },
    { sourceId: 'near', title: 'Waved', happenedAt: '2025-08-13', done: true },
    { sourceId: 'dismissed', title: 'No', happenedAt: '2025-08-14', done: false },
  ], capture)?.sourceId, 'near');
});

test('rejects coordinates and bounds analytics to fixed non-content fields', () => {
  assert.equal(safePlaceLabel('40.7812, -73.9665'), '');
  assert.equal(safePlaceLabel('Central Park'), 'Central Park');
  assert.deepEqual(groundedContextAnalytics([
    { key: 'age' }, { key: 'first:secret-title' }, { key: 'private-value' },
  ]), { fact_count: 3, fact_kinds: ['age', 'first'] });
});
