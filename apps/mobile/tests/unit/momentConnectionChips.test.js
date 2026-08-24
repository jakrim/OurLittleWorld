import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMomentConnectionChips } from '../../src/momentConnectionChips.js';

const baseMoment = {
  id: 'moment-1',
  captured_at: '2026-07-06T14:00:00.000Z',
  media: [{ id: 'media-1', media_type: 'image' }],
  voiceNotes: [{ id: 'voice-1' }],
  caption_note: 'One real line from the day.',
  place_name: 'Kitchen',
};

test('confirmed firsts, letters, and the weekly recap render as understandable connections', () => {
  const chips = buildMomentConnectionChips({
    moment: baseMoment,
    firsts: [{ id: 'first-1', title: 'First steps' }],
    letters: [{ id: 'letter-1', title: 'A line for later' }],
    digest: { id: 'digest-1', headline: 'A week of small arrivals.' },
    canWrite: true,
  });

  assert.deepEqual(chips.map((chip) => chip.key), [
    'first',
    'letter',
    'digest',
  ]);
  assert.deepEqual(chips[0].route, {
    pathname: '/first-compose',
    params: { id: 'first-1', momentId: 'moment-1' },
  });
  assert.deepEqual(chips[1].route, {
    pathname: '/letter-detail',
    params: { id: 'letter-1' },
  });
  assert.equal(chips[2].label, 'Weekly recap');
  assert.equal(chips.every((chip) => chip.group === 'connection'), true);
});

test('unconfirmed firsts and letters are framed as possible actions, not existing links', () => {
  const chips = buildMomentConnectionChips({
    moment: {
      id: 'moment-2',
      captured_at: '2026-07-06T14:00:00.000Z',
      media: [{ id: 'media-2', media_type: 'video' }],
      voiceNotes: [],
      caption_note: '',
      place_name: '',
    },
    firsts: [],
    letters: [],
    canWrite: true,
    childId: 'child-a',
  });

  assert.deepEqual(chips.map((chip) => chip.label), [
    'Mark a first',
    'Write letter',
    'Add a note',
  ]);
  assert.equal(chips.some((chip) => chip.label === 'First'), false);
  assert.equal(chips.some((chip) => chip.label === 'Letter'), false);
  assert.deepEqual(chips[0].route.params, {
    momentId: 'moment-2',
    sourceMomentId: 'moment-2',
    seedDate: '2026-07-06',
    childId: 'child-a',
  });
  assert.deepEqual(chips[1].route.params, {
    sourceMomentId: 'moment-2',
    childId: 'child-a',
  });
  assert.equal(chips[2].action, 'edit');
  assert.equal(chips.every((chip) => chip.group === 'action'), true);
});

test('read-only viewers see only confirmed connections', () => {
  const chips = buildMomentConnectionChips({
    moment: {
      id: 'moment-3',
      media: [{ id: 'media-3', media_type: 'image' }],
      voiceNotes: [],
    },
    firsts: [],
    letters: [],
    canWrite: false,
  });

  assert.deepEqual(chips, []);
});
