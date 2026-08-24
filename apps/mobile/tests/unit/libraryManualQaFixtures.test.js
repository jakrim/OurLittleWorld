import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBookHomeModel } from '../../src/bookHomeModel.js';
import {
  buildLibraryManualQaFixture,
  buildLibraryManualQaMomentDetail,
  normalizeLibraryManualQaFixture,
} from '../../src/libraryManualQaFixtures.js';
import { buildBookUtilityVisibility } from '../../src/bookUtilityVisibilityModel.js';
import { buildMomentConnectionChips } from '../../src/momentConnectionChips.js';
import { buildPlaceClusters } from '../../src/visionSceneLabeler.js';

test('normalizes only supported library manual QA fixtures', () => {
  assert.equal(normalizeLibraryManualQaFixture('empty'), 'empty');
  assert.equal(normalizeLibraryManualQaFixture(['large-no-firsts']), 'large-no-firsts');
  assert.equal(normalizeLibraryManualQaFixture('connected-first-letter'), 'connected-first-letter');
  assert.equal(normalizeLibraryManualQaFixture('collections'), 'collections');
  assert.equal(normalizeLibraryManualQaFixture('production'), null);
  assert.equal(normalizeLibraryManualQaFixture(undefined), null);
});

test('collections fixture is bounded, factual and contains no inferred activity labels', () => {
  const fixture = buildLibraryManualQaFixture('collections', {
    userId: 'parent-1',
    now: new Date('2026-07-09T12:00:00Z'),
  });

  assert.equal(fixture.moments.length, 24);
  assert.deepEqual(fixture.collections.map((collection) => collection.title), [
    'Photos',
    'July 2026',
    'At the park',
    'Added by a parent',
  ]);
  assert.ok(fixture.collections.every((collection) => collection.moment_ids.length <= 24));
  assert.ok(fixture.collections.every((collection) => ['factual', 'parent'].includes(collection.confidence_band)));
  assert.ok(fixture.collections.every((collection) => !['activity', 'emotion', 'milestone'].includes(collection.kind)));
});

test('empty library manual QA fixture is non-mutating and quiet', () => {
  const fixture = buildLibraryManualQaFixture('empty');
  const home = buildBookHomeModel({
    moments: fixture.moments,
    sharedPhotos: fixture.shared,
    firsts: fixture.firsts,
    letters: fixture.letters,
    promptResponses: fixture.promptResponses,
    uploadRepairState: fixture.uploadQueue,
    now: new Date('2026-07-09T12:00:00Z'),
  });
  const utility = buildBookUtilityVisibility({
    uploadQueue: fixture.uploadQueue,
    iCloudRetry: fixture.iCloudRetry,
    pendingChange: fixture.pendingChange,
  });

  assert.equal(fixture.key, 'empty');
  assert.equal(home.stats.moments, 0);
  assert.equal(home.currentMonthChapter, null);
  assert.equal(home.firstsSummary.count, 0);
  assert.equal(home.lettersSummary.count, 0);
  assert.equal(home.printExportReadiness.state, 'empty');
  assert.equal(utility.hasBlockingAction, false);
  assert.equal(utility.hasSecondaryDetails, false);
});

test('large no-firsts fixture prioritizes photo navigation without repair noise', () => {
  const fixture = buildLibraryManualQaFixture('large-no-firsts', {
    userId: 'parent-1',
    now: new Date('2026-07-09T12:00:00Z'),
  });
  const home = buildBookHomeModel({
    moments: fixture.moments,
    sharedPhotos: fixture.shared,
    firsts: fixture.firsts,
    letters: fixture.letters,
    promptResponses: fixture.promptResponses,
    uploadRepairState: fixture.uploadQueue,
    now: new Date('2026-07-09T12:00:00Z'),
  });
  const utility = buildBookUtilityVisibility({
    uploadQueue: fixture.uploadQueue,
    iCloudRetry: fixture.iCloudRetry,
    pendingChange: fixture.pendingChange,
  });

  assert.equal(fixture.moments.length, 500);
  assert.equal(fixture.shared.length, 500);
  assert.equal(home.stats.moments, 500);
  assert.equal(home.stats.photos, 500);
  assert.equal(home.bookReadyStats.moments, 500);
  assert.equal(home.firstsSummary.count, 0);
  assert.equal(home.lettersSummary.count, 0);
  assert.equal(home.printExportReadiness.state, 'print_ready');
  assert.equal(utility.hasBlockingAction, false);
  assert.equal(utility.hasSecondaryDetails, false);
});

test('large fixture place labels avoid raw coordinates', () => {
  const fixture = buildLibraryManualQaFixture('large-no-firsts');
  const places = buildPlaceClusters({
    shared: fixture.shared,
    metadataByKey: {},
    memoriesByKey: {},
  });

  assert.equal(places.length, 2);
  assert.deepEqual(places.map((place) => place.label), ['At home', 'At the park']);
  for (const place of places) {
    assert.doesNotMatch(place.label, /\d+(\.\d+)?°|^-?\d+(\.\d+)?:-?\d+(\.\d+)?$/);
  }
});

test('connected first-letter fixture shows book context and moment story links', () => {
  const fixture = buildLibraryManualQaFixture('connected-first-letter', {
    userId: 'parent-1',
    now: new Date('2026-07-09T12:00:00Z'),
  });
  const home = buildBookHomeModel({
    moments: fixture.moments,
    sharedPhotos: fixture.shared,
    firsts: fixture.firsts,
    letters: fixture.letters,
    promptResponses: fixture.promptResponses,
    uploadRepairState: fixture.uploadQueue,
    now: new Date('2026-07-09T12:00:00Z'),
  });
  const detail = buildLibraryManualQaMomentDetail(
    'connected-first-letter',
    'qa-moment-first-smile',
    { userId: 'parent-1' },
  );
  const chips = buildMomentConnectionChips({
    moment: detail,
    firsts: detail.connectedFirsts,
    letters: detail.connectedLetters,
    canWrite: true,
  });

  assert.equal(fixture.firsts.length, 2);
  assert.equal(fixture.letters.length, 1);
  assert.equal(home.firstsSummary.count, 2);
  assert.equal(home.lettersSummary.count, 1);
  assert.ok(home.chapters.some((chapter) => chapter.contextItems.some((item) => item.kind === 'first')));
  assert.ok(home.chapters.some((chapter) => chapter.contextItems.some((item) => item.kind === 'letter')));
  assert.equal(detail.connectedFirsts[0].title, 'First smile');
  assert.equal(detail.connectedLetters[0].title, 'For your first birthday');
  assert.deepEqual(chips.map((chip) => chip.label), ['First', 'Letter']);
});
