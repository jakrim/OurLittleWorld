import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAddMomentState } from '../../src/addMomentModel.js';

test('media-only, voice-only, and text-only moments can be saved', () => {
  assert.equal(buildAddMomentState({ assets: [{ uri: 'file:///photo.jpg' }] }).canSave, true);
  assert.equal(buildAddMomentState({ voice: { uri: 'file:///voice.m4a' } }).canSave, true);
  assert.equal(buildAddMomentState({ note: 'One quick line.' }).canSave, true);
});

test('title, place, and tags are secondary context, not required content', () => {
  const contextOnly = buildAddMomentState({
    title: 'Bath time',
    place: 'Kitchen',
    tags: ['first'],
  });
  assert.equal(contextOnly.hasContext, true);
  assert.equal(contextOnly.hasPrimaryContent, false);
  assert.equal(contextOnly.canSave, false);
});

test('context controls appear only after primary content or existing context', () => {
  assert.equal(buildAddMomentState({}).canShowContext, false);
  assert.equal(buildAddMomentState({ note: 'Tiny memory.' }).canShowContext, true);
  assert.equal(buildAddMomentState({ assets: [{ uri: 'file:///clip.mov' }] }).canShowContext, true);
  assert.equal(buildAddMomentState({ voice: { uri: 'file:///voice.m4a' } }).canShowContext, true);
  assert.equal(buildAddMomentState({ title: 'Already typed' }).canShowContext, true);
});

test('add moment state carries an optional child scope for the future new-baby flow', () => {
  const state = buildAddMomentState({
    note: 'Tiny memory.',
    childId: 'child-a',
  });

  assert.equal(state.childId, 'child-a');
  assert.equal(state.childScoped, true);
  assert.equal(state.canSave, true);
});
