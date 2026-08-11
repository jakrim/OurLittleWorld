import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  Body,
  Button,
  Caption,
  Eyebrow,
  EntranceView,
  Hero,
  radius,
  space,
  useTheme,
} from './ui';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import { ageAt, formatAge } from './ageModel';
import {
  ensureNightlySession,
  getTonightSummary,
} from './candidateLedgerStore';
import { useMediaLibraryChangeObserver } from './mediaLibraryChanges';
import { getNotificationPreferences } from './notificationSettings';
import {
  photoFirstHomeMediaHeight,
  selectPhotoFirstHome,
} from './photoFirstHomeModel';
import { getFamilyRitualSettings } from './ritualSettings';
import { refreshFamilySavedDayCoverage } from './savedDayCoverage';
import * as Scan from './scanController';
import { maybeScheduleTonightNotification } from './tonightNotifications';
import { useRitualHomeData } from './useRitualHomeData';
import { trackAnalyticsEvent } from './analytics';
import { bucketCount } from './analyticsEventsModel';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import { localDayInTimeZone } from './firstYearCatchupModel';
import { parentReasonLabel } from './nightlyQueueModel';
import { buildTodayManualQaFixture } from './todayManualQaFixtures';
import { isManualQaRuntime } from './manualQaRuntime';

export default function TodayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { height: viewportHeight } = useWindowDimensions();
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const writer = ['creator', 'partner'].includes(family?.me?.role);
  const canUsePrivateDiscovery = !billingLoading
    && entitlement?.isActive === true
    && writer
    && !!family?.id
    && !!user?.id;
  const [tonightSession, setTonightSession] = useState(null);
  const [tonightSummary, setTonightSummary] = useState(null);
  const manualQaFixture = useMemo(
    () => (isManualQaRuntime() ? buildTodayManualQaFixture(params.qa) : null),
    [params.qa],
  );
  const scanState = Scan.useScanState();

  useMediaLibraryChangeObserver({
    familyId: family?.id,
    userId: user?.id,
    enabled: canUsePrivateDiscovery,
  });

  const { sharedPhotos, membersById } = useRitualHomeData({
    familyId: family?.id,
    userId: user?.id,
    babyBirthday: family?.babyBirthday,
    babyName: family?.babyName,
  });

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (manualQaFixture) {
      setTonightSession(manualQaFixture.session);
      setTonightSummary(manualQaFixture.summary);
      return () => { alive = false; };
    }
    if (!canUsePrivateDiscovery) {
      setTonightSession(null);
      setTonightSummary(null);
      return () => { alive = false; };
    }
    (async () => {
      try {
        const [preferences, ritualSettings] = await Promise.all([
          getNotificationPreferences({ familyId: family.id, userId: user.id }),
          getFamilyRitualSettings({ familyId: family.id, family }),
        ]);
        await refreshFamilySavedDayCoverage({
          familyId: family.id,
          timezone: ritualSettings.timezone,
        }).catch(() => null);
        if (!alive) return;
        const session = ensureNightlySession({
          familyId: family.id,
          userId: user.id,
          timezone: ritualSettings.timezone === 'local' ? undefined : ritualSettings.timezone,
        });
        setTonightSession(session);
        setTonightSummary(getTonightSummary({
          familyId: family.id,
          userId: user.id,
          timezone: session?.timezone,
        }));
        if (session?.status === 'active' && !session.completed) {
          try {
            const scheduled = await maybeScheduleTonightNotification({
              familyId: family.id,
              userId: user.id,
              session,
              preferences,
              role: family.me.role,
              entitlementActive: entitlement.isActive,
              timezone: session.timezone || ritualSettings.timezone,
              targetTime: ritualSettings.dailyPromptTime,
            });
            if (scheduled?.scheduled) {
              const timezone = session.timezone || ritualSettings.timezone;
              trackAnalyticsEvent('tonight_notification_scheduled', {
                surface: 'notification',
                queue_count_bucket: bucketCount(session.items?.length || 0),
                schedule_day: localDayInTimeZone(scheduled.triggerDate, timezone) === session.localDay
                  ? 'same_local_day'
                  : 'next_local_day',
              }, {
                family_id: family.id,
                actor_role: family.me.role,
                plan_state: 'active',
                platform: analyticsPlatform('ios'),
                environment: analyticsEnvironment(),
              });
            }
          } catch {
            // Tonight is local product value. Optional notification delivery
            // must never erase or replace a ready memory on Today.
            console.warn('tonight notification unavailable');
          }
        }
      } catch {
        console.warn('tonight queue summary unavailable');
        if (alive) {
          setTonightSession(null);
          setTonightSummary(null);
        }
      }
    })();
    return () => { alive = false; };
  }, [canUsePrivateDiscovery, entitlement?.isActive, family, manualQaFixture, user?.id]));

  const home = useMemo(
    () => selectPhotoFirstHome({ tonightSession, sharedPhotos, membersById }),
    [membersById, sharedPhotos, tonightSession],
  );
  const memoryAge = useMemo(() => {
    if (!home.capturedAt || !family?.babyBirthday) return '';
    const value = ageAt(family.babyBirthday, home.capturedAt.getTime());
    return value ? formatAge(value) : '';
  }, [family?.babyBirthday, home.capturedAt]);
  const mediaHeight = photoFirstHomeMediaHeight(viewportHeight);
  const title = family?.babyName ? `${family.babyName}'s world` : 'Today';
  const queueCount = tonightSummary?.status === 'active'
    ? tonightSummary.count
    : home.remaining;

  const openHero = () => {
    if (home.kind === 'tonight') {
      router.push({
        pathname: '/tonight',
        params: {
          source: 'today',
          ...(manualQaFixture ? { qa: 'photo-first' } : {}),
        },
      });
      return;
    }
    if (home.kind === 'kept' && home.momentId) {
      router.push({ pathname: '/moment/[momentId]', params: { momentId: home.momentId } });
    }
  };

  return (
    <AppShell active="today" title={title} showActivityButton>
      <EntranceView index={0}>
        {home.mediaUri ? (
          <Pressable
            onPress={openHero}
            disabled={home.kind === 'kept' && !home.momentId}
            accessibilityRole="button"
            accessibilityLabel={home.kind === 'tonight'
              ? `Review Tonight. ${queueCount} ${queueCount === 1 ? 'memory' : 'memories'} ready.`
              : 'Open this kept memory in Our World'}
            style={[styles.memoryHero, { height: mediaHeight, backgroundColor: theme.semantic.cardAlt }]}
            testID="today-photo-hero"
          >
            <Image
              source={{ uri: home.mediaUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel="Family memory"
            />
            <View style={styles.heroShade} />
            <LinearGradient
              colors={['rgba(20,14,13,0)', 'rgba(20,14,13,0.72)']}
              locations={[0, 1]}
              pointerEvents="none"
              style={styles.heroBottomGradient}
            />
            <View style={styles.heroTopRow}>
              <View style={styles.glassPill}>
                <Eyebrow style={styles.heroEyebrow}>
                  {home.kind === 'tonight' ? 'Tonight' : 'Kept in Our World'}
                </Eyebrow>
              </View>
            </View>
            <View style={styles.heroCopy}>
              {home.capturedAt ? (
                <Hero maxFontSizeMultiplier={1.45} style={styles.heroDate}>
                  {formatMemoryDate(home.capturedAt)}
                </Hero>
              ) : null}
              <Caption maxFontSizeMultiplier={1.5} style={styles.heroContext}>
                {home.kind === 'tonight'
                  ? [memoryAge, parentReasonLabel(home.reasonCode)].filter(Boolean).join(' · ')
                  : [memoryAge, home.author ? `kept by ${home.author}` : null].filter(Boolean).join(' · ')}
              </Caption>
              {home.kind === 'tonight' ? (
                <View style={styles.reviewCue}>
                  <Body maxFontSizeMultiplier={1.35} style={styles.reviewCueText}>
                    {queueCount === 1 ? 'One memory to recognize' : `${queueCount} memories to recognize`}
                  </Body>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : (
          <View style={[styles.emptyHero, { minHeight: mediaHeight, backgroundColor: theme.semantic.cardAlt }]} testID="today-empty-hero">
            <View style={[styles.emptyMark, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="sparkles-outline" size={28} color={theme.semantic.primary} />
            </View>
            <Eyebrow>Private discovery</Eyebrow>
            <Hero maxFontSizeMultiplier={1.45} style={styles.emptyTitle}>
              Let the first memories find you.
            </Hero>
            <Body align="center">
              Our Little World quietly looks for clear moments. You decide what becomes part of the family world.
            </Body>
            <Button
              onPress={() => router.push({ pathname: '/scan', params: { source: 'today' } })}
              disabled={!canUsePrivateDiscovery || scanState.phase === 'scanning'}
            >
              {scanState.phase === 'scanning' ? 'Looking privately…' : 'Find memories'}
            </Button>
          </View>
        )}
      </EntranceView>

      {scanState.phase === 'failed' ? (
        <Pressable
          onPress={() => router.push({ pathname: '/scan', params: { source: 'today' } })}
          accessibilityRole="button"
          accessibilityLabel="Try private discovery again"
          style={styles.quietRepair}
        >
          <Caption>Private discovery paused. Your progress is safe.</Caption>
          <Caption style={{ color: theme.semantic.primary, fontWeight: '800' }}>Try again</Caption>
        </Pressable>
      ) : null}

      {home.kind !== 'empty' ? (
        <Pressable
          onPress={() => router.push('/library')}
          accessibilityRole="button"
          accessibilityLabel="Open Our World to browse saved memories"
          style={styles.worldLink}
        >
          <View>
            <Eyebrow maxFontSizeMultiplier={1.45}>Our World</Eyebrow>
            <Body maxFontSizeMultiplier={1.55}>See the family world taking shape.</Body>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.semantic.primary} />
        </Pressable>
      ) : null}
    </AppShell>
  );
}

function formatMemoryDate(date) {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

const styles = StyleSheet.create({
  memoryHero: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 14, 13, 0.08)',
  },
  heroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
  },
  heroTopRow: {
    padding: space.md,
    alignItems: 'flex-start',
  },
  glassPill: {
    backgroundColor: 'rgba(24, 18, 16, 0.62)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  heroEyebrow: { color: '#fff' },
  heroCopy: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: 80,
  },
  heroDate: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 37,
  },
  heroContext: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: space.xs,
  },
  reviewCue: {
    marginTop: space.md,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.42)',
    paddingTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  reviewCueText: { color: '#fff', fontWeight: '800' },
  emptyHero: {
    borderRadius: 28,
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  emptyMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { textAlign: 'center', fontSize: 32, lineHeight: 38 },
  quietRepair: {
    minHeight: 48,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  worldLink: {
    minHeight: 68,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});
