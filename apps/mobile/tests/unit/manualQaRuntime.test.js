import assert from 'node:assert/strict';
import test from 'node:test';

import { isManualQaRuntime } from '../../src/manualQaRuntime.js';

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
