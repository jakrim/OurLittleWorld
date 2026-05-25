import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen, Button, Hero, Caption, Eyebrow, Spacer, BrandMark, colors, space } from './ui';
import { isNative } from './faceMatcher';
import { referenceStorageKey } from './ReferencePhotoScreen';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import * as Scan from './scanController';
import { Tags } from './storage';
import { listSavedAssetIds } from './photoSync';

/**
 * Brief radar splash. Kicks off the background scan via the controller,
 * then returns to timeline so users can keep using the app while scanning.
 *
 * High-confidence matches (score >= 0.78) are auto-uploaded in the
 * background — the user only gets pulled into the Review grid for
 * borderline ones (0.65 .. 0.78). This means re-running the scan
 * eventually backfills every confident photo without any "Save N" button.
 */
export default function ScanProgressScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { user } = useAuth();
  const scan = Scan.useScanState();

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const handedOff = useRef(false);

  useEffect(() => {
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
  }, []);

  // Kick off the scan once we have everything we need.
  useEffect(() => {
    if (fired.current) return;
    if (!family || !user) return;
    if (Scan.isRunning()) { fired.current = true; return; }

    fired.current = true;
    (async () => {
      const raw = await AsyncStorage.getItem(referenceStorageKey({ familyId: family.id, userId: user.id }));
      const ref = raw ? JSON.parse(raw) : null;
      const sinceMs = family.babyBirthday
        ? new Date(family.babyBirthday + 'T00:00:00').getTime()
        : undefined;

      // Skip photos we've already saved to Supabase. Means "Find more
      // photos" only does meaningful work on new content.
      const skip = await listSavedAssetIds({
        familyId: family.id,
        ownerUserId: user.id,
      }).catch(() => new Set());

      // Auto-save high-confidence matches as they arrive. Borderline ones
      // (0.65..0.78) still flow to the Review grid for manual triage.
      const autoSave = {
        threshold: 0.78,
        save: async (assetId) => {
          await Tags.setBaby({ familyId: family.id, assetId, isBaby: true });
        },
      };

      Scan.start({
        reference: ref,
        since: sinceMs,
        threshold: isNative ? 0.65 : null,
        autoSave,
        excludeIds: skip,
      });
    })();
  }, [family?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand off to timeline once scanning has begun. Auto-save + ScanBanner
  // do the rest in the background.
  useEffect(() => {
    if (handedOff.current) return;
    if (scan.phase === 'failed' || scan.phase === 'idle') return;
    if (scan.phase === 'scanning' || scan.phase === 'done' || scan.phase === 'aborted') {
      const t = setTimeout(() => {
        handedOff.current = true;
        router.replace('/timeline');
      }, 900);
      return () => clearTimeout(t);
    }
  }, [scan.phase, router]);

  const ringStyle = (val) => ({
    transform: [
      { scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.4] }) },
    ],
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
  });

  return (
    <Screen variant="dawn">
      <View style={styles.root}>
        <View style={styles.pulseWrap}>
          <Animated.View style={[styles.ring, ringStyle(pulse1)]} />
          <Animated.View style={[styles.ring, ringStyle(pulse2)]} />
          <View style={styles.core}>
            <BrandMark size={86} />
          </View>
        </View>

        <Spacer h={space.xxl} />

        <Eyebrow align="center">
          {scan.total
            ? `${scan.seen.toLocaleString()} of ${scan.total.toLocaleString()} photos`
            : 'Reading your library'}
        </Eyebrow>
        <Spacer h={space.sm} />
        <Hero align="center" style={{ fontSize: 30, lineHeight: 36 }}>
          Looking for {family?.babyName || 'them'}…
        </Hero>
        <Spacer h={space.md} />
        <Caption align="center">
          {scan.matches.length > 0
            ? `${scan.matches.length.toLocaleString()} found · auto-saving the clear ones`
            : 'Auto-saving every clear photo as we find it.'}
        </Caption>

        <Spacer h={space.xxxl} />

        <Button onPress={() => router.replace('/timeline')}>
          Keep scanning in background
        </Button>
        <Spacer h={space.sm} />
        <Button variant="quiet" onPress={() => router.replace('/review')}>
          Review borderline matches
        </Button>
        <Spacer h={space.sm} />
        <Button variant="ghost" onPress={() => Scan.abort()}>
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
    shadowColor: '#3A2531',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
  },
});
