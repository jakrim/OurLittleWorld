import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyGeneratedSuggestionsToState,
  applySuggestionFeedback,
  applySuggestionSnooze,
  normalizeFirstSuggestionState,
} from './firstSuggestionModel';

export async function readFirstSuggestionState({ familyId, userId } = {}) {
  if (!familyId) return normalizeFirstSuggestionState();
  try {
    const raw = await AsyncStorage.getItem(firstSuggestionStorageKey({ familyId, userId }));
    return normalizeFirstSuggestionState(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('readFirstSuggestionState', err?.message);
    return normalizeFirstSuggestionState();
  }
}

export async function saveGeneratedSuggestions({
  familyId,
  userId,
  suggestions = [],
  generatedGoalKeys = [],
  resetGoalKeys = [],
  now = new Date(),
} = {}) {
  if (!familyId) return normalizeFirstSuggestionState();
  const current = await readFirstSuggestionState({ familyId, userId });
  const state = applyGeneratedSuggestionsToState(current, {
    suggestions,
    generatedGoalKeys,
    resetGoalKeys,
    now,
  });
  await writeFirstSuggestionState({ familyId, userId, state });
  return state;
}

export async function recordFirstSuggestionFeedback({ familyId, userId, goalKey, action, assetId, now = new Date() } = {}) {
  if (!familyId || !goalKey) return normalizeFirstSuggestionState();
  const current = await readFirstSuggestionState({ familyId, userId });
  const next = applySuggestionFeedback(current, { goalKey, action, assetId, now });
  await writeFirstSuggestionState({ familyId, userId, state: next });
  return next;
}

export async function snoozeFirstSuggestion({ familyId, userId, goalKey, now = new Date() } = {}) {
  if (!familyId || !goalKey) return normalizeFirstSuggestionState();
  const current = await readFirstSuggestionState({ familyId, userId });
  const next = applySuggestionSnooze(current, { goalKey, now });
  await writeFirstSuggestionState({ familyId, userId, state: next });
  return next;
}

async function writeFirstSuggestionState({ familyId, userId, state }) {
  try {
    await AsyncStorage.setItem(
      firstSuggestionStorageKey({ familyId, userId }),
      JSON.stringify(normalizeFirstSuggestionState(state)),
    );
  } catch (err) {
    console.warn('writeFirstSuggestionState', err?.message);
  }
}

function firstSuggestionStorageKey({ familyId, userId }) {
  return `olw:first-suggestions:v1:${familyId}:${userId || 'anonymous'}`;
}
