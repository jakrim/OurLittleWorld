import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isManualQaRuntime,
  isSyntheticManualQaRoute,
} from '../../src/manualQaRuntime.js';

test('manual QA stays off in non-development runtimes unless an explicit local build flag enables it', () => {
  const previous = process.env.EXPO_PUBLIC_OLW_MANUAL_QA;
  delete process.env.EXPO_PUBLIC_OLW_MANUAL_QA;
  assert.equal(isManualQaRuntime(), false);
  process.env.EXPO_PUBLIC_OLW_MANUAL_QA = 'false';
  assert.equal(isManualQaRuntime(), false);
  process.env.EXPO_PUBLIC_OLW_MANUAL_QA = 'true';
  assert.equal(isManualQaRuntime(), true);
  if (previous == null) delete process.env.EXPO_PUBLIC_OLW_MANUAL_QA;
  else process.env.EXPO_PUBLIC_OLW_MANUAL_QA = previous;
});

test('synthetic QA routes require a known fixture name and an explicit QA runtime', () => {
  const previous = process.env.EXPO_PUBLIC_OLW_MANUAL_QA;
  process.env.EXPO_PUBLIC_OLW_MANUAL_QA = 'false';
  assert.equal(isSyntheticManualQaRoute('photo-first'), false);

  process.env.EXPO_PUBLIC_OLW_MANUAL_QA = 'true';
  assert.equal(isSyntheticManualQaRoute('photo-first'), true);
  assert.equal(isSyntheticManualQaRoute([' PHOTO-FIRST ']), true);
  assert.equal(isSyntheticManualQaRoute('large-no-firsts'), true);
  assert.equal(isSyntheticManualQaRoute('anything-else'), false);
  assert.equal(isSyntheticManualQaRoute(null), false);

  if (previous == null) delete process.env.EXPO_PUBLIC_OLW_MANUAL_QA;
  else process.env.EXPO_PUBLIC_OLW_MANUAL_QA = previous;
});
