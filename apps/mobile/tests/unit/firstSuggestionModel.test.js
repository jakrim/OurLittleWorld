import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applySuggestionFeedback,
  applySuggestionSnooze,
  aroundDateLabel,
  buildFirstSuggestion,
  FIRST_SUGGESTION_EYEBROW,
  FIRST_SUGGESTION_FOOTER,
  FIRST_SUGGESTION_HIGH_CONFIDENCE_SCORE,
  FIRST_SUGGESTION_MIN_SCORE,
  keepRouteForSuggestion,
  normalizeFirstSuggestionState,
  possibleFirstTitle,
  selectSuggestionForDisplay,
  selectTodaySuggestion,
  shouldGenerateForGoal,
  suggestionSeedDate,
  suggestionTrustForDetector,
  suggestionWindowForGoal,
} from '../../src/firstSuggestionModel.js';

const SMILE_GOAL = {
  key: 'smile',
  title: 'First smile',
  targetAgeLabel: '6-8 weeks',
  targetAgeMinDays: 42,
  targetAgeMaxDays: 70,
};

function match(overrides = {}) {
  return {
    assetId: 'asset-1',
    score: 0.8,
    captureQuality: 0.6,
    creationTime: new Date(2025, 9, 1, 10).getTime(),
    uri: 'ph://asset-1',
    ...overrides,
  };
}

test('suggestion window runs from window start to the earlier of window end or today', () => {
  const window = suggestionWindowForGoal({
    goal: SMILE_GOAL,
    babyBirthday: '2025-07-23',
    now: new Date(2026, 6, 5, 15),
  });

  assert.deepEqual(window, {
    createdAfterMs: new Date(2025, 8, 3).getTime(),
    createdBeforeMs: new Date(2025, 9, 2).getTime(),
  });
});

test('suggestion window is null before the window starts or without inputs', () => {
  assert.equal(suggestionWindowForGoal({
    goal: { targetAgeMinDays: 300, targetAgeMaxDays: 560 },
    babyBirthday: '2026-07-01',
    now: new Date(2026, 6, 5),
  }), null);
  assert.equal(suggestionWindowForGoal({ goal: SMILE_GOAL, babyBirthday: null }), null);
  assert.equal(suggestionWindowForGoal({ goal: { key: 'x' }, babyBirthday: '2025-07-23' }), null);
});

test('guardrail copy never claims certainty', () => {
  assert.equal(possibleFirstTitle(SMILE_GOAL), 'Possible first smile');
  assert.equal(aroundDateLabel(new Date(2025, 9, 1, 10).getTime()), 'Around Oct 1');
  assert.equal(aroundDateLabel('not-a-date'), '');
  assert.equal(FIRST_SUGGESTION_EYEBROW, 'Worth a look');
  assert.equal(FIRST_SUGGESTION_FOOTER, 'Nothing is saved until you keep it.');
});

test('buildFirstSuggestion picks the best-quality match as primary', () => {
  const suggestion = buildFirstSuggestion({
    goal: SMILE_GOAL,
    ownerUserId: 'user-a',
    now: new Date(2026, 6, 5),
    matches: [
      match({ assetId: 'blurry', captureQuality: 0.3, creationTime: new Date(2025, 8, 20).getTime() }),
      match({ assetId: 'sharp', captureQuality: 0.9 }),
      match({ assetId: 'low-score', score: 0.4, captureQuality: 0.95 }),
      match({ assetId: 'too-blurry', captureQuality: 0.1 }),
    ],
  });

  assert.equal(suggestion.id, 'first-suggestion:smile:sharp');
  assert.equal(suggestion.title, 'Possible first smile');
  assert.equal(suggestion.aroundLabel, 'Around Oct 1');
  assert.equal(suggestion.detector, 'age-window');
  assert.equal(suggestion.primary.assetId, 'sharp');
  assert.equal(suggestion.primary.ownerUserId, 'user-a');
  assert.deepEqual(suggestion.alternates.map((photo) => photo.assetId), ['blurry']);
});

test('buildFirstSuggestion returns null when nothing qualifies', () => {
  assert.equal(buildFirstSuggestion({ goal: SMILE_GOAL, matches: [] }), null);
  assert.equal(buildFirstSuggestion({
    goal: SMILE_GOAL,
    matches: [match({ score: 0.2 })],
  }), null);
  assert.equal(buildFirstSuggestion({
    goal: SMILE_GOAL,
    matches: [match()],
    excludedAssetIds: { 'asset-1': true },
  }), null);
});

test('alternates skip near-duplicates by feature distance and time gap', () => {
  const vecA = [1, 0, 0];
  const vecNearA = [0.99, 0.14, 0];
  const vecFar = [0, 1, 0];
  const base = new Date(2025, 9, 1, 10).getTime();

  const suggestion = buildFirstSuggestion({
    goal: SMILE_GOAL,
    matches: [
      match({ assetId: 'primary', captureQuality: 0.9, featureVector: vecA, creationTime: base }),
      match({ assetId: 'dupe', captureQuality: 0.8, featureVector: vecNearA, creationTime: base + 1000 }),
      match({ assetId: 'different', captureQuality: 0.7, featureVector: vecFar, creationTime: base + 2000 }),
      match({ assetId: 'no-vector-close', captureQuality: 0.6, creationTime: base + 60 * 1000 }),
      match({ assetId: 'no-vector-far', captureQuality: 0.5, creationTime: base + 60 * 60 * 1000 }),
    ],
  });

  assert.equal(suggestion.primary.assetId, 'primary');
  assert.deepEqual(
    suggestion.alternates.map((photo) => photo.assetId),
    ['different', 'no-vector-far'],
  );
});

test('not_this excludes the primary asset and dismisses the goal for 30 days', () => {
  const suggestion = buildFirstSuggestion({ goal: SMILE_GOAL, matches: [match()] });
  let state = normalizeFirstSuggestionState({ suggestionsByGoal: { smile: suggestion } });
  const now = new Date(2026, 6, 5);

  state = applySuggestionFeedback(state, { goalKey: 'smile', action: 'not_this', now });
  assert.equal(state.suggestionsByGoal.smile, undefined);
  assert.equal(state.excludedAssetIds['asset-1'], true);
  assert.equal(state.feedback.notThis.smile, 1);

  const goalRows = [{ ...SMILE_GOAL, completed: false }];
  assert.equal(selectSuggestionForDisplay(state, { goalRows, now }), null);
  assert.equal(shouldGenerateForGoal({
    state,
    goal: { ...SMILE_GOAL, completed: false },
    babyBirthday: '2025-07-23',
    now: new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000),
  }), false);
  assert.equal(shouldGenerateForGoal({
    state,
    goal: { ...SMILE_GOAL, completed: false },
    babyBirthday: '2025-07-23',
    now: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000),
  }), true);
});

test('choose_another promotes the alternate and keeps the demoted primary', () => {
  const base = new Date(2025, 9, 1).getTime();
  const suggestion = buildFirstSuggestion({
    goal: SMILE_GOAL,
    matches: [
      match({ assetId: 'first-pick', captureQuality: 0.9, creationTime: base }),
      match({ assetId: 'alt', captureQuality: 0.7, creationTime: new Date(2025, 8, 12).getTime() }),
    ],
  });
  let state = normalizeFirstSuggestionState({ suggestionsByGoal: { smile: suggestion } });

  state = applySuggestionFeedback(state, { goalKey: 'smile', action: 'choose_another', assetId: 'alt' });
  const updated = state.suggestionsByGoal.smile;
  assert.equal(updated.primary.assetId, 'alt');
  assert.equal(updated.aroundLabel, 'Around Sep 12');
  assert.deepEqual(updated.alternates.map((photo) => photo.assetId), ['first-pick']);
  assert.equal(updated.id, suggestion.id);
  assert.equal(state.feedback.chooseAnother.smile, 1);
});

test('keep clears the suggestion and records the keep', () => {
  const suggestion = buildFirstSuggestion({ goal: SMILE_GOAL, matches: [match()] });
  let state = normalizeFirstSuggestionState({ suggestionsByGoal: { smile: suggestion } });
  state = applySuggestionFeedback(state, { goalKey: 'smile', action: 'keep' });
  assert.equal(state.suggestionsByGoal.smile, undefined);
  assert.equal(state.feedback.keeps.smile, 1);
  assert.deepEqual(state.excludedAssetIds, {});
});

test('generation throttles to once a day per goal and skips done goals', () => {
  const now = new Date(2026, 6, 5, 15);
  const base = { goal: { ...SMILE_GOAL, completed: false }, babyBirthday: '2025-07-23', now };

  assert.equal(shouldGenerateForGoal({ state: null, ...base }), true);
  assert.equal(shouldGenerateForGoal({
    state: { lastGeneratedAt: { smile: now.getTime() - 60 * 60 * 1000 } },
    ...base,
  }), false);
  assert.equal(shouldGenerateForGoal({
    state: { lastGeneratedAt: { smile: now.getTime() - 25 * 60 * 60 * 1000 } },
    ...base,
  }), true);
  assert.equal(shouldGenerateForGoal({ state: null, ...base, goal: { ...SMILE_GOAL, completed: true } }), false);
});

test('display picks the oldest-window suggestion and skips completed goals', () => {
  const wordGoal = { key: 'word', title: 'First word', targetAgeMinDays: 270, targetAgeMaxDays: 430 };
  const smileSuggestion = buildFirstSuggestion({ goal: SMILE_GOAL, matches: [match()] });
  const wordSuggestion = buildFirstSuggestion({ goal: wordGoal, matches: [match({ assetId: 'asset-2' })] });
  const state = normalizeFirstSuggestionState({
    suggestionsByGoal: { smile: smileSuggestion, word: wordSuggestion },
  });

  const goalRows = [
    { ...wordGoal, completed: false },
    { ...SMILE_GOAL, completed: false },
  ];
  assert.equal(selectSuggestionForDisplay(state, { goalRows }).goalKey, 'smile');

  const smileDone = [
    { ...wordGoal, completed: false },
    { ...SMILE_GOAL, completed: true },
  ];
  assert.equal(selectSuggestionForDisplay(state, { goalRows: smileDone }).goalKey, 'word');
});

test('today surface honors the 7-day snooze without touching the Firsts card', () => {
  const suggestion = buildFirstSuggestion({ goal: SMILE_GOAL, matches: [match()] });
  let state = normalizeFirstSuggestionState({ suggestionsByGoal: { smile: suggestion } });
  const now = new Date(2026, 6, 5);
  const goalRows = [{ ...SMILE_GOAL, completed: false }];

  state = applySuggestionSnooze(state, { goalKey: 'smile', now });
  assert.equal(selectTodaySuggestion(state, { goalRows, now }), null);
  assert.equal(selectSuggestionForDisplay(state, { goalRows, now }).goalKey, 'smile');

  const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  assert.equal(selectTodaySuggestion(state, { goalRows, now: later }).goalKey, 'smile');
});

test('keep route hands the compose sheet a fully drafted first', () => {
  const suggestion = buildFirstSuggestion({
    goal: SMILE_GOAL,
    ownerUserId: 'user-a',
    matches: [match()],
  });

  assert.equal(suggestionSeedDate(suggestion), '2025-10-01');
  assert.deepEqual(keepRouteForSuggestion(suggestion, SMILE_GOAL), {
    pathname: '/first-compose',
    params: {
      title: 'First smile',
      targetAge: '6-8 weeks',
      goalKey: 'smile',
      seedAssetId: 'asset-1',
      seedAssetOwnerUserId: 'user-a',
      seedAssetUri: 'ph://asset-1',
      seedDate: '2025-10-01',
    },
  });
  assert.equal(keepRouteForSuggestion(null, SMILE_GOAL), null);
});

test('repeated not-this raises the bar, then quiets the detector; a keep resets', () => {
  const now = new Date(2026, 6, 5);
  let state = normalizeFirstSuggestionState();

  const rejectOnce = (current, index) => {
    const suggestion = buildFirstSuggestion({
      goal: SMILE_GOAL,
      matches: [match({ assetId: `asset-${index}` })],
    });
    const withSuggestion = { ...current, suggestionsByGoal: { smile: suggestion } };
    return applySuggestionFeedback(withSuggestion, { goalKey: 'smile', action: 'not_this', now });
  };

  state = rejectOnce(state, 1);
  assert.deepEqual(suggestionTrustForDetector(state, 'age-window', now), {
    enabled: true,
    minScore: FIRST_SUGGESTION_MIN_SCORE,
  });

  state = rejectOnce(state, 2);
  assert.deepEqual(suggestionTrustForDetector(state, 'age-window', now), {
    enabled: true,
    minScore: FIRST_SUGGESTION_HIGH_CONFIDENCE_SCORE,
  });

  state = rejectOnce(state, 3);
  state = rejectOnce(state, 4);
  assert.equal(suggestionTrustForDetector(state, 'age-window', now).enabled, false);

  const after61Days = new Date(now.getTime() + 61 * 24 * 60 * 60 * 1000);
  assert.equal(suggestionTrustForDetector(state, 'age-window', after61Days).enabled, true);

  const keepSuggestion = buildFirstSuggestion({
    goal: SMILE_GOAL,
    matches: [match({ assetId: 'asset-kept' })],
  });
  state = applySuggestionFeedback(
    { ...state, suggestionsByGoal: { smile: keepSuggestion } },
    { goalKey: 'smile', action: 'keep', now },
  );
  assert.deepEqual(suggestionTrustForDetector(state, 'age-window', now), {
    enabled: true,
    minScore: FIRST_SUGGESTION_MIN_SCORE,
  });
});

test('state normalization tolerates junk input', () => {
  const state = normalizeFirstSuggestionState({ feedback: 'junk', suggestionsByGoal: [1], excludedAssetIds: null });
  assert.deepEqual(state.suggestionsByGoal, {});
  assert.deepEqual(state.feedback, { keeps: {}, notThis: {}, chooseAnother: {} });
  assert.deepEqual(state.excludedAssetIds, {});
  assert.deepEqual(normalizeFirstSuggestionState(null).dismissedGoals, {});
});
