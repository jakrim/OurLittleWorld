import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { finishTransaction, getAvailablePurchases as getStorePurchases } from 'expo-iap';

import {
  Body,
  Caption,
  Eyebrow,
  Field,
  Screen,
  SegmentedControl,
  Title,
  palettes,
  PALETTE_NAMES,
  radius,
  shadow,
  space,
  useTheme,
} from './ui';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import { GIFT_REDEMPTION_COPY } from './giftOfferCopy';
import {
  SUBSCRIPTION_PRODUCT_IDS,
  SUPPORT_EMAIL,
  createBillingPortal,
  entitlementStatusLabel,
  formatBytes,
  formatVideoMinutes,
  getFamilyStorageUsage,
  openManageSubscription,
  verifyStorePurchase,
} from './billing';
import { Family } from './families';
import { ageAt, formatAge } from './photos';
import { clearReferenceProfile, readReferenceProfile } from './recognitionReferences';
import { clearImportCalibration } from './recognitionTrust';
import { clearScanCheckpoint } from './scanCheckpoints';
import { resetFamilyLibraryConnection } from './familyLibrarySync';
import * as Scan from './scanController';
import {
  NOTIFICATION_CATEGORIES,
  TRANSACTIONAL_NOTIFICATION_CATEGORY,
  defaultNotificationPreferences,
  enabledNotificationCount,
  formatQuietHours,
  getNotificationPreferences,
  mergeNotificationPreferences,
  saveNotificationPreferences,
} from './notificationSettings';
import {
  DEFAULT_RITUAL_SETTINGS,
  DEFAULT_SETTINGS_COUNTS,
  PROMPT_TIME_OPTIONS,
  WEEKDAY_OPTIONS,
  formatDigestDay,
  formatMonthiversary,
  formatPromptTime,
  getFamilyRitualSettings,
  getSettingsCounts,
  monthiversaryDayForFamily,
  normalizeRitualSettings,
  saveFamilyRitualSettings,
} from './ritualSettings';

const THEME_MODE_OPTIONS = [
  { value: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

const DEFAULT_REFERENCE_SUMMARY = {
  total: 0,
  trusted: 0,
  seeded: 0,
  latestAgeLabel: 'No local reference yet',
  latestSourceLabel: 'Automatic discovery will try the birthday-first setup before asking for a photo.',
  updatedAt: null,
};

const QUIET_START_OPTIONS = [
  { value: '20:00', label: '8 PM' },
  { value: '21:00', label: '9 PM' },
  { value: '22:00', label: '10 PM' },
  { value: '23:00', label: '11 PM' },
];

const QUIET_END_OPTIONS = [
  { value: '06:00', label: '6 AM' },
  { value: '07:00', label: '7 AM' },
  { value: '08:00', label: '8 AM' },
  { value: '09:00', label: '9 AM' },
];

export default function SettingsMenuSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family, refresh: refreshFamily } = useFamily();
  const { entitlement, refresh: refreshBilling, redeemCode } = useBilling();
  const { user, signOut } = useAuth();
  const [ritualSettings, setRitualSettings] = useState(() => normalizeRitualSettings(DEFAULT_RITUAL_SETTINGS));
  const [notificationPreferences, setNotificationPreferences] = useState(defaultNotificationPreferences);
  const [settingsCounts, setSettingsCounts] = useState(DEFAULT_SETTINGS_COUNTS);
  const [referenceSummary, setReferenceSummary] = useState(DEFAULT_REFERENCE_SUMMARY);
  const [activeEditor, setActiveEditor] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [clearingReferences, setClearingReferences] = useState(false);
  const [billingBusy, setBillingBusy] = useState(null);
  const [purchaseCode, setPurchaseCode] = useState('');
  const [storageUsage, setStorageUsage] = useState(null);
  const scrollRef = useRef(null);
  const [notificationsSectionY, setNotificationsSectionY] = useState(0);
  const [notificationsRowY, setNotificationsRowY] = useState(0);
  const [pendingNotificationsScroll, setPendingNotificationsScroll] = useState(false);
  const requestedSection = Array.isArray(params.section) ? params.section[0] : params.section;

  useEffect(() => {
    if (requestedSection !== 'notifications') return;
    setActiveEditor('notifications');
    setPendingNotificationsScroll(true);
  }, [requestedSection]);

  useEffect(() => {
    if (!pendingNotificationsScroll || activeEditor !== 'notifications') return undefined;
    const notificationsY = notificationsSectionY + notificationsRowY;
    if (!notificationsY) return undefined;
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo?.({
        y: Math.max(0, notificationsY - space.sm),
        animated: false,
      });
      setPendingNotificationsScroll(false);
    }, 100);
    return () => clearTimeout(timeout);
  }, [activeEditor, notificationsRowY, notificationsSectionY, pendingNotificationsScroll]);

  useEffect(() => {
    let alive = true;
    if (activeEditor !== 'billing' || !family?.id) return () => { alive = false; };
    getFamilyStorageUsage(family.id)
      .then((usage) => { if (alive) setStorageUsage(usage); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeEditor, family?.id]);

  useEffect(() => {
    let alive = true;
    if (!family?.id) {
      setRitualSettings(normalizeRitualSettings(DEFAULT_RITUAL_SETTINGS, family));
      setNotificationPreferences(defaultNotificationPreferences());
      setSettingsCounts(DEFAULT_SETTINGS_COUNTS);
      setReferenceSummary(DEFAULT_REFERENCE_SUMMARY);
      return () => {
        alive = false;
      };
    }
    Promise.all([
      getFamilyRitualSettings({ familyId: family.id, family }),
      user?.id
        ? getNotificationPreferences({ familyId: family.id, userId: user.id })
        : Promise.resolve(defaultNotificationPreferences()),
      getSettingsCounts(family.id),
      user?.id
        ? readReferenceProfile({ familyId: family.id, userId: user.id }).catch(() => null)
        : Promise.resolve(null),
    ]).then(([nextSettings, nextNotifications, nextCounts, nextReferenceProfile]) => {
      if (!alive) return;
      setRitualSettings(nextSettings);
      setNotificationPreferences(nextNotifications);
      setSettingsCounts(nextCounts);
      setReferenceSummary(summarizeReferenceProfile(nextReferenceProfile, family));
    });
    return () => {
      alive = false;
    };
  }, [family?.babyBirthday, family?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRitualPatch = async (patch) => {
    if (!family?.id || savingSettings) return;
    const previous = ritualSettings;
    const optimistic = normalizeRitualSettings({ ...previous, ...patch }, family);
    setSavingSettings(true);
    setRitualSettings(optimistic);
    try {
      const saved = await saveFamilyRitualSettings({
        familyId: family.id,
        family,
        base: previous,
        patch,
      });
      setRitualSettings(saved);
    } catch (err) {
      setRitualSettings(previous);
      Alert.alert('Could not save ritual settings', err?.message || String(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const saveNotificationPatch = async (patch) => {
    if (!family?.id || !user?.id || savingNotifications) return;
    const previous = notificationPreferences;
    const optimistic = mergeNotificationPreferences(previous, patch);
    setSavingNotifications(true);
    setNotificationPreferences(optimistic);
    try {
      const saved = await saveNotificationPreferences({
        familyId: family.id,
        userId: user.id,
        base: previous,
        patch,
      });
      setNotificationPreferences(saved);
    } catch (err) {
      setNotificationPreferences(previous);
      Alert.alert('Could not save notification settings', err?.message || String(err));
    } finally {
      setSavingNotifications(false);
    }
  };

  const ritualDetails = useMemo(() => ({
    prompt: `Prompt at ${formatPromptTime(ritualSettings.dailyPromptTime)}`,
    digest: `${formatDigestDay(ritualSettings.weeklyDigestDay)} summary from moments`,
    monthiversary: formatMonthiversary(ritualSettings),
    notifications: `${enabledNotificationCount(notificationPreferences)} on · quiet ${formatQuietHours(notificationPreferences)}`,
  }), [notificationPreferences, ritualSettings]);

  const setMode = (mode) => {
    Haptics.selectionAsync();
    theme.setMode(mode);
  };

  const setPalette = async (paletteName) => {
    Haptics.selectionAsync();
    theme.setPaletteName(paletteName);
    if (family?.id) {
      Family.update(family.id, { palettePreference: paletteName })
        .then(() => refreshFamily?.())
        .catch((err) => console.warn('save palette preference', err?.message));
    }
  };

  const go = (route) => {
    Haptics.selectionAsync();
    router.replace(route);
  };
  const discoveryRoute = referenceSummary.total || !family?.babyBirthday
    ? '/reference'
    : { pathname: '/reference', params: { autoSeed: '1' } };

  const resetReferenceProfile = () => {
    if (!family?.id || !user?.id || clearingReferences) return;
    Alert.alert(
      'Restart photo discovery?',
      'This clears this device’s face references, review learning, and scan progress. Saved family moments stay in the archive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setClearingReferences(true);
            try {
              Scan.reset();
              await Promise.all([
                clearReferenceProfile({ familyId: family.id, userId: user.id }),
                clearImportCalibration({ familyId: family.id, userId: user.id }),
                clearScanCheckpoint({ familyId: family.id, userId: user.id }),
                resetFamilyLibraryConnection({ familyId: family.id, userId: user.id }),
              ]);
              setReferenceSummary(DEFAULT_REFERENCE_SUMMARY);
              setActiveEditor(null);
              router.replace('/reference');
            } catch (err) {
              Alert.alert('Could not reset references', err?.message || String(err));
            } finally {
              setClearingReferences(false);
            }
          },
        },
      ],
    );
  };

  const restoreStorePurchases = async () => {
    if (!family?.id || billingBusy) return;
    setBillingBusy('restore');
    try {
      const purchases = await getStorePurchases({
        alsoPublishToEventListenerIOS: false,
        onlyIncludeActiveItemsIOS: true,
      });
      const purchase = (purchases || [])
        .filter((item) => SUBSCRIPTION_PRODUCT_IDS.includes(item.productId))
        .sort((a, b) => Number(b.transactionDate || 0) - Number(a.transactionDate || 0))[0];
      if (!purchase) {
        Alert.alert('No active purchase found', 'No active family subscription was found on this store account.');
        return;
      }
      await verifyStorePurchase({
        familyId: family.id,
        purchase,
        provider: Platform.OS === 'ios' ? 'apple' : 'google',
        productId: purchase.productId,
      });
      await finishTransaction({ purchase, isConsumable: false });
      await refreshBilling?.();
      Alert.alert('Purchase restored', 'Your family plan is active.');
    } catch (err) {
      Alert.alert('Restore failed', err?.message || String(err));
    } finally {
      setBillingBusy(null);
    }
  };

  const manageSubscription = async () => {
    if (billingBusy) return;
    setBillingBusy('manage');
    try {
      if (entitlement?.source === 'stripe') {
        const url = await createBillingPortal({ familyId: family?.id });
        if (url) {
          await Linking.openURL(url);
          return;
        }
      }
      await openManageSubscription({ source: entitlement?.source });
    } catch (err) {
      Alert.alert('Could not open billing', err?.message || String(err));
    } finally {
      setBillingBusy(null);
    }
  };

  const redeemBillingCode = async () => {
    const trimmed = purchaseCode.trim();
    if (!trimmed || billingBusy) return;
    setBillingBusy('redeem');
    try {
      await redeemCode(trimmed);
      setPurchaseCode('');
      Alert.alert('Code redeemed', GIFT_REDEMPTION_COPY.successStatus);
    } catch (err) {
      Alert.alert('Code could not be redeemed', err?.message || String(err));
    } finally {
      setBillingBusy(null);
    }
  };

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Our Little World billing help')}`);
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'You can sign back in any time. Your saved family archive stays in Our Little World; private drafts and on-device discovery are cleared from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => signOut().catch((error) => {
            Alert.alert('Could not sign out', error?.message || 'Try again.');
          }),
        },
      ],
    );
  };

  return (
    <Screen bare>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={[styles.root, { backgroundColor: theme.semantic.card }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.settingsTopBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            style={[styles.settingsBackButton, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.semantic.textSoft} />
          </Pressable>
          <Title style={styles.settingsTopTitle}>Settings</Title>
          <View style={styles.settingsTopSpacer} />
        </View>
        <FamilyHero family={family} />

        <View style={[styles.themePanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <View style={styles.themePanelHeader}>
            <View>
              <Eyebrow>Theme</Eyebrow>
              <Caption style={styles.themeCaption}>
                {theme.paletteLabel} · {theme.mode === 'system' ? `Auto (${theme.scheme})` : theme.mode}
              </Caption>
            </View>
            <View style={[styles.themePreview, { backgroundColor: theme.colors.bg, borderColor: theme.colors.border }]}>
              <View style={[styles.themePreviewDot, { backgroundColor: theme.colors.primary }]} />
              <View style={[styles.themePreviewDot, { backgroundColor: theme.colors.accent }]} />
            </View>
          </View>

          <View style={styles.themeModeRow}>
            {THEME_MODE_OPTIONS.map((option) => {
              const active = theme.mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMode(option.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} theme mode`}
                  accessibilityState={{ checked: active }}
                  android_ripple={{ color: theme.colors.primarySoft }}
                  style={[
                    styles.themeModeButton,
                    {
                      backgroundColor: active ? theme.semantic.primary : theme.semantic.card,
                      borderColor: active ? theme.semantic.primary : theme.semantic.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={14}
                    color={active ? theme.colors.onPrimary : theme.semantic.textSoft}
                  />
                  <Caption
                    style={[
                      styles.themeModeText,
                      { color: active ? theme.colors.onPrimary : theme.semantic.textSoft },
                    ]}
                  >
                    {option.label}
                  </Caption>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.paletteQuickRow}>
            {PALETTE_NAMES.map((name) => {
              const meta = palettes[name];
              const slots = meta[theme.scheme];
              const active = theme.paletteName === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => setPalette(name)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Use ${meta.label} palette`}
                  accessibilityState={{ checked: active }}
                  style={[
                    styles.paletteQuickButton,
                    {
                      backgroundColor: slots.bg,
                      borderColor: active ? slots.primary : theme.semantic.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.paletteQuickSwatches}>
                    <View style={[styles.paletteQuickSwatch, { backgroundColor: slots.primary }]} />
                    <View style={[styles.paletteQuickSwatch, { backgroundColor: slots.accent }]} />
                  </View>
                  {active ? <Ionicons name="checkmark" size={13} color={slots.ink} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Eyebrow>our family</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="person-circle-outline"
              label={`${family?.babyName || 'Child'} profile`}
              detail="Name, birthday, photo access"
              onPress={() => go('/setup')}
            />
            <MenuItem
              icon="person-add-outline"
              label="Family circle"
              detail={`${settingsCounts.sharedWithCount || 0} ${plural(settingsCounts.sharedWithCount, 'member', 'members')} · ${settingsCounts.circleCount || 0} view-only`}
              onPress={() => go('/invite')}
            />
            <MenuItem
              icon="sparkles"
              label="Reference profile"
              detail={referenceSummary.total
                ? `${referenceSummary.total} local ${plural(referenceSummary.total, 'reference', 'references')} · ${referenceSummary.trusted} trusted`
                : 'Start birthday-first discovery'}
              tint={theme.semantic.primary}
              active={activeEditor === 'reference'}
              onPress={() => setActiveEditor(activeEditor === 'reference' ? null : 'reference')}
            />
            <MenuItem
              icon="images-outline"
              label="Automatic discovery"
              detail="Birthday-first matching and review settings"
              onPress={() => go(discoveryRoute)}
            />
          </View>
          {activeEditor === 'reference' ? (
            <ReferenceProfilePanel
              summary={referenceSummary}
              clearing={clearingReferences}
              onUpdate={() => go(discoveryRoute)}
              onScan={() => go('/scan')}
              onReset={resetReferenceProfile}
            />
          ) : null}
        </View>

        <View>
          <Eyebrow>billing</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="card-outline"
              label="Subscription"
              detail={entitlementStatusLabel(entitlement)}
              active={activeEditor === 'billing'}
              onPress={() => setActiveEditor(activeEditor === 'billing' ? null : 'billing')}
            />
            {activeEditor === 'billing' ? (
              <BillingPanel
                entitlement={entitlement}
                usage={storageUsage}
                code={purchaseCode}
                busy={billingBusy}
                embedded
                onCodeChange={setPurchaseCode}
                onRedeem={redeemBillingCode}
                onManage={manageSubscription}
                onSupport={contactSupport}
              />
            ) : null}
            <MenuItem
              icon="refresh-outline"
              label="Restore purchases"
              detail={billingBusy === 'restore' ? 'Checking store account...' : 'Apple App Store or Google Play'}
              onPress={restoreStorePurchases}
            />
            <MenuItem
              icon="settings-outline"
              label="Manage subscription"
              detail={entitlement?.source === 'stripe' ? 'Website billing portal' : 'Store subscription settings'}
              onPress={manageSubscription}
            />
            <MenuItem
              icon="document-text-outline"
              label="Terms"
              detail="Subscription, cancellation, refund, and gift terms"
              onPress={() => Linking.openURL('https://ourlittleworld.me/terms/')}
            />
            <MenuItem
              icon="receipt-outline"
              label="Refunds"
              detail="Cancellation, duplicate purchase, and gift refund policy"
              onPress={() => Linking.openURL('https://ourlittleworld.me/refunds/')}
            />
            <MenuItem
              icon="shield-checkmark-outline"
              label="Privacy"
              detail="Private family archive policy"
              onPress={() => Linking.openURL('https://ourlittleworld.me/privacy/')}
            />
            <MenuItem
              icon="mail-outline"
              label="Contact support"
              detail={SUPPORT_EMAIL}
              onPress={contactSupport}
            />
          </View>
        </View>

        <View
          onLayout={(event) => {
            setNotificationsSectionY(event.nativeEvent.layout.y);
          }}
        >
          <Eyebrow>rituals</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="sparkles-outline"
              label="Daily memory prompt"
              detail={ritualDetails.prompt}
              active={activeEditor === 'prompt'}
              onPress={() => setActiveEditor(activeEditor === 'prompt' ? null : 'prompt')}
            />
            <MenuItem
              icon="calendar-outline"
              label="Weekly digest"
              detail={ritualDetails.digest}
              active={activeEditor === 'digest'}
              onPress={() => setActiveEditor(activeEditor === 'digest' ? null : 'digest')}
            />
            <MenuItem
              icon="moon-outline"
              label="Monthiversary nudge"
              detail={ritualDetails.monthiversary}
              active={activeEditor === 'monthiversary'}
              onPress={() => setActiveEditor(activeEditor === 'monthiversary' ? null : 'monthiversary')}
            />
            <View
              onLayout={(event) => {
                setNotificationsRowY(event.nativeEvent.layout.y);
              }}
            >
              <MenuItem
                icon="notifications-outline"
                label="Notifications"
                detail={ritualDetails.notifications}
                active={activeEditor === 'notifications'}
                onPress={() => setActiveEditor(activeEditor === 'notifications' ? null : 'notifications')}
              />
            </View>
          </View>
          {['prompt', 'digest', 'monthiversary'].includes(activeEditor) ? (
            <RitualEditor
              type={activeEditor}
              settings={ritualSettings}
              saving={savingSettings}
              family={family}
              onSave={saveRitualPatch}
            />
          ) : null}
          {activeEditor === 'notifications' ? (
            <NotificationPreferencesPanel
              preferences={notificationPreferences}
              saving={savingNotifications}
              onSave={saveNotificationPatch}
            />
          ) : null}
        </View>

        <View>
          <Eyebrow>the archive</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="book-outline"
              label="Library"
              detail={`${settingsCounts.momentCount || 0} saved ${plural(settingsCounts.momentCount, 'moment', 'moments')} · search and places`}
              onPress={() => go('/library')}
            />
            <MenuItem
              icon="download-outline"
              label="Export to photo book"
              detail={`${settingsCounts.exportableMomentCount || 0} ${plural(settingsCounts.exportableMomentCount, 'moment', 'moments')} ready · ${settingsCounts.digestCount || 0} ${plural(settingsCounts.digestCount, 'digest', 'digests')}`}
              onPress={() => go({ pathname: '/library', params: { segment: 'export' } })}
            />
            <MenuItem
              icon="mail-outline"
              label="Time capsules"
              detail={`${settingsCounts.timeCapsuleCount || 0} sealed ${plural(settingsCounts.timeCapsuleCount, 'letter', 'letters')}`}
              onPress={() => go('/letters')}
            />
            <MenuItem
              icon="shield-checkmark-outline"
              label="Privacy"
              detail={`Shared with ${settingsCounts.sharedWithCount || 0} ${plural(settingsCounts.sharedWithCount, 'person', 'people')}`}
              active={activeEditor === 'privacy'}
              onPress={() => setActiveEditor(activeEditor === 'privacy' ? null : 'privacy')}
            />
          </View>
          {activeEditor === 'privacy' ? (
            <PrivacyPanel
              counts={settingsCounts}
              onManage={() => go('/invite')}
              onReview={() => go({ pathname: '/library', params: { segment: 'search' } })}
            />
          ) : null}
        </View>

        <View>
          <Eyebrow>account</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="log-out-outline"
              label="Sign out"
              detail={user?.email || 'Keep this account and sign out on this device'}
              onPress={confirmSignOut}
            />
            <MenuItem
              icon="trash-outline"
              label="Delete account"
              detail="Export, review the impact, then permanently delete"
              tint={theme.colors.danger}
              onPress={() => router.push('/delete-account')}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function FamilyHero({ family }) {
  const theme = useTheme();
  const age = family?.babyBirthday ? formatAge(ageAt(family.babyBirthday, Date.now())) : '';
  const initial = (family?.babyName || family?.name || 'O').slice(0, 1).toUpperCase();
  return (
    <View style={[styles.familyHero, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <View style={[styles.familyAvatar, { backgroundColor: theme.semantic.primary }]}>
        <Title style={[styles.familyAvatarText, { color: theme.colors.onPrimary }]}>{initial}</Title>
      </View>
      <View style={styles.familyHeroText}>
        <Caption>Our family</Caption>
        <Title style={styles.familyHeroName}>{family?.babyName || 'Your little one'}</Title>
        <Caption>
          {family?.babyBirthday || 'Birthday not set'}{age ? ` · ${age} old` : ''}
        </Caption>
      </View>
    </View>
  );
}

function BillingPanel({ entitlement, usage, code, busy, embedded = false, onCodeChange, onRedeem, onManage, onSupport }) {
  const theme = useTheme();
  const active = entitlement?.isActive;
  const ownerCopy = entitlement?.isBillingOwner
    ? 'You are the billing owner for this family.'
    : 'Billing owner changes are handled by support.';
  const expiry = entitlement?.expiresAt ? formatShortDate(entitlement.expiresAt) : null;
  const showUsage = active && usage;

  return (
    <View
      style={[
        styles.editorPanel,
        embedded && styles.embeddedEditorPanel,
        { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border },
      ]}
    >
      <View style={styles.billingHeader}>
        <View>
          <Caption>Family access</Caption>
          <Title style={styles.panelMetric}>{entitlementStatusLabel(entitlement)}</Title>
        </View>
        <View style={[styles.billingBadge, { backgroundColor: active ? theme.colors.primarySoft : theme.semantic.card }]}>
          <Ionicons
            name={active ? 'checkmark-circle' : 'alert-circle-outline'}
            size={20}
            color={active ? theme.semantic.primary : theme.semantic.textMuted}
          />
        </View>
      </View>
      <Caption>
        {expiry ? `Access through ${expiry}. ` : ''}
        One family subscription currently covers one child and one invited co-parent.
      </Caption>
      <Caption>{ownerCopy}</Caption>
      {showUsage ? (
        <View style={styles.referenceStats}>
          <ReferenceStat
            label={`of ${formatBytes(entitlement.optimizedMediaQuotaBytes)} used`}
            value={formatBytes(usage.optimizedMediaBytes)}
          />
          <ReferenceStat
            label={`of ${formatVideoMinutes(entitlement.videoQuotaSeconds)} video`}
            value={formatVideoMinutes(usage.videoSeconds)}
          />
          <ReferenceStat
            label="memories"
            value={usage.objectCount}
          />
        </View>
      ) : null}
      {showUsage && entitlement.originalsEnabled ? (
        <Caption>
          Original backup: {formatBytes(usage.originalMediaBytes)} of {formatBytes(entitlement.originalQuotaBytes)} used.
        </Caption>
      ) : null}

      <Field
        label={GIFT_REDEMPTION_COPY.fieldLabel}
        value={code}
        onChangeText={onCodeChange}
        caption={GIFT_REDEMPTION_COPY.caption}
        autoCapitalize="characters"
        inputProps={{ autoCorrect: false, spellCheck: false, textContentType: 'oneTimeCode' }}
        containerStyle={styles.billingCodeField}
      />
      <View style={styles.panelButtonRow}>
        <Pressable
          onPress={onRedeem}
          disabled={busy === 'redeem'}
          accessibilityRole="button"
          accessibilityLabel="Redeem purchase code"
          accessibilityState={{ disabled: busy === 'redeem' }}
          style={[
            styles.panelButton,
            styles.panelButtonInline,
            { backgroundColor: theme.semantic.primary, borderColor: theme.semantic.primary },
          ]}
        >
          <Caption style={[styles.panelButtonText, { color: theme.colors.onPrimary }]}>
            {busy === 'redeem' ? 'Redeeming...' : 'Redeem'}
          </Caption>
        </Pressable>
        <Pressable
          onPress={onManage}
          disabled={busy === 'manage'}
          accessibilityRole="button"
          accessibilityLabel="Manage subscription"
          accessibilityState={{ disabled: busy === 'manage' }}
          style={[
            styles.panelButton,
            styles.panelButtonInline,
            { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border },
          ]}
        >
          <Caption style={[styles.panelButtonText, { color: theme.semantic.textSoft }]}>
            {busy === 'manage' ? 'Opening...' : 'Manage'}
          </Caption>
        </Pressable>
      </View>
      <Pressable
        onPress={onSupport}
        accessibilityRole="button"
        accessibilityLabel="Contact support about billing"
        style={styles.referenceReset}
      >
        <Caption style={[styles.referenceResetText, { color: theme.semantic.textMuted }]}>
          Contact support for billing owner changes or duplicate purchases
        </Caption>
      </Pressable>
    </View>
  );
}

function RitualEditor({ type, settings, saving, family, onSave }) {
  const theme = useTheme();
  if (type === 'prompt') {
    return (
      <View style={[styles.editorPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
        <Caption>Daily prompt time</Caption>
        <SegmentedControl
          value={settings.dailyPromptTime}
          options={PROMPT_TIME_OPTIONS}
          onChange={(dailyPromptTime) => onSave({ dailyPromptTime })}
          style={styles.editorControl}
        />
        <Caption>{saving ? 'Saving...' : `Your prompt will surface around ${formatPromptTime(settings.dailyPromptTime)}.`}</Caption>
      </View>
    );
  }
  if (type === 'digest') {
    return (
      <View style={[styles.editorPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
        <Caption>Weekly digest day</Caption>
        <SegmentedControl
          value={settings.weeklyDigestDay}
          options={WEEKDAY_OPTIONS}
          onChange={(weeklyDigestDay) => onSave({ weeklyDigestDay })}
          style={styles.editorControl}
        />
        <Caption>{saving ? 'Saving...' : `${formatDigestDay(settings.weeklyDigestDay)} is the family digest day.`}</Caption>
      </View>
    );
  }

  const birthdayMonthiversaryDay = monthiversaryDayForFamily(family) ?? settings.monthiversaryDay;
  return (
    <View style={[styles.editorPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <Caption>Monthiversary nudge</Caption>
      <SegmentedControl
        value={settings.monthiversaryEnabled ? 'on' : 'off'}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        onChange={(value) => onSave({
          monthiversaryEnabled: value === 'on',
          monthiversaryDay: value === 'on' ? birthdayMonthiversaryDay : settings.monthiversaryDay,
        })}
        style={styles.editorControl}
      />
      <Caption>{saving ? 'Saving...' : monthiversaryHelperText(settings, family)}</Caption>
    </View>
  );
}

function NotificationPreferencesPanel({ preferences, saving, onSave }) {
  const theme = useTheme();
  const enabledCount = enabledNotificationCount(preferences);
  return (
    <View style={[styles.editorPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <View style={styles.notificationHeader}>
        <View>
          <Caption>Push notifications</Caption>
          <Title style={styles.panelMetric}>{enabledCount} on</Title>
        </View>
        <View style={[styles.billingBadge, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="notifications-outline" size={20} color={theme.semantic.primary} />
        </View>
      </View>
      <Caption>{saving ? 'Saving...' : 'Quiet family updates, capped at two per day unless transactional.'}</Caption>

      <View style={styles.quietHoursBlock}>
        <Caption>Quiet starts</Caption>
        <SegmentedControl
          value={preferences.quietStart}
          options={QUIET_START_OPTIONS}
          onChange={(quietStart) => onSave({ quietStart })}
          style={styles.editorControl}
        />
        <Caption>Quiet ends</Caption>
        <SegmentedControl
          value={preferences.quietEnd}
          options={QUIET_END_OPTIONS}
          onChange={(quietEnd) => onSave({ quietEnd })}
          style={styles.editorControl}
        />
      </View>

      <View style={styles.notificationList}>
        {NOTIFICATION_CATEGORIES.map((category) => (
          <NotificationPreferenceRow
            key={category.key}
            category={category}
            enabled={!!preferences.categories?.[category.key]}
            disabled={saving}
            onChange={(enabled) => onSave({ categories: { [category.key]: enabled } })}
          />
        ))}
        <NotificationPreferenceRow
          category={TRANSACTIONAL_NOTIFICATION_CATEGORY}
          enabled
          disabled
          locked
        />
      </View>
    </View>
  );
}

function NotificationPreferenceRow({ category, enabled, disabled = false, locked = false, onChange }) {
  const theme = useTheme();
  return (
    <View style={[styles.notificationRow, { borderColor: theme.semantic.border }]}>
      <View style={styles.notificationRowText}>
        <Body style={styles.privacyPolicyTitle}>{category.label}</Body>
        <Caption>{category.detail}</Caption>
      </View>
      <Switch
        value={!!enabled}
        disabled={disabled || locked}
        onValueChange={onChange}
        trackColor={{ false: theme.semantic.border, true: theme.colors.primarySoft }}
        thumbColor={enabled ? theme.semantic.primary : theme.semantic.card}
        ios_backgroundColor={theme.semantic.border}
      />
    </View>
  );
}

function PrivacyPanel({ counts, onManage, onReview }) {
  const theme = useTheme();
  return (
    <View style={[styles.editorPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <Caption>Shared archive access</Caption>
      <Title style={styles.panelMetric}>{counts.sharedWithCount || 0} {plural(counts.sharedWithCount, 'person', 'people')}</Title>
      <Caption>{counts.circleCount || 0} view-only circle {plural(counts.circleCount, 'member', 'members')}</Caption>
      <View style={styles.privacyPolicyList}>
        <PrivacyPolicyRow
          icon="create-outline"
          title="Co-parents can add and edit"
          body="The two family writers can save moments, prompts, letters, and archive details."
        />
        <PrivacyPolicyRow
          icon="eye-outline"
          title="Family circle is view-only"
          body="Circle members can see moments that are shared to the circle, without writer controls."
        />
        <PrivacyPolicyRow
          icon="lock-closed-outline"
          title="Moments start private"
          body="Saved moments stay between co-parents until a moment is shared to the circle."
        />
      </View>
      <View style={styles.panelButtonRow}>
        <Pressable
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel="Manage family circle"
          style={[
            styles.panelButton,
            styles.panelButtonInline,
            { backgroundColor: theme.semantic.primary, borderColor: theme.semantic.primary },
          ]}
        >
          <Caption style={[styles.panelButtonText, { color: theme.colors.onPrimary }]}>Manage circle</Caption>
        </Pressable>
        <Pressable
          onPress={onReview}
          accessibilityRole="button"
          accessibilityLabel="Review shared moments"
          style={[
            styles.panelButton,
            styles.panelButtonInline,
            { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border },
          ]}
        >
          <Caption style={[styles.panelButtonText, { color: theme.semantic.textSoft }]}>Review moments</Caption>
        </Pressable>
      </View>
    </View>
  );
}

function PrivacyPolicyRow({ icon, title, body }) {
  const theme = useTheme();
  return (
    <View style={styles.privacyPolicyRow}>
      <View style={[styles.privacyPolicyIcon, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
        <Ionicons name={icon} size={15} color={theme.semantic.primary} />
      </View>
      <View style={styles.privacyPolicyText}>
        <Body style={styles.privacyPolicyTitle}>{title}</Body>
        <Caption>{body}</Caption>
      </View>
    </View>
  );
}

function ReferenceProfilePanel({ summary, clearing, onUpdate, onScan, onReset }) {
  const theme = useTheme();
  const ready = summary.total > 0;
  return (
    <View style={[styles.editorPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <View style={styles.referenceHeader}>
        <View>
          <Caption>Local discovery profile</Caption>
          <Title style={styles.panelMetric}>{summary.total} {plural(summary.total, 'reference', 'references')}</Title>
        </View>
        <View style={[styles.referenceBadge, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name={ready ? 'sparkles' : 'image-outline'} size={18} color={theme.semantic.primary} />
        </View>
      </View>
      <View style={styles.referenceStats}>
        <ReferenceStat label="trusted" value={summary.trusted} />
        <ReferenceStat label="picked" value={summary.seeded} />
        <ReferenceStat label="latest" value={summary.latestAgeLabel} />
      </View>
      <Caption>{summary.latestSourceLabel}</Caption>
      <View style={styles.panelButtonRow}>
        <Pressable
          onPress={onUpdate}
          accessibilityRole="button"
          accessibilityLabel={ready ? 'Update reference photo' : 'Set up automatic discovery'}
          style={[
            styles.panelButton,
            styles.panelButtonInline,
            { backgroundColor: theme.semantic.primary, borderColor: theme.semantic.primary },
          ]}
        >
          <Caption style={[styles.panelButtonText, { color: theme.colors.onPrimary }]}>
            {ready ? 'Update photo' : 'Set up discovery'}
          </Caption>
        </Pressable>
        <Pressable
          onPress={onScan}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Scan with reference profile"
          accessibilityState={{ disabled: !ready }}
          style={[
            styles.panelButton,
            styles.panelButtonInline,
            {
              backgroundColor: ready ? theme.semantic.card : theme.semantic.cardAlt,
              borderColor: theme.semantic.border,
              opacity: ready ? 1 : 0.45,
            },
          ]}
        >
          <Caption style={[styles.panelButtonText, { color: theme.semantic.textSoft }]}>Scan</Caption>
        </Pressable>
      </View>
      {ready ? (
        <Pressable
          onPress={onReset}
          disabled={clearing}
          accessibilityRole="button"
          accessibilityLabel="Restart photo discovery"
          accessibilityState={{ disabled: clearing }}
          style={styles.referenceReset}
        >
          <Caption style={[styles.referenceResetText, { color: theme.semantic.textMuted }]}>
            {clearing ? 'Restarting...' : 'Restart photo discovery'}
          </Caption>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReferenceStat({ label, value }) {
  return (
    <View style={styles.referenceStat}>
      <Body style={styles.referenceStatValue}>{value}</Body>
      <Caption>{label}</Caption>
    </View>
  );
}

function MenuItem({ icon, label, detail, onPress, tint, active = false }) {
  const theme = useTheme();
  const iconColor = tint || (active ? theme.semantic.primary : theme.semantic.textSoft);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityState={active ? { expanded: true } : undefined}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [
        styles.menuItem,
        active && { backgroundColor: theme.semantic.cardAlt },
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View style={[styles.menuItemIcon, { backgroundColor: theme.semantic.cardAlt }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.menuItemText}>
        <Body style={styles.menuItemLabel}>{label}</Body>
        <Caption>{detail}</Caption>
      </View>
      <View style={styles.menuItemChevron}>
        <Ionicons name={active ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.semantic.textMuted} />
      </View>
    </Pressable>
  );
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralValue;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthiversaryHelperText(settings, family) {
  const name = family?.babyName || 'Your child';
  if (!settings?.monthiversaryEnabled) {
    return `Off. Turn it on to use ${name}'s birthday for monthly memory nudges.`;
  }
  const label = formatMonthiversary(settings).replace(' monthly', '');
  return `${name}'s birthday sets this automatically: ${label} each month.`;
}

function summarizeReferenceProfile(profile, family) {
  const references = Array.isArray(profile?.references) ? profile.references : [];
  if (!references.length) return DEFAULT_REFERENCE_SUMMARY;
  const trusted = references.filter((reference) => reference.source === 'trusted-save').length;
  const seeded = references.length - trusted;
  const latest = references[references.length - 1];
  let latestAgeLabel = 'age unknown';
  if (family?.babyBirthday && latest?.ageAtCaptureDays != null) {
    const birthMs = new Date(`${family.babyBirthday}T00:00:00`).getTime();
    const capturedMs = birthMs + latest.ageAtCaptureDays * 86400000;
    latestAgeLabel = formatAge(ageAt(family.babyBirthday, capturedMs)) || 'age unknown';
  }
  const latestSourceLabel = trusted
    ? `${trusted} trusted ${plural(trusted, 'save', 'saves')} now refresh future scans on this device.`
    : 'Only local reference photos are stored on this device so far.';
  return {
    total: references.length,
    trusted,
    seeded,
    latestAgeLabel,
    latestSourceLabel,
    updatedAt: profile?.updatedAt || null,
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  settingsTopBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  settingsBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTopTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 30,
    fontStyle: 'italic',
  },
  settingsTopSpacer: {
    width: 44,
    height: 44,
  },
  familyHero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  familyAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyAvatarText: {
    fontSize: 24,
    lineHeight: 30,
  },
  familyHeroText: {
    flex: 1,
  },
  familyHeroName: {
    fontSize: 21,
    lineHeight: 26,
    marginVertical: 2,
  },
  themePanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
  },
  themePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  themeCaption: {
    marginTop: 2,
    textTransform: 'capitalize',
    letterSpacing: 0,
  },
  themePreview: {
    width: 48,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  themePreviewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  themeModeRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  themeModeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  themeModeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'none',
    letterSpacing: 0,
  },
  paletteQuickRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  paletteQuickButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteQuickSwatches: {
    flexDirection: 'row',
    gap: 3,
  },
  paletteQuickSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  menuList: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.whisper,
  },
  menuItem: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.md,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    minWidth: 0,
  },
  menuItemLabel: {
    fontSize: 14,
    lineHeight: 19,
  },
  menuItemChevron: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorPanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
    marginTop: space.sm,
  },
  embeddedEditorPanel: {
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    marginTop: 0,
    paddingTop: space.md,
  },
  editorControl: {
    marginTop: 2,
  },
  panelMetric: {
    fontSize: 23,
    lineHeight: 29,
  },
  privacyPolicyList: {
    gap: space.sm,
    marginTop: space.sm,
  },
  privacyPolicyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  privacyPolicyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  privacyPolicyText: {
    flex: 1,
  },
  privacyPolicyTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  referenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  referenceBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  quietHoursBlock: {
    gap: space.xs,
    marginTop: space.xs,
  },
  notificationList: {
    gap: space.sm,
    marginTop: space.sm,
  },
  notificationRow: {
    minHeight: 62,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.sm,
  },
  notificationRowText: {
    flex: 1,
  },
  billingBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingCodeField: {
    marginTop: space.sm,
  },
  referenceStats: {
    flexDirection: 'row',
    gap: space.sm,
  },
  referenceStat: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
  },
  referenceStatValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  panelButtonRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  panelButton: {
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginTop: space.xs,
  },
  panelButtonInline: {
    flex: 1,
    borderWidth: 1,
    marginTop: 0,
  },
  panelButtonText: {
    fontWeight: '800',
  },
  referenceReset: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceResetText: {
    fontWeight: '700',
  },
});
