import * as Scan from './scanController';
import { isNative } from './faceMatcher';
import { previewFromMatch } from './firstValuePreviewModel';
import { writeFirstValuePreview } from './firstValuePreviewStore';
import { ensureLibraryPermission } from './photos';
import { readReferenceProfile, representativeReference } from './recognitionReferences';
import { FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE } from './scanPacingModel';

export async function startFirstValuePreviewScan({ family, user } = {}) {
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
    excludeIds: new Set(),
    photoPageSize: FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE,
    onCandidates: async ({ matches }) => {
      if (stored) return;
      const preview = previewFromMatch(matches?.[0]);
      if (!preview) return;
      stored = true;
      await writeFirstValuePreview({ familyId: family.id, userId: user.id, preview });
      Scan.abort();
    },
  });

  completion.catch(() => {});
  return { started: true, scanKey: Scan.getState().scanKey };
}
