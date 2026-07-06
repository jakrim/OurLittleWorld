import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Button, Brand, Hero, Body, Caption, V, H, Spacer, semantic, colors, glass, space, radius, shadow } from './ui';
import { embedFace, isNative } from './faceMatcher';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import * as Scan from './scanController';
import {
  addReferenceImage,
  clearAutoSeedReferences,
  clearReferenceProfile,
  primaryReference,
  readReferenceProfile,
  referenceStorageKey as makeReferenceStorageKey,
} from './recognitionReferences';
import { bootstrapBirthdayReference } from './referenceAutoSeed';

/**
 * "Pick a photo of your baby." We embed it via the native face matcher
 * and stash the embedding in AsyncStorage (per-user, per-device) so the
 * scan screen can use it. Wife and husband each pick their own reference
 * because each device has its own library.
 *
 * Behaviour notes:
 *   - If a previous reference exists for this (family, user), we restore
 *     it on mount so the user can re-enter without re-picking.
 *   - The back chevron / iOS swipe-back returns to wherever they came
 *     from (we use `navigate`, not `replace`).
 */
export default function ReferencePhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { family } = useFamily();
  const { user } = useAuth();
  const autoSeedRequested = params.autoSeed === '1';
  const autoSeedStarted = useRef(false);

  const [picked, setPicked] = useState(null);   // { uri, width, height, assetId }
  const [embedding, setEmbedding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const [autoSeedState, setAutoSeedState] = useState({ status: autoSeedRequested ? 'idle' : 'manual' });

  // Restore the previously-saved reference if one exists.
  useEffect(() => {
    if (!family?.id || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const profile = await readReferenceProfile({ familyId: family.id, userId: user.id });
        if (!alive) return;
        const primary = primaryReference(profile);
        setReferenceCount(profile.references.length);
        if (primary?.uri) setPicked({ uri: primary.uri, assetId: primary.assetId });
        if (primary?.embedding?.length) setEmbedding({ embedding: primary.embedding, faceCount: primary.faceCount || 1 });
        if (primary?.uri || primary?.embedding) setRestored(true);
      } catch {}
    })();
    return () => { alive = false; };
  }, [family?.id, user?.id]);

  useEffect(() => {
    if (!autoSeedRequested || autoSeedStarted.current || !family?.id || !user?.id) return;
    autoSeedStarted.current = true;
    if (!isNative) {
      setAutoSeedState({ status: 'manual', reason: 'native-unavailable' });
      return;
    }

    let alive = true;
    setAutoSeedState({ status: 'running' });
    (async () => {
      try {
        const result = await bootstrapBirthdayReference({
          familyId: family.id,
          userId: user.id,
          birthdayISO: family.babyBirthday,
        });
        if (!alive) return;
        if (result.status === 'seeded') {
          const preview = result.preview;
          setPicked({
            uri: preview?.localUri || preview?.uri || null,
            width: preview?.width,
            height: preview?.height,
            assetId: preview?.assetId || null,
          });
          setEmbedding({
            embedding: preview?.embedding || null,
            faceCount: preview?.faceCount || 1,
          });
          setReferenceCount(result.referenceCount || 0);
          setRestored(true);
          setError(null);
          setAutoSeedState({ status: 'ready', coverage: result.coverage });
        } else {
          setAutoSeedState({ status: 'manual', reason: result.reason });
        }
      } catch (err) {
        console.warn('auto seed reference failed', err?.message);
        if (alive) setAutoSeedState({ status: 'manual', reason: 'error' });
      }
    })();
    return () => { alive = false; };
  }, [autoSeedRequested, family?.babyBirthday, family?.id, user?.id]);

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      exif: false,
      shouldDownloadFromNetwork: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    setPicked({ uri: a.uri, width: a.width, height: a.height, assetId: a.assetId || null });
    setEmbedding(null);
    setRestored(false);
    setAutoSeedState({ status: 'manual' });

    if (!isNative) {
      // No native module yet — accept any photo; we'll fall back to
      // chronological browsing in the next screen.
      return;
    }
    setBusy(true);
    try {
      const emb = await embedFace(a.uri);
      if (!emb || emb.faceCount === 0 || !emb.embedding?.length) {
        setError("Couldn't find a clear face in that photo. Try one that's well-lit.");
        setEmbedding(null);
      } else {
        setEmbedding(emb);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickDifferentFromAutoSeed = async () => {
    if (!family || !user) return;
    await clearAutoSeedReferences({ familyId: family.id, userId: user.id });
    setPicked(null);
    setEmbedding(null);
    setRestored(false);
    setReferenceCount(0);
    setError(null);
    setAutoSeedState({ status: 'manual', reason: 'user-correction' });
    await pick();
  };

  const onContinue = async () => {
    if (!family || !user) return;
    if (autoSeedState.status === 'ready') {
      Scan.reset();
      router.push('/scan');
      return;
    }
    if (isNative && !embedding) {
      Alert.alert('Pick a photo first', 'We need a clear face to find your baby in your library.');
      return;
    }
    await addReferenceImage({
      familyId: family.id,
      userId: user.id,
      birthdayISO: family.babyBirthday,
      uri: picked?.uri || null,
      assetId: picked?.assetId || null,
      embedding: embedding?.embedding || null,
      faceCount: embedding?.faceCount || 1,
      capturedAt: Date.now(),
      source: restored ? 'existing-reference' : 'seed',
    });
    // Picking a new reference always means a fresh scan — clear stale matches.
    Scan.reset();
    router.push('/scan');
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/timeline');
  };

  const autoSeeding = autoSeedState.status === 'running' || autoSeedState.status === 'idle';
  const autoConfirming = autoSeedState.status === 'ready';
  const hasUsableReference = autoConfirming || (!isNative ? !!picked : !!embedding?.embedding?.length);

  const onClearReference = async () => {
    if (!family || !user) return;
    Alert.alert(
      'Use a different photo?',
      'This will clear the saved reference so you can pick a new one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearReferenceProfile({ familyId: family.id, userId: user.id });
            setPicked(null);
            setEmbedding(null);
            setRestored(false);
            setReferenceCount(0);
            setError(null);
          },
        },
      ],
    );
  };

  return (
    <Screen variant="warm" scroll>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} style={styles.backChip} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.plum} />
        </Pressable>
      </View>

      <V gap="lg" style={{ paddingTop: space.sm, paddingBottom: space.xxl }}>
        <Brand>our little world</Brand>
        <Hero>{heroCopy({ autoSeeding, autoConfirming, babyName: family?.babyName })}</Hero>
        <Body>{bodyCopy({ autoSeeding, autoConfirming, babyName: family?.babyName })}</Body>

        <Spacer h={space.md} />

        <Pressable
          onPress={autoConfirming ? pickDifferentFromAutoSeed : pick}
          disabled={autoSeeding || busy}
          accessibilityRole="button"
          accessibilityLabel={autoConfirming ? 'Pick a different reference photo' : 'Pick reference photo'}
          style={styles.frame}
        >
          {autoSeeding ? (
            <View style={styles.placeholder}>
              <ActivityIndicator color={colors.coral} />
              <Spacer h={space.md} />
              <Body align="center" style={{ color: colors.plum }}>Looking through your library</Body>
              <Caption align="center" style={{ marginTop: 4 }}>
                We are finding a face that appears across the months.
              </Caption>
            </View>
          ) : picked ? (
            <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="happy-outline" size={56} color={colors.coral} />
              <Spacer h={space.md} />
              <Body align="center" style={{ color: colors.plum }}>Tap to pick a photo</Body>
              <Caption align="center" style={{ marginTop: 4 }}>
                A clear, well-lit shot of their face works best.
              </Caption>
            </View>
          )}
          {picked ? (
            <View style={styles.changeBadge}>
              <Caption style={{ color: colors.cream, fontWeight: '700' }}>
                {autoConfirming ? 'Tap to pick another' : restored ? 'Tap to change' : 'Tap to replace'}
              </Caption>
            </View>
          ) : null}
        </Pressable>

        {autoConfirming ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="sparkles-outline" size={16} color={colors.plum} />
            <Caption style={{ color: colors.plum, fontWeight: '700' }}>
              Seeded {referenceCount} local references from the birthday onward
            </Caption>
          </H>
        ) : restored && !error ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="bookmark" size={16} color={colors.plum} />
            <Caption style={{ color: colors.plum, fontWeight: '700' }}>
              {referenceCount > 1 ? `Using ${referenceCount} local references` : 'Using saved reference'} - tap to change
            </Caption>
          </H>
        ) : null}

        {busy ? (
          <Caption align="center">Reading the photo…</Caption>
        ) : embedding && isNative && !restored ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="checkmark-circle" size={18} color={colors.sage} />
            <Caption style={{ color: colors.sage, fontWeight: '700' }}>
              Face found - ready to review
            </Caption>
          </H>
        ) : null}

        {error ? (
          <Caption style={{ color: colors.danger, textAlign: 'center' }}>{error}</Caption>
        ) : null}

        <Spacer h={space.md} />

        <Button onPress={onContinue} loading={busy || autoSeeding} disabled={!hasUsableReference || busy || autoSeeding}>
          {autoSeeding
            ? `Looking for ${family?.babyName || 'your baby'}...`
            : autoConfirming
              ? 'Yes, start review scan'
              : restored ? 'Continue with this reference' : 'Start review scan'}
        </Button>

        {autoConfirming ? (
          <Button variant="quiet" onPress={pickDifferentFromAutoSeed}>
            Pick a different photo
          </Button>
        ) : restored ? (
          <Button variant="quiet" onPress={onClearReference}>
            Use a different photo
          </Button>
        ) : (
          <Button variant="quiet" onPress={onBack}>
            Back
          </Button>
        )}
      </V>
    </Screen>
  );
}

export function referenceStorageKey(args) {
  return makeReferenceStorageKey(args);
}

function heroCopy({ autoSeeding, autoConfirming, babyName }) {
  if (autoSeeding) return `Finding ${babyName || 'your baby'}.`;
  if (autoConfirming) return `Is this ${babyName || 'your baby'}?`;
  return `One photo of ${babyName || 'your baby'}.`;
}

function bodyCopy({ autoSeeding, autoConfirming, babyName }) {
  const learningCopy = `${babyName || 'Your baby'}'s face model gets sharper every time you keep or remove a photo.`;
  if (autoSeeding) {
    return `We are using the birthday and photo access you already gave us to build a local reference. ${learningCopy}`;
  }
  if (autoConfirming) {
    return `We found a face that repeats across the months. Confirm it before the review scan starts. ${learningCopy}`;
  }
  return `We use it as a local reference to find likely matches on this device. ${learningCopy} Scanning stays on your phone; moments you save are uploaded to your private family archive.`;
}

const styles = StyleSheet.create({
  topRow: {
    paddingTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: semantic.card,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.whisper,
  },
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
    borderWidth: 1,
    borderColor: semantic.border,
    ...shadow.whisper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  changeBadge: {
    position: 'absolute',
    bottom: space.md,
    right: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: glass.inkScrim,
    borderRadius: radius.pill,
  },
});
