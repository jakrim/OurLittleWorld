import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADD_INTENT_OPTIONS,
  buildAddIntentPresentation,
  normalizeAddIntent,
} from '../../src/addIntentModel.js';

test('add starts with four parent intentions instead of one large form', () => {
  assert.deepEqual(
    ADD_INTENT_OPTIONS.map((option) => option.title),
    ['Photos or a moment', 'Note to each other', 'Voice note', 'Letter to baby'],
  );
  assert.equal(ADD_INTENT_OPTIONS.find((option) => option.title === 'Letter to baby').route, '/letter-compose');
});

test('only in-sheet add intentions are accepted from route params', () => {
  assert.equal(normalizeAddIntent('moment'), 'moment');
  assert.equal(normalizeAddIntent(['partner-note']), 'partner-note');
  assert.equal(normalizeAddIntent('voice'), 'voice');
  assert.equal(normalizeAddIntent('letter'), null);
  assert.equal(normalizeAddIntent('book'), null);
});

test('co-parent notes are private shared timeline records without book language', () => {
  const presentation = buildAddIntentPresentation('partner-note', { babyName: 'Mina' });
  assert.equal(presentation.heading, 'Note to each other');
  assert.equal(presentation.defaultTitle, 'A note between us');
  assert.equal(presentation.showMedia, false);
  assert.equal(presentation.showVoice, false);
  assert.match(presentation.noteCaption, /shared family timeline/i);
  assert.doesNotMatch(JSON.stringify(presentation), /book/i);
});

test('voice notes can stand alone and retain the baby context', () => {
  const presentation = buildAddIntentPresentation('voice', { babyName: 'Mina' });
  assert.equal(presentation.showVoice, true);
  assert.equal(presentation.showMedia, false);
  assert.match(presentation.caption, /Mina/);
  assert.equal(presentation.saveLabel, 'Save voice note');
});
