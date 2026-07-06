import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mediaUploadMetadata } from '../../src/mediaUploadMetadataModel.js';

test('quality signals ride along when the scan produced them', () => {
  assert.deepEqual(
    mediaUploadMetadata(
      { source: 'library-review', fullPath: 'f/full/x.jpg' },
      { captureQuality: 0.82, score: 0.91, faceCount: 1 },
    ),
    {
      source: 'library-review',
      fullPath: 'f/full/x.jpg',
      captureQuality: 0.82,
      recognitionScore: 0.91,
      faceCount: 1,
    },
  );
});

test('missing or junk signals are omitted, not written as null', () => {
  assert.deepEqual(
    mediaUploadMetadata({ source: 'manual' }, { captureQuality: null, score: 'junk' }),
    { source: 'manual' },
  );
  assert.deepEqual(mediaUploadMetadata({ source: 'manual' }, null), { source: 'manual' });
  assert.deepEqual(mediaUploadMetadata(), {});
});
