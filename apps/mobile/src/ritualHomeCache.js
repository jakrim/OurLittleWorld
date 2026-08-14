import AsyncStorage from '@react-native-async-storage/async-storage';

// v7: payload carries one book-readiness nudge candidate (F4).
const CACHE_VERSION = 'v7';
const revisions = new Map();
const listeners = new Map();
const invalidatedKeys = new Set();
const mutations = new Map();

function enqueueMutation(key, mutation) {
  const previous = mutations.get(key) || Promise.resolve();
  const scheduled = previous.catch(() => {}).then(mutation);
  const settled = scheduled.finally(() => {
    if (mutations.get(key) === settled) mutations.delete(key);
  });
  mutations.set(key, settled);
  return settled;
}

export function ritualHomeCacheKey({ familyId, userId }) {
  if (!familyId || !userId) return null;
  return `olw:ritual-home:${CACHE_VERSION}:${familyId}:${userId}`;
}

export async function readRitualHomeCache({ familyId, userId }) {
  const key = ritualHomeCacheKey({ familyId, userId });
  if (!key || invalidatedKeys.has(key)) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw || invalidatedKeys.has(key)) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeRitualHomeCache({ familyId, userId, payload, revision = null }) {
  const key = ritualHomeCacheKey({ familyId, userId });
  if (!key || !payload) return false;
  const expectedRevision = Number.isFinite(revision)
    ? Number(revision)
    : ritualHomeCacheRevision({ familyId, userId });
  return enqueueMutation(key, async () => {
    if (expectedRevision !== ritualHomeCacheRevision({ familyId, userId })) return false;
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    if (expectedRevision !== ritualHomeCacheRevision({ familyId, userId })) return false;
    invalidatedKeys.delete(key);
    return true;
  });
}

export function ritualHomeCacheRevision({ familyId, userId }) {
  const key = ritualHomeCacheKey({ familyId, userId });
  return key ? Number(revisions.get(key) || 0) : 0;
}

export async function invalidateRitualHomeCache({ familyId, userId }) {
  const key = ritualHomeCacheKey({ familyId, userId });
  if (!key) return false;
  revisions.set(key, Number(revisions.get(key) || 0) + 1);
  invalidatedKeys.add(key);
  await enqueueMutation(key, () => AsyncStorage.removeItem(key));
  for (const listener of listeners.get(key) || []) {
    try {
      listener();
    } catch {
      // A mounted consumer must not turn a completed canonical Keep into a failure.
    }
  }
  return true;
}

export function subscribeRitualHomeInvalidation({ familyId, userId }, listener) {
  const key = ritualHomeCacheKey({ familyId, userId });
  if (!key || typeof listener !== 'function') return () => {};
  const scoped = listeners.get(key) || new Set();
  scoped.add(listener);
  listeners.set(key, scoped);
  return () => {
    scoped.delete(listener);
    if (!scoped.size) listeners.delete(key);
  };
}
