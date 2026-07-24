import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen, Button, Hero, Caption, Eyebrow, Spacer, BrandMark, colors, space } from './ui';
import useReducedMotion from './ui/useReducedMotion';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { startLibraryScan } from './libraryScanLauncher';
import { startFirstValuePreviewScan } from './firstValuePreviewScan';
import { trackAnalyticsEvent } from './analytics';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import { firstValueProgressCopy } from './scanPacingModel';
import * as Scan from './scanController';

/**
 * Brief radar splash. Kicks off the background scan via the controller,
 * then returns to timeline so users can keep using the app while scanning.
 *
 * First scans are review-only. Background auto-save is only enabled after
 * the user has calibrated trust by keeping/skipping a review batch.
 */
export default function ScanProgressScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const scan = Scan.useScanState();
  const reducedMotion = useReducedMotion();
  const writer = ['creator', 'partner'].includes(family?.me?.role);
  // Expo Router may normalize local search params after the first render.
  // First Look is a screen-lifetime contract: never let a later param refresh
  // turn this into the ordinary background scan and hand the parent to Today.
  const firstValueRequestedRef = useRef(false);
  if (params.source === 'first_value') firstValueRequestedRef.current = true;
  const firstValueRequested = firstValueRequestedRef.current;
  const canScan = writer && (entitlement?.isActive === true || firstValueRequested);
  const [startError, setStartError] = useState('');
  const [scanAttempt, setScanAttempt] = useState(0);
  const [firstValueReady, setFirstValueReady] = useState(false);

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const handedOff = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      pulse1.setValue(0);
      pulse2.setValue(0);
      return undefined;
    }
    const loop = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      );
    const a = loop(pulse1, 0);
    const b = loop(pulse2, 1200);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [pulse1, pulse2, reducedMotion]);

  // Kick off the scan once we have everything we need.
  useEffect(() => {
    if (fired.current) return;
    if (!family || !user || billingLoading || !canScan) return;
    if (Scan.isRunning()) { fired.current = true; return; }

    fired.current = true;
    (async () => {
      if (firstValueRequested) {
        trackAnalyticsEvent('first_value_started', {
          surface: 'first_value_preview',
          paywall_source: 'first_value_preview',
          paywall_version: 'olw-first-look-v1',
          offer_version: 'olw-family-2026-07',
        }, {
          family_id: family.id,
          actor_role: family?.me?.role || 'creator',
          plan_state: 'none',
          platform: analyticsPlatform(Platform.OS),
          environment: analyticsEnvironment(),
        });
        const result = await startFirstValuePreviewScan({
          family,
          user,
          onPreviewReady: () => setFirstValueReady(true),
        });
        if (!result.started) setStartError(result.reason || 'private-discovery-unavailable');
        return;
      }
      await startLibraryScan({
        family,
        user,
        requestPhotoPermission: true,
        entitlementActive: true,
      });
    })();
  }, [billingLoading, canScan, family?.id, firstValueRequested, scanAttempt, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!firstValueRequested || !firstValueReady) return;
    router.replace('/first-value-preview');
  }, [firstValueReady, firstValueRequested, router]);

  useEffect(() => {
    if (!firstValueRequested) return undefined;
    return () => Scan.abort();
  }, [firstValueRequested]);

  // Hand off to timeline once scanning has begun. Auto-save + ScanBanner
  // do the rest in the background.
  useEffect(() => {
    if (firstValueRequested) return undefined;
    if (handedOff.current) return;
    if (scan.phase === 'failed' || scan.phase === 'idle') return;
    if (scan.phase === 'scanning' || scan.phase === 'done' || scan.phase === 'aborted') {
      const t = setTimeout(() => {
        handedOff.current = true;
        router.replace('/timeline');
      }, 900);
      return () => clearTimeout(t);
    }
  }, [firstValueRequested, scan.phase, router]);

  const ringStyle = (val) => ({
    transform: [
      { scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.4] }) },
    ],
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
  });

  const stopScan = () => {
    Scan.abort();
    if (firstValueRequested) {
      router.replace({ pathname: '/reference', params: { source: 'first_value' } });
    }
  };

  const retryFirstValueScan = () => {
    Scan.abort();
    Scan.reset();
    fired.current = false;
    setStartError('');
    setFirstValueReady(false);
    setScanAttempt((value) => value + 1);
  };

  const firstValueProgress = firstValueProgressCopy({
    checked: scan.checked,
    total: scan.total,
    batchSize: scan.batchSize,
    timedOutBatches: scan.timedOutBatches,
    skipped: scan.skippedDuringAnalysis,
  });

  if (!billingLoading && !canScan) {
    return (
      <Screen variant="dawn">
        <View style={styles.root}>
          <Spacer h={space.xxxl} />
          <Eyebrow align="center">Private discovery</Eyebrow>
          <Spacer h={space.sm} />
          <Hero align="center" style={{ fontSize: 30, lineHeight: 36 }}>
            {writer ? 'Scanning is paused.' : 'Only parents scan this library.'}
          </Hero>
          <Spacer h={space.md} />
          <Caption align="center">
            {writer
              ? 'Your saved family memories remain available. Resume curation when your family plan is active.'
              : 'Circle members only see memories after a parent keeps them in Our World.'}
          </Caption>
          <Spacer h={space.xxl} />
          <Button onPress={() => router.replace('/timeline')}>Back to Our World</Button>
        </View>
      </Screen>
    );
  }

  if (
    firstValueRequested
    && (
      startError
      || (['done', 'failed'].includes(scan.phase) && !firstValueReady)
    )
  ) {
    return (
      <Screen variant="dawn">
        <View style={styles.root}>
          <Spacer h={space.xxxl} />
          <Eyebrow align="center">Private First Look</Eyebrow>
          <Spacer h={space.sm} />
          <Hero align="center" style={{ fontSize: 30, lineHeight: 36 }}>
            The quick search is finished.
          </Hero>
          <Spacer h={space.md} />
          <Caption align="center">
            {startError === 'photo-permission'
              ? 'Photo access is needed for private discovery. Nothing was uploaded.'
              : 'We did not find a clear enough match in this short pass. Nothing was uploaded, and you do not need to wait any longer.'}
          </Caption>
          <Spacer h={space.xxl} />
          {startError === 'photo-permission' ? (
            <>
              <Button onPress={retryFirstValueScan}>
                Check photo access again
              </Button>
              <Spacer h={space.sm} />
              <Button
                variant="quiet"
                onPress={() => router.replace({ pathname: '/reference', params: { source: 'first_value' } })}
              >
                Choose a different reference
              </Button>
            </>
          ) : (
            <>
              <Button onPress={() => router.replace({ pathname: '/reference', params: { source: 'first_value' } })}>
                Choose a different reference
              </Button>
              <Spacer h={space.sm} />
              <Button variant="quiet" onPress={retryFirstValueScan}>
                Try another short search
              </Button>
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen variant="dawn">
      <View style={styles.root}>
        <View style={styles.pulseWrap}>
          {!reducedMotion ? (
            <>
              <Animated.View style={[styles.ring, ringStyle(pulse1)]} />
              <Animated.View style={[styles.ring, ringStyle(pulse2)]} />
            </>
          ) : null}
          <View style={styles.core}>
            <BrandMark size={86} />
          </View>
        </View>

        <Spacer h={space.xxl} />

        <Eyebrow align="center">
          {firstValueRequested
            ? firstValueProgress.eyebrow
            : scan.total
            ? `${scan.seen.toLocaleString()} of ${scan.total.toLocaleString()} media`
            : 'Reading your library'}
        </Eyebrow>
        <Spacer h={space.sm} />
        <Hero align="center" style={{ fontSize: 30, lineHeight: 36 }}>
          Looking for {family?.babyName || 'them'}…
        </Hero>
        <Spacer h={space.md} />
        <Caption align="center">
          {firstValueRequested
            ? `${firstValueProgress.detail} We stop after one reliable candidate.`
            : scan.matches.length > 0
              ? `${scan.matches.length.toLocaleString()} likely found · review what belongs`
              : 'First review builds trust; later clear matches can save automatically.'}
        </Caption>

        <Spacer h={space.xxxl} />

        {!firstValueRequested ? (
          <>
            <Button onPress={() => router.replace('/timeline')}>
              Keep scanning in background
            </Button>
            <Spacer h={space.sm} />
            <Button variant="quiet" onPress={() => router.replace('/review')}>
              Review matches
            </Button>
            <Spacer h={space.sm} />
          </>
        ) : null}
        <Button variant="ghost" onPress={stopScan}>
          Stop scan
        </Button>
      </View>
    </Screen>
  );
}

const RING_SIZE = 160;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: space.xxxl,
    paddingHorizontal: space.xl,
    alignItems: 'center',
  },
  pulseWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.surface,
  },
  core: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
  },
});
