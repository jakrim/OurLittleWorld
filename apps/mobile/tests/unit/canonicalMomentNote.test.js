import assert from 'node:assert/strict';
import test from 'node:test';

import { saveCanonicalMomentNote } from '../../src/canonicalMomentNote.js';

const scope = {
  familyId: 'family-a',
  momentId: 'moment-1',
  note: '  Those bright eyes  ',
  now: new Date('2026-08-12T21:00:00.000Z'),
};

test('canonical note write is family scoped and confirms the exact saved value', async () => {
  const runtime = postgrestRuntime({
    data: { id: 'moment-1', family_id: 'family-a', caption_note: 'Those bright eyes' },
    error: null,
  });

  const saved = await saveCanonicalMomentNote({ client: runtime.client, ...scope });

  assert.equal(saved.caption_note, 'Those bright eyes');
  assert.deepEqual(runtime.calls, [
    ['from', 'moments'],
    ['update', { caption_note: 'Those bright eyes', updated_at: '2026-08-12T21:00:00.000Z' }],
    ['eq', 'family_id', 'family-a'],
    ['eq', 'id', 'moment-1'],
    ['select', 'id, family_id, caption_note'],
    ['single'],
  ]);
});

test('zero rows and any returned scope or value mismatch fail closed', async () => {
  const unconfirmedResults = [
    { data: null, error: null },
    { data: { id: 'moment-other', family_id: 'family-a', caption_note: 'Those bright eyes' }, error: null },
    { data: { id: 'moment-1', family_id: 'family-b', caption_note: 'Those bright eyes' }, error: null },
    { data: { id: 'moment-1', family_id: 'family-a', caption_note: 'Different words' }, error: null },
  ];

  for (const result of unconfirmedResults) {
    const runtime = postgrestRuntime(result);
    await assert.rejects(
      saveCanonicalMomentNote({ client: runtime.client, ...scope }),
      /Canonical memory note write was not confirmed/,
    );
  }
});

test('PostgREST errors remain failures instead of completing the text step', async () => {
  const providerError = new Error('write denied');
  const runtime = postgrestRuntime({ data: null, error: providerError });

  await assert.rejects(
    saveCanonicalMomentNote({ client: runtime.client, ...scope }),
    (error) => error === providerError,
  );
});

function postgrestRuntime(result) {
  const calls = [];
  const query = {
    update(value) {
      calls.push(['update', value]);
      return query;
    },
    eq(column, value) {
      calls.push(['eq', column, value]);
      return query;
    },
    select(value) {
      calls.push(['select', value]);
      return query;
    },
    async single() {
      calls.push(['single']);
      return result;
    },
  };
  return {
    calls,
    client: {
      from(table) {
        calls.push(['from', table]);
        return query;
      },
    },
  };
}
