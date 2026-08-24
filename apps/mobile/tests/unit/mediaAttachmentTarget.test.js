import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachmentTarget } from '../../src/mediaAttachmentTarget.js';

test('moment attachment payloads do not require letter columns', () => {
  const target = attachmentTarget({ familyId: 'family-1', momentId: 'moment-1' });

  assert.deepEqual(target, {
    id: 'moment-1',
    basePath: 'family-1/moments/moment-1',
    columns: { moment_id: 'moment-1' },
  });
  assert.equal(Object.hasOwn(target.columns, 'letter_id'), false);
});

test('letter attachment payloads use only the letter parent column', () => {
  const target = attachmentTarget({ familyId: 'family-1', letterId: 'letter-1' });

  assert.deepEqual(target, {
    id: 'letter-1',
    basePath: 'family-1/letters/letter-1',
    columns: { letter_id: 'letter-1' },
  });
  assert.equal(Object.hasOwn(target.columns, 'moment_id'), false);
});

test('attachments require exactly one parent', () => {
  assert.throws(
    () => attachmentTarget({ familyId: 'family-1' }),
    /exactly one moment or letter/,
  );
  assert.throws(
    () => attachmentTarget({
      familyId: 'family-1',
      momentId: 'moment-1',
      letterId: 'letter-1',
    }),
    /exactly one moment or letter/,
  );
});
