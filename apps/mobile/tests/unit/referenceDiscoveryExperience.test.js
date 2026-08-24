import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const SRC = path.resolve(import.meta.dirname, '../../src');
const APP = path.resolve(import.meta.dirname, '../../app');

test('reference discovery surfaces real-photo possibilities and explicit retry', async () => {
  const [screen, discovery] = await Promise.all([
    readFile(path.join(SRC, 'ReferencePhotoScreen.js'), 'utf8'),
    readFile(path.join(SRC, 'referenceAutoSeed.js'), 'utf8'),
  ]);
  assert.match(screen, /birthday-discovery-suggestions/);
  assert.match(screen, /These are possibilities, not confirmed matches/);
  assert.match(screen, /Choose another from Photos/);
  assert.match(screen, /Return to suggested photos/);
  assert.match(screen, /Try automatic search again/);
  assert.match(screen, /\(!autoSeedRequested && autoSeedRun === 0\)/);
  assert.match(screen, /Photos stay on this iPhone/);
  assert.match(screen, /preparedPreview/);
  assert.match(screen, /'\/first-value-preview'/);
  assert.match(screen, /AUTO_SEED_UI_WATCHDOG_MS/);
  assert.match(screen, /picked && !autoSeeding/);
  assert.match(screen, /restored && !error && !autoSeeding/);
  assert.match(screen, /autoSeeding \? \(\s*<Button variant="quiet" onPress=\{onBack\}>/);
  assert.doesNotMatch(screen, /Choose from Photos instead/);
  assert.doesNotMatch(screen, /Step 1 of 2/);
  assert.doesNotMatch(screen, /progressPercent/);
  assert.doesNotMatch(screen, /appears across the months/);
  assert.match(discovery, /AUTO_SEED_ANALYSIS_WAVE_SIZE/);
  assert.match(discovery, /AUTO_SEED_MAX_DURATION_MS/);
  assert.match(discovery, /AUTO_SEED_EMBED_TIMEOUT_MS/);
  assert.match(discovery, /resolveWithin/);
  assert.match(discovery, /firstLookPreview/);
  assert.match(discovery, /earlyExit/);
});

test('first-value Back uses a stable setup route instead of router history', async () => {
  const [screen, setupRoute, setupScreen, scanScreen, previewScan] = await Promise.all([
    readFile(path.join(SRC, 'ReferencePhotoScreen.js'), 'utf8'),
    readFile(path.join(APP, 'setup.jsx'), 'utf8'),
    readFile(path.join(SRC, 'SetupScreen.js'), 'utf8'),
    readFile(path.join(SRC, 'ScanProgressScreen.js'), 'utf8'),
    readFile(path.join(SRC, 'firstValuePreviewScan.js'), 'utf8'),
  ]);
  assert.match(screen, /pathname: '\/setup'/);
  assert.match(screen, /resumeDiscovery: '1'/);
  assert.match(setupRoute, /allowFirstValue/);
  assert.match(setupScreen, /autoSeed: 'resume'/);
  assert.match(previewScan, /FIRST_VALUE_SCAN_WATCHDOG_MS/);
  assert.match(previewScan, /Scan\.abort\(\)/);
  assert.match(scanScreen, /\['done', 'failed', 'aborted'\]/);
  assert.match(scanScreen, /Continue with your photo/);
  assert.match(scanScreen, /prepareReferenceFirstValuePreview/);
  assert.match(previewScan, /previewFromReference/);
});
