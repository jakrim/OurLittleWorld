import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Button, Brand, Hero, Body, Caption, V, H, Spacer, semantic, colors, glass, space, radius, shadow } from './ui';
import { embedFace, isNative } from './faceMatcher';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import * as Scan from './scanController';
import {
  addReferenceImage,
  clearReferenceProfile,
  primaryReference,
  readReferenceProfile,
  referenceStorageKey as makeReferenceStorageKey,
} from './recognitionReferences';

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
  const { family } = useFamily();
  const { user } = useAuth();

  const [picked, setPicked] = useState(null);   // { uri, width, height, assetId }
  const [embedding, setEmbedding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);

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

  const onContinue = async () => {
    if (!family || !user) return;
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

  const hasUsableReference = !isNative ? !!picked : !!embedding?.embedding?.length;

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
        <Hero>One photo of {family?.babyName || 'your baby'}.</Hero>
        <Body>
          We use it as a local reference to find likely matches on this device.
          Scanning stays on your phone; moments you save are uploaded to your
          private family archive.
        </Body>

        <Spacer h={space.md} />

        <Pressable onPress={pick} style={styles.frame}>
          {picked ? (
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
                {restored ? 'Tap to change' : 'Tap to replace'}
              </Caption>
            </View>
          ) : null}
        </Pressable>

        {restored && !error ? (
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

        <Button onPress={onContinue} loading={busy} disabled={!hasUsableReference || busy}>
          {restored ? 'Continue with this reference' : 'Start review scan'}
        </Button>

        {restored ? (
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
