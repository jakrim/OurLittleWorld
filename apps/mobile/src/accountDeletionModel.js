export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE';

export const ACCOUNT_DELETION_COPY = Object.freeze({
  title: 'Delete your account',
  exportFirst: 'Export first',
  cameraRoll: 'Photos and videos in your device library are never deleted.',
  sharedHistory: 'If another co-parent remains, the family memories you kept together stay with them and your attribution is removed.',
  soleWriter: 'Families where you are the only co-parent, including their stored media, will be permanently deleted.',
  circle: 'View-only family access will be removed without deleting that family’s memories.',
  storeSubscription: 'Deleting your account does not cancel an Apple App Store or Google Play subscription. Cancel it in your store subscription settings.',
  stripeSubscription: 'A website subscription owned by this account will be canceled during deletion.',
  legalRetention: 'Minimum billing and fraud-prevention records may be retained where legally required. They do not include your family memory content.',
  finalWarning: 'This cannot be undone. Type DELETE and enter the fresh email code to continue.',
});

export function normalizeDeletionPreview(value = {}) {
  return {
    familyCount: nonNegativeInteger(value.familyCount ?? value.family_count),
    soleWriterCount: nonNegativeInteger(value.soleWriterCount ?? value.sole_writer_count),
    additionalWriterCount: nonNegativeInteger(value.additionalWriterCount ?? value.additional_writer_count),
    circleCount: nonNegativeInteger(value.circleCount ?? value.circle_count),
    storeSubscriptionActionRequired: Boolean(
      value.storeSubscriptionActionRequired ?? value.store_subscription_action_required
    ),
    stripeCancellationRequired: Boolean(
      value.stripeCancellationRequired ?? value.stripe_cancellation_required
    ),
  };
}

export function deletionImpactLines(preview = {}) {
  const normalized = normalizeDeletionPreview(preview);
  const lines = [];
  if (normalized.soleWriterCount) {
    lines.push(`${normalized.soleWriterCount} ${plural(normalized.soleWriterCount, 'family archive')} permanently deleted`);
  }
  if (normalized.additionalWriterCount) {
    lines.push(`${normalized.additionalWriterCount} shared ${plural(normalized.additionalWriterCount, 'family archive')} preserved for another co-parent`);
  }
  if (normalized.circleCount) {
    lines.push(`${normalized.circleCount} view-only ${plural(normalized.circleCount, 'membership')} removed`);
  }
  if (!lines.length) lines.push('Your sign-in and account data permanently deleted');
  return lines;
}

export function canSubmitAccountDeletion({ otp, confirmation, busy = false } = {}) {
  return !busy
    && /^\d{6}$/.test(String(otp || '').replace(/\s/g, ''))
    && String(confirmation || '').trim() === ACCOUNT_DELETION_CONFIRMATION;
}

export function accountDeletionAsyncStorageKeys(keys = [], { familyId, userId } = {}) {
  const familyToken = familyId ? `:${familyId}` : null;
  const userToken = userId ? `:${userId}` : null;
  return [...new Set((keys || []).filter((key) => {
    const value = String(key || '');
    if (value === 'olw:theme-preferences:v1') return false;
    if (value.startsWith('olw:')) return true;
    if (familyToken && value.includes(familyToken)) return true;
    return Boolean(userToken && value.includes(userToken));
  }))];
}

export function createDeletionRequestId(
  randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
  getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto),
) {
  if (randomUuid) return randomUuid();
  if (!getRandomValues) throw new Error('Secure account deletion confirmation is unavailable.');
  const bytes = getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function plural(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}
