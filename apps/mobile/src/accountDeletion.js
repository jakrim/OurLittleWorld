import { supabase } from './supabase';
import { normalizeDeletionPreview } from './accountDeletionModel';

export async function getAccountDeletionPreview() {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { action: 'preview' },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Could not load account deletion details.'));
  return normalizeDeletionPreview(data?.preview);
}

export async function sendAccountDeletionCode(email) {
  const address = String(email || '').trim().toLowerCase();
  if (!address) throw new Error('This account has no email address.');
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error('Could not send a fresh deletion code. Try again.');
  return { sent: true, email: address };
}

export async function deleteAccount({
  requestId,
  email,
  otp,
  confirmation,
}) {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: {
      action: 'delete',
      requestId,
      email: String(email || '').trim().toLowerCase(),
      otp: String(otp || '').replace(/\s/g, ''),
      confirmation: String(confirmation || '').trim(),
    },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Account deletion did not finish. Nothing new was shared; try again.'));
  if (!data?.completed) throw new Error('Account deletion did not finish. Try again.');
  return data;
}

async function functionErrorMessage(error, fallback) {
  try {
    const payload = await error?.context?.json?.();
    return payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
}
