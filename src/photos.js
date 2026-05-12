import * as MediaLibrary from 'expo-media-library';

/**
 * Helpers that talk to the photo library on behalf of the Our Little World
 * feature. We isolate every PhotoKit call in this module so adding face
 * detection later only touches one file.
 */

export async function ensureLibraryPermission() {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true, accessPrivileges: current.accessPrivileges };
  }
  if (!current.canAskAgain) {
    return { granted: false, canAskAgain: false };
  }
  const next = await MediaLibrary.requestPermissionsAsync();
  return {
    granted: next.status === 'granted',
    accessPrivileges: next.accessPrivileges,
    canAskAgain: next.canAskAgain,
  };
}

/**
 * Fetch a page of photos sorted newest first. Returns an object with
 * `assets`, `endCursor`, and `hasNextPage` so the UI can paginate.
 */
export async function fetchPhotosPage({ after, pageSize = 60 } = {}) {
  const result = await MediaLibrary.getAssetsAsync({
    mediaType: 'photo',
    first: pageSize,
    after,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  return {
    assets: result.assets,
    endCursor: result.endCursor,
    hasNextPage: result.hasNextPage,
  };
}

/**
 * Compute baby age at a given timestamp.
 * Returns a structured object so callers can format flexibly.
 */
export function ageAt(birthdayISO, takenAtMs) {
  if (!birthdayISO || !takenAtMs) return null;
  const birth = new Date(birthdayISO);
  const taken = new Date(takenAtMs);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(taken.getTime())) return null;

  let years = taken.getFullYear() - birth.getFullYear();
  let months = taken.getMonth() - birth.getMonth();
  let days = taken.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    const lastMonth = new Date(taken.getFullYear(), taken.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const diffMs = taken.getTime() - birth.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const beforeBirth = diffMs < 0;

  return { years, months, days, totalDays, beforeBirth };
}

export function formatAge(age) {
  if (!age) return '';
  if (age.beforeBirth) return 'before they were born';
  if (age.totalDays === 0) return 'birth day';
  if (age.years === 0 && age.months === 0) {
    return `${age.totalDays} day${age.totalDays === 1 ? '' : 's'} old`;
  }
  if (age.years === 0) {
    const m = `${age.months} month${age.months === 1 ? '' : 's'}`;
    const d = age.days ? ` ${age.days}d` : '';
    return `${m}${d}`;
  }
  const y = `${age.years} year${age.years === 1 ? '' : 's'}`;
  const m = age.months ? ` ${age.months}m` : '';
  return `${y}${m}`;
}
