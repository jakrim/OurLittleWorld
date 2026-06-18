import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAssetDetails } from './photos';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';

import { Screen, Card, Button, Field, GlassButton, PhotoPlaceholder, Title, Body, Caption, Eyebrow, V, H, Spacer, space, radius, useTheme } from './ui';
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
  const theme = useTheme();
  const params = useLocalSearchParams();
  const assetId = Array.isArray(params.assetId) ? params.assetId[0] : params.assetId;
  const ownerUserIdParam = Array.isArray(params.ownerUserId) ? params.ownerUserId[0] : params.ownerUserId;
  const previewUri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const previewCreationRaw = Array.isArray(params.creationTime)
    ? params.creationTime[0]
    : params.creationTime;
  const previewCreationTime = previewCreationRaw != null ? Number(previewCreationRaw) : null;
  const { family } = useFamily();
  const { user } = useAuth();
  const ownerUserId = ownerUserIdParam || user?.id;

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
        getAssetDetails(assetId, { downloadFromNetwork: true }).catch(() => null),
        Tags.all(family.id),
        Memories.forAsset({ familyId: family.id, assetId, ownerUserId }),
        Family.members(family.id),
      ]);
      setAsset(info);
      setMemories(mems);
      setMembers(Object.fromEntries(memberList.map((m) => [m.userId, m.displayName || 'Unnamed'])));
      const myMem = mems.find((m) => m.author_user_id === user.id);
      setSavedNote(myMem?.note || '');
      setNote(myMem?.note || '');
      setIsBaby(!!allTags[Tags.key(assetId, ownerUserId)]);
    })();
  }, [assetId, family?.id, ownerUserId, user?.id]);

  const takenAtMs = useMemo(() => {
    if (asset?.creationTime) return asset.creationTime;
    if (Number.isFinite(previewCreationTime)) return previewCreationTime;
    return null;
  }, [asset?.creationTime, previewCreationTime]);

  const displayUri = useMemo(
    () => asset?.localUri || asset?.uri || previewUri || null,
    [asset?.localUri, asset?.uri, previewUri],
  );

  const age = useMemo(() => {
    if (!takenAtMs || !family?.babyBirthday) return null;
    return ageAt(family.babyBirthday, takenAtMs);
  }, [takenAtMs, family?.babyBirthday]);

  const dateLabel = useMemo(() => {
    if (!takenAtMs) return '';
    return new Date(takenAtMs).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }, [takenAtMs]);

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
    await Memories.setMine({ familyId: family.id, assetId, ownerUserId, note });
    setSavedNote(note.trim());
    const fresh = await Memories.forAsset({ familyId: family.id, assetId, ownerUserId });
    setMemories(fresh);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onShareMoment = async () => {
    const sourceUri = displayUri;
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
  const isOwnAsset = ownerUserId === user?.id;

  return (
    <Screen scroll keyboard>
      <V gap="lg" style={{ paddingTop: space.md, paddingBottom: space.xxl }}>
        <View style={styles.imageWrap}>
          {displayUri ? (
            <Image
              source={{ uri: displayUri }}
              style={styles.image}
              contentFit="contain"
              transition={150}
            />
          ) : (
            <PhotoPlaceholder style={StyleSheet.absoluteFill} />
          )}
          <View style={styles.photoChrome}>
            <GlassButton
              icon="chevron-back"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
            />
            <GlassButton
              icon="share-social-outline"
              accessibilityLabel="Share moment"
              onPress={onShareMoment}
            />
          </View>
        </View>

        <Card>
          <H justify="space-between" align="center">
            <View style={{ flex: 1 }}>
              <Caption>{dateLabel}</Caption>
              <Spacer h={4} />
              {age ? <Title style={{ color: theme.semantic.primary, fontSize: 22 }}>{formatAge(age)}</Title> : null}
            </View>
            <View style={styles.actionsCol}>
              <Pressable
                onPress={onShareMoment}
                disabled={sharing}
                style={[
                  styles.share,
                  {
                    borderColor: theme.semantic.border,
                    backgroundColor: theme.semantic.cardAlt,
                  },
                  sharing && { opacity: 0.55 },
                ]}
              >
                <Ionicons name="share-social-outline" size={16} color={theme.semantic.textSoft} />
                <Caption style={styles.shareLabel}>{sharing ? 'Sharing…' : 'Share moment'}</Caption>
              </Pressable>
              {isOwnAsset ? (
                <>
                  <Spacer h={space.sm} />
                  <Pressable
                    onPress={onToggleBaby}
                    disabled={tagging}
                    style={[
                      styles.tag,
                      { borderColor: theme.semantic.primary },
                      isBaby && { backgroundColor: theme.semantic.primary, borderColor: theme.semantic.primary },
                      tagging && { opacity: 0.55 },
                    ]}
                  >
                    <Ionicons name={isBaby ? 'heart' : 'heart-outline'} size={16} color={isBaby ? theme.colors.onPrimary : theme.semantic.primary} />
                    <Caption style={{
                      color: isBaby ? theme.colors.onPrimary : theme.semantic.primary,
                      fontWeight: '700',
                      marginLeft: 6,
                      textTransform: 'none',
                      letterSpacing: 0,
                      fontSize: 14,
                    }}>
                      {tagging ? (isBaby ? 'Syncing…' : 'Removing…') : isBaby ? 'Tagged' : 'Tag as baby'}
                    </Caption>
                  </Pressable>
                </>
              ) : null}
            </View>
          </H>
        </Card>

        <Card variant="muted">
          <Eyebrow>{family?.babyName || 'little one'} context</Eyebrow>
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
                <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>
                  {(members[m.author_user_id] || 'Family').toUpperCase()}
                </Caption>
                <Spacer h={4} />
                <Body style={{ color: theme.semantic.text }}>{m.note}</Body>
                {i < partnerMemories.length - 1 ? <Spacer h={space.md} /> : null}
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <Eyebrow>Your memory</Eyebrow>
          <Spacer h={space.md} />
          {savedNote ? (
            <>
              <Body style={[styles.handwrittenNote, { color: theme.semantic.primary }]}>
                {savedNote}
              </Body>
              <Spacer h={space.md} />
            </>
          ) : null}
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
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  photoChrome: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
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
  },
  shareLabel: {
    marginLeft: 6,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 13,
  },
  handwrittenNote: {
    fontFamily: 'Caveat',
    fontSize: 24,
    lineHeight: 30,
  },
});
