import * as Scan from './scanController';
import { isNative } from './faceMatcher';
import {
  firstValueReferenceExclusionIds,
  isFirstValueReferenceEcho,
  previewFromMatch,
} from './firstValuePreviewModel';
import { writeFirstValuePreview } from './firstValuePreviewStore';
import { ensureLibraryPermission } from './photos';
import { readReferenceProfile, representativeReference } from './recognitionReferences';
import {
  FIRST_VALUE_SCAN_MAX_DURATION_MS,
  FIRST_VALUE_SCAN_MAX_PHOTOS,
  FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE,
} from './scanPacingModel';
import { FIRST_VALUE_NATIVE_MATCH_BATCH_TIMEOUT_MS } from './faceMatcherModel';

export async function startFirstValuePreviewScan({ family, user, onPreviewReady } = {}) {
  if (!family?.id || !user?.id) return { started: false, reason: 'missing-context' };
  if (!['creator', 'partner'].includes(family?.me?.role)) {
    return { started: false, reason: 'role-cannot-scan' };
  }

  const permission = await ensureLibraryPermission();
  if (!permission?.granted) return { started: false, reason: 'photo-permission' };

  const profile = await readReferenceProfile({ familyId: family.id, userId: user.id });
  const reference = representativeReference(profile);
  if (isNative && !reference?.embedding?.length && profile.references?.every((item) => !item?.embedding?.length)) {
    return { started: false, reason: 'missing-reference' };
  }

  if (Scan.isRunning()) Scan.abort();
  Scan.reset();

  const birthdayMs = family.babyBirthday
    ? new Date(`${family.babyBirthday}T00:00:00`).getTime()
    : undefined;
  let stored = false;
  const completion = Scan.start({
    reference,
    referenceProfile: profile,
    birthdayISO: family.babyBirthday,
    since: Number.isFinite(birthdayMs) ? birthdayMs : undefined,
    autoSave: null,
    // The photo a parent supplied is identity evidence, not a discovery.
    // Excluding every local reference asset ensures First Look proves that it
    // found another candidate from the library.
    excludeIds: firstValueReferenceExclusionIds(profile),
    photoPageSize: FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE,
    nativeBatchTimeoutMs: FIRST_VALUE_NATIVE_MATCH_BATCH_TIMEOUT_MS,
    maxPhotoAssets: FIRST_VALUE_SCAN_MAX_PHOTOS,
    maxScanDurationMs: FIRST_VALUE_SCAN_MAX_DURATION_MS,
    includeVideos: false,
    onCandidates: async ({ matches }) => {
      if (stored) return;
      const distinctMatch = matches?.find((match) => !isFirstValueReferenceEcho(match));
      const preview = previewFromMatch(distinctMatch);
      if (!preview) return;
      stored = true;
      await writeFirstValuePreview({ familyId: family.id, userId: user.id, preview });
      onPreviewReady?.(preview);
      // Let the controller publish this match. The scan screen navigates to
      // the stored preview, then its unmount cleanup cancels remaining work.
    },
  });

  completion.catch(() => {});
  return { started: true, scanKey: Scan.getState().scanKey };
}
