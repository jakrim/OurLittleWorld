import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestPromptPhoto,
  collapsePlacePhotosIntoEvents,
  groupArchiveRecordsForPresentation,
} from '../../src/familyPhotoPresentationModel.js';

function record(id, seconds, quality, extra = {}) {
  return {
    key: `moment:${id}`,
    capturedAt: `2026-07-16T12:00:${String(seconds).padStart(2, '0')}Z`,
    imageCount: 1,
    videoCount: 0,
    voiceCount: 0,
    tags: ['photo'],
    moment: {
      id,
      media: [{ metadata: { captureQuality: quality } }],
    },
    ...extra,
  };
}

test('timeline presentation folds an uncaptioned three-second burst around its clearest record', () => {
  const groups = groupArchiveRecordsForPresentation([
    record('soft', 1, 0.2),
    record('best', 2, 0.91),
    record('okay', 3, 0.5),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].representative.moment.id, 'best');
  assert.equal(groups[0].hiddenCount, 2);
});

test('timeline presentation never folds parent-authored context into another moment', () => {
  const groups = groupArchiveRecordsForPresentation([
    record('plain', 1, 0.8),
    record('captioned', 2, 0.7, { moment: { id: 'captioned', title: 'First laugh', media: [] } }),
  ]);

  assert.equal(groups.length, 2);
});

test('place presentation shows one representative per saved moment', () => {
  const groups = collapsePlacePhotosIntoEvents([
    { asset_id: 'a', moment_id: 'm1', creation_time: '2026-07-16T12:00:00Z', moment_media: { metadata: { captureQuality: 0.2 } } },
    { asset_id: 'b', moment_id: 'm1', creation_time: '2026-07-16T12:00:01Z', moment_media: { metadata: { captureQuality: 0.9 } } },
    { asset_id: 'c', moment_id: 'm2', creation_time: '2026-07-16T13:00:00Z' },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.momentId === 'm1').representative.asset_id, 'b');
});

test('prompt photo prefers the clearest saved photo from the prompt day', () => {
  const chosen = bestPromptPhoto([
    { asset_id: 'old', creation_time: '2026-07-15T12:00:00Z', moment_media: { metadata: { captureQuality: 1 } } },
    { asset_id: 'soft', creation_time: '2026-07-16T12:00:00Z', moment_media: { metadata: { captureQuality: 0.2 } } },
    { asset_id: 'clear', creation_time: '2026-07-16T12:00:01Z', moment_media: { metadata: { captureQuality: 0.9 } } },
  ], { promptDate: '2026-07-16' });

  assert.equal(chosen.asset_id, 'clear');
});
