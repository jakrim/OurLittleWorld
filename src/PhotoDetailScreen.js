import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Screen, Card, Button, Field, Brand, Hero, Title, Body, Caption, Eyebrow, V, H, Spacer, semantic, colors, space, radius, shadow } from './ui';
import { Memories, Tags } from './storage';
import { Family } from './families';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { ageAt, formatAge } from './photos';
import { shareMemoryMoment } from './shareMoment';

/**
 * Single moment view. Renders the photo, baby's age at capture, the tag
 * toggle, the partner's note (if any), and lets the current user write
 * their own note.
 */
export default function PhotoDetailScreen() {
  const router = useRouter();
  const { assetId } = useLocalSearchParams();
  const { family } = useFamily();
  const { user } = useAuth();

  const [asset, setAsset] = useState(null);
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [memories, setMemories] = useState([]);
  const [members, setMembers] = useState({});
  const [isBaby, setIsBaby] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      if (!family || !user || !assetId) return;
      const [info, allTags, mems, memberList] = await Promise.all([
        MediaLibrary.getAssetInfoAsync(assetId).catch(() => null),
        Tags.all(family.id),
        Memories.forAsset({ familyId: family.id, assetId, ownerUserId: user.id }),
        Family.members(family.id),
      ]);
      setAsset(info);
      setMemories(mems);
      setMembers(Object.fromEntries(memberList.map((m) => [m.userId, m.displayName || 'Unnamed'])));
      const myMem = mems.find((m) => m.author_user_id === user.id);
      setSavedNote(myMem?.note || '');
      setNote(myMem?.note || '');
      setIsBaby(!!allTags[Tags.key(assetId, user.id)]);
    })();
  }, [assetId, family?.id, user?.id]);

  const age = useMemo(() => {
    if (!asset || !family?.babyBirthday) return null;
    return ageAt(family.babyBirthday, asset.creationTime);
  }, [asset, family?.babyBirthday]);

  const dateLabel = useMemo(() => {
    if (!asset?.creationTime) return '';
    return new Date(asset.creationTime).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }, [asset]);

  const placeLabel = useMemo(() => {
    const lat = asset?.location?.latitude;
    const lon = asset?.location?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') return '';
    return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  }, [asset?.location?.latitude, asset?.location?.longitude]);

  const onToggleBaby = async () => {
    if (!family || tagging) return;
    Haptics.selectionAsync();
    const next = !isBaby;
    setIsBaby(next);
    setTagging(true);
    try {
      await Tags.setBaby({ familyId: family.id, assetId, isBaby: next });
    } catch (err) {
      setIsBaby(!next);
      Alert.alert('Could not save', err.message || String(err));
    } finally {
      setTagging(false);
    }
  };

  const onSaveNote = async () => {
    if (!family || !user) return;
    await Memories.setMine({ familyId: family.id, assetId, ownerUserId: user.id, note });
    setSavedNote(note.trim());
    const fresh = await Memories.forAsset({ familyId: family.id, assetId, ownerUserId: user.id });
    setMemories(fresh);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onShareMoment = async () => {
    const sourceUri = asset?.localUri || asset?.uri;
    if (!sourceUri) {
      Alert.alert('Could not share', 'This photo is not available yet.');
      return;
    }
    setSharing(true);
    try {
      const memory = (note || '').trim()
        || (partnerMemories[0]?.note || '').trim()
        || '';
      const memoryAuthor = memory && (note || '').trim()
        ? (members[user?.id] || 'Jesse')
        : memory
          ? (members[partnerMemories[0]?.author_user_id] || 'Lauren')
          : '';
      await shareMemoryMoment({
        sourceUri,
        babyName: family?.babyName || 'Our little one',
        ageLabel: age ? formatAge(age) : '',
        dateLabel,
        memoryNote: memory,
        memoryAuthor,
        placeLabel,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert('Could not share', err?.message || String(err));
    } finally {
      setSharing(false);
    }
  };

  const dirty = note !== savedNote;
  const partnerMemories = memories.filter((m) => m.author_user_id !== user?.id);

  return (
    <Screen scroll keyboard>
      <V gap="lg" style={{ paddingTop: space.md, paddingBottom: space.xxl }}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <View style={styles.backChip}>
            <Ionicons name="chevron-back" size={20} color={colors.plum} />
          </View>
        </Pressable>

        <View style={styles.imageWrap}>
          {asset?.uri ? (
            <Image
              source={{ uri: asset.localUri || asset.uri }}
              style={styles.image}
              contentFit="contain"
              transition={150}
            />
          ) : null}
        </View>

        <Card>
          <H justify="space-between" align="center">
            <View style={{ flex: 1 }}>
              <Caption>{dateLabel}</Caption>
              <Spacer h={4} />
              {age ? <Title style={{ color: colors.coral, fontSize: 22 }}>{formatAge(age)}</Title> : null}
            </View>
            <View style={styles.actionsCol}>
              <Pressable
                onPress={onShareMoment}
                disabled={sharing}
                style={[styles.share, sharing && { opacity: 0.55 }]}
              >
                <Ionicons name="share-social-outline" size={16} color={colors.plum} />
                <Caption style={styles.shareLabel}>{sharing ? 'Sharing…' : 'Share moment'}</Caption>
              </Pressable>
              <Spacer h={space.sm} />
              <Pressable
                onPress={onToggleBaby}
                disabled={tagging}
                style={[styles.tag, isBaby && styles.tagActive, tagging && { opacity: 0.55 }]}
              >
                <Ionicons name={isBaby ? 'heart' : 'heart-outline'} size={16} color={isBaby ? '#FFFFFF' : colors.coral} />
                <Caption style={{
                  color: isBaby ? '#FFFFFF' : colors.coral,
                  fontWeight: '700',
                  marginLeft: 6,
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontSize: 14,
                }}>
                  {tagging ? (isBaby ? 'Syncing…' : 'Removing…') : isBaby ? 'Tagged' : 'Tag as baby'}
                </Caption>
              </Pressable>
            </View>
          </H>
        </Card>

        <Card variant="muted">
          <Eyebrow>Reuben context</Eyebrow>
          <Spacer h={space.sm} />
          <Caption>{dateLabel || 'Date unavailable'}</Caption>
          {placeLabel ? (
            <>
              <Spacer h={4} />
              <Caption>{placeLabel}</Caption>
            </>
          ) : null}
          {age ? (
            <>
              <Spacer h={4} />
              <Caption>{formatAge(age)}</Caption>
            </>
          ) : null}
        </Card>

        {partnerMemories.length > 0 ? (
          <Card variant="muted">
            <Eyebrow>From your family</Eyebrow>
            <Spacer h={space.md} />
            {partnerMemories.map((m, i) => (
              <View key={m.id}>
                <Caption style={{ color: colors.coral, fontWeight: '700' }}>
                  {(members[m.author_user_id] || 'Family').toUpperCase()}
                </Caption>
                <Spacer h={4} />
                <Body style={{ color: colors.ink }}>{m.note}</Body>
                {i < partnerMemories.length - 1 ? <Spacer h={space.md} /> : null}
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <Eyebrow>Your memory</Eyebrow>
          <Spacer h={space.md} />
          <Field
            as="textarea"
            value={note}
            onChangeText={setNote}
            placeholder="What happened in this moment?"
          />
          <Spacer h={space.md} />
          <Button
            variant={dirty ? 'primary' : 'ghost'}
            onPress={onSaveNote}
            disabled={!dirty}
          >
            {dirty ? 'Save memory' : 'Saved'}
          </Button>
        </Card>
      </V>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
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
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.soft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.coral,
    backgroundColor: 'transparent',
  },
  tagActive: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  actionsCol: {
    alignItems: 'flex-end',
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.cardAlt,
  },
  shareLabel: {
    color: colors.plum,
    marginLeft: 6,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 13,
  },
});
