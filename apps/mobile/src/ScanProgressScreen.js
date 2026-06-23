import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, Button, Hero, Caption, Eyebrow, Spacer, BrandMark, colors, space } from './ui';
import useReducedMotion from './ui/useReducedMotion';
import { embedFace, isNative } from './faceMatcher';
import { addTrustedReferenceImage, primaryReference, readReferenceProfile } from './recognitionReferences';
import { getAutoSaveConfig, recordRecentAutoSave, REVIEW_THRESHOLD } from './recognitionTrust';
import { readScanCheckpoint, sinceMsForScan, writeScanCheckpoint } from './scanCheckpoints';
import { clearPendingMediaLibraryChange, readPendingMediaLibraryChange } from './mediaLibraryChanges';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import * as Scan from './scanController';
import { Tags } from './storage';
import { listSavedAssetIds } from './photoSync';

/**
 * Brief radar splash. Kicks off the background scan via the controller,
 * then returns to timeline so users can keep using the app while scanning.
 *
 * First scans are review-only. Background auto-save is only enabled after
 * the user has calibrated trust by keeping/skipping a review batch.
 */
export default function ScanProgressScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { user } = useAuth();
  const scan = Scan.useScanState();
  const reducedMotion = useReducedMotion();

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const handedOff = useRef(false);
  const trustedRefreshCount = useRef(0);

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
    if (!family || !user) return;
    if (Scan.isRunning()) { fired.current = true; return; }

    fired.current = true;
    (async () => {
      const profile = await readReferenceProfile({ familyId: family.id, userId: user.id });
      const ref = primaryReference(profile);
      const checkpoint = await readScanCheckpoint({ familyId: family.id, userId: user.id });
      const pendingLibraryChange = await readPendingMediaLibraryChange({
        familyId: family.id,
        userId: user.id,
      });
      const birthdayMs = family.babyBirthday
        ? new Date(`${family.babyBirthday}T00:00:00`).getTime()
        : undefined;
      const sinceMs = sinceMsForScan({
        babyBirthday: family.babyBirthday,
        checkpoint,
        forceFullRescan: pendingLibraryChange?.requiresFullLibraryScan,
      });
      const extraAssetIds = pendingLibraryChange?.requiresFullLibraryScan
        ? []
        : pendingLibraryChange?.insertedAssetIds || [];

      // Skip media we've already saved to Supabase. Means "Find more"
      // only does meaningful work on new content.
      const skip = await listSavedAssetIds({
        familyId: family.id,
        ownerUserId: user.id,
      }).catch(() => new Set());

      const autoSaveConfig = await getAutoSaveConfig({
        familyId: family.id,
        userId: user.id,
      });
      const autoSave = autoSaveConfig
        ? {
          threshold: autoSaveConfig.threshold,
          save: async (assetId, match) => {
            await Tags.setBaby({ familyId: family.id, assetId, isBaby: true, match });
            await recordRecentAutoSave({
              familyId: family.id,
              userId: user.id,
              match: match || { assetId },
            });
            if (
              trustedRefreshCount.current < 2
              && isNative
              && match?.assetId
              && Number(match.score || 0) >= 0.9
              && (match.localUri || match.uri)
            ) {
              trustedRefreshCount.current += 1;
              try {
                const embedding = await embedFace(match.localUri || match.uri);
                if (embedding?.embedding?.length) {
                  await addTrustedReferenceImage({
                    familyId: family.id,
                    userId: user.id,
                    birthdayISO: family.babyBirthday,
                    match,
                    embedding: embedding.embedding,
                    faceCount: embedding.faceCount || match.faceCount || 1,
                  });
                }
              } catch (err) {
                console.warn('auto-save trusted reference refresh', err?.message);
              }
            }
          },
        }
        : null;

      Scan.start({
        reference: ref,
        referenceProfile: profile,
        birthdayISO: family.babyBirthday,
        since: sinceMs,
        threshold: isNative ? REVIEW_THRESHOLD : null,
        autoSave,
        excludeIds: skip,
        extraAssetIds,
        extraAssetCreatedAfterMs: birthdayMs,
        onComplete: async (finalState) => {
          if (finalState?.phase !== 'done') return;
          await writeScanCheckpoint({
            familyId: family.id,
            userId: user.id,
            checkpoint: {
              lastScannedAt: new Date(finalState.finishedAt || Date.now()).toISOString(),
              lastCursor: JSON.stringify({
                scanKey: finalState.scanKey,
                seen: finalState.seen,
                total: finalState.total,
                sinceMs,
                mediaLibraryChangeAt: pendingLibraryChange?.changedAt || null,
                extraAssetCount: extraAssetIds.length,
              }),
            },
          });
          await clearPendingMediaLibraryChange({
            familyId: family.id,
            userId: user.id,
          });
        },
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
          {scan.total
            ? `${scan.seen.toLocaleString()} of ${scan.total.toLocaleString()} media`
            : 'Reading your library'}
        </Eyebrow>
        <Spacer h={space.sm} />
        <Hero align="center" style={{ fontSize: 30, lineHeight: 36 }}>
          Looking for {family?.babyName || 'them'}…
        </Hero>
        <Spacer h={space.md} />
        <Caption align="center">
          {scan.matches.length > 0
            ? `${scan.matches.length.toLocaleString()} found · review before anything uploads`
            : 'Likely matches will wait for your review.'}
        </Caption>

        <Spacer h={space.xxxl} />

        <Button onPress={() => router.replace('/timeline')}>
          Keep scanning in background
        </Button>
        <Spacer h={space.sm} />
        <Button variant="quiet" onPress={() => router.replace('/review')}>
          Review matches
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
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
  },
});
