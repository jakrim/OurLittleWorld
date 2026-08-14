import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WELCOME_ART_CYCLE_START,
  WELCOME_ART_REDUCED_MOTION_PROGRESS,
  welcomeArtRestingProgress,
} from '../../src/welcomeMotionModel.js';

test('the animated welcome starts with meaningful visible content', () => {
  assert.equal(welcomeArtRestingProgress(), WELCOME_ART_CYCLE_START);
  assert.ok(WELCOME_ART_CYCLE_START >= 0.18, 'the first streamed detail is fully visible');
  assert.ok(WELCOME_ART_CYCLE_START < 0.32, 'the first family-world stage remains in view');
});

test('Reduce Motion holds a fully rendered static illustration', () => {
  assert.equal(
    welcomeArtRestingProgress({ reducedMotion: true }),
    WELCOME_ART_REDUCED_MOTION_PROGRESS,
  );
  assert.equal(WELCOME_ART_REDUCED_MOTION_PROGRESS, 1);
});
