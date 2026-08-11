import assert from 'node:assert/strict';
import test from 'node:test';

import { ASSISTED_FIRST_COPY, assistedFirstPresentation } from '../../src/assistedFirstExperienceModel.js';

test('an assisted First leads with an uncertain candidate and parent confirmation', () => {
  const presentation = assistedFirstPresentation({ assisted: true });
  assert.deepEqual(presentation, {
    title: 'Could this be the moment?',
    showCandidateFirst: true,
    primaryAction: 'Confirm First',
    correctionActions: ['Correct date', 'Edit first title', 'Choose another'],
  });
  assert.match(ASSISTED_FIRST_COPY.dateCaption, /Nothing is asserted until you confirm/);
  assert.match(ASSISTED_FIRST_COPY.noteCaption, /Optional/);
});

test('ordinary and existing Firsts keep their distinct authoring modes', () => {
  assert.equal(assistedFirstPresentation().primaryAction, 'Save');
  assert.equal(assistedFirstPresentation({ existing: true }).title, 'edit this first');
});
