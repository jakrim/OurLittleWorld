import { Linking, Platform } from 'react-native';

/**
 * Detects which mail apps are installed and offers the user the best path
 * to their inbox. Order is: their daily-driver third-party clients first
 * (Gmail / Outlook / Spark / etc.), then the iOS system Mail app as a
 * universal fallback. The schemes below are registered in app.json under
 * `ios.infoPlist.LSApplicationQueriesSchemes` so `canOpenURL` returns
 * accurate results in production builds.
 *
 * On Android the system intent (`mailto:`) opens the OS picker, which is
 * the right behaviour there.
 */

const IOS_PROVIDERS = [
  { id: 'gmail', label: 'Gmail', scheme: 'googlegmail://' },
  { id: 'outlook', label: 'Outlook', scheme: 'ms-outlook://' },
  { id: 'spark', label: 'Spark', scheme: 'readdle-spark://' },
  { id: 'yahoo', label: 'Yahoo Mail', scheme: 'ymail://' },
  { id: 'fastmail', label: 'Fastmail', scheme: 'fastmail://' },
  { id: 'hey', label: 'HEY', scheme: 'hey://' },
  { id: 'superhuman', label: 'Superhuman', scheme: 'superhuman://' },
  { id: 'apple', label: 'Mail', scheme: 'message://' },
];

export async function detectInstalledMailApps() {
  if (Platform.OS !== 'ios') return [];
  const checks = await Promise.all(
    IOS_PROVIDERS.map(async (p) => {
      try {
        const ok = await Linking.canOpenURL(p.scheme);
        return ok ? p : null;
      } catch {
        return null;
      }
    }),
  );
  return checks.filter(Boolean);
}

/**
 * Opens the user's mail inbox. On iOS we try the highest-ranked installed
 * client; if none come back from the detector (older builds without the
 * query schemes registered), we attempt Gmail then iOS Mail blindly. On
 * Android we let the OS pick via a `mailto:` no-op.
 */
export async function openInbox() {
  if (Platform.OS === 'android') {
    await Linking.openURL('mailto:');
    return { provider: 'android-picker' };
  }

  const installed = await detectInstalledMailApps();
  const target = installed[0] || IOS_PROVIDERS.find((p) => p.id === 'gmail') || IOS_PROVIDERS.find((p) => p.id === 'apple');

  for (const candidate of [target, ...IOS_PROVIDERS.filter((p) => p !== target)]) {
    try {
      await Linking.openURL(candidate.scheme);
      return { provider: candidate.id };
    } catch {
      // try the next one
    }
  }
  throw new Error('No mail app could be opened.');
}

export const MAIL_PROVIDERS = IOS_PROVIDERS;
