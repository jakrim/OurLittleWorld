import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import BirthDatePicker from './ui/BirthDatePicker';
import { Body, Button, Caption, Field, PhotoPlaceholder, Screen, Title, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import {
  defaultFirstHappenedDate,
  firstHappenedAgeLabel,
  firstHappenedDateCaption,
  firstPhotoHappenedDate,
  firstPhotoSearchWindow,
  mergeSeedIntoCandidates,
  normalizeSeedDateParam,
  seedPhotoFromParams,
} from './firstComposeSeedModel.js';
import { notifyPartnerFirstSaved } from './notificationEvents';
import { fetchPhotosPage, getLibraryPermissionStatus, normalizeMediaLibraryAssetId } from './photos';
import { listSharedTagged, listSharedTaggedChronological, uploadForTag } from './photoSync';
import { FIRST_GOAL_DEFINITIONS, Firsts } from './rituals';

const RECENT_PHOTO_LIMIT = 60;
const FIRST_PHOTO_CANDIDATE_LIMIT = 120;

export default function FirstComposeSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const seedTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const seedTargetAge = Array.isArray(params.targetAge) ? params.targetAge[0] : params.targetAge;
  const seedMomentId = Array.isArray(params.momentId) ? params.momentId[0] : params.momentId;
  const seedGoalKey = Array.isArray(params.goalKey) ? params.goalKey[0] : params.goalKey;
  const seedAssetId = Array.isArray(params.seedAssetId) ? params.seedAssetId[0] : params.seedAssetId;
  const seedAssetOwnerUserId = Array.isArray(params.seedAssetOwnerUserId) ? params.seedAssetOwnerUserId[0] : params.seedAssetOwnerUserId;
  const seedAssetUri = Array.isArray(params.seedAssetUri) ? params.seedAssetUri[0] : params.seedAssetUri;
  const seedDateParam = Array.isArray(params.seedDate) ? params.seedDate[0] : params.seedDate;
  const seedNote = Array.isArray(params.seedNote) ? params.seedNote[0] : params.seedNote;
  const seedGoal = FIRST_GOAL_DEFINITIONS.find((goal) => goal.key === seedGoalKey) || null;
  const { family } = useFamily();
  const { user } = useAuth();
  const [existing, setExisting] = useState(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [sharedPhotos, setSharedPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const seededFirst = Boolean(seedTitle && !existing);
  const seedPhoto = useMemo(() => seedPhotoFromParams({
    seedAssetId,
    seedAssetOwnerUserId,
    seedAssetUri,
    seedDate: seedDateParam,
    userId: user?.id,
  }), [seedAssetId, seedAssetOwnerUserId, seedAssetUri, seedDateParam, user?.id]);

  const close = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/firsts');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (family?.id && id) {
        Firsts.get(family.id, id).then((match) => {
          if (!alive) return;
          setExisting(match);
          setTitle(match?.title || '');
          setDate(match?.happened_at ? match.happened_at.slice(0, 10) : '');
          setNote(match?.note || '');
          setSelectedPhoto(match?.asset_owner_user_id && match?.asset_id
            ? { asset_owner_user_id: match.asset_owner_user_id, asset_id: match.asset_id }
            : null);
          setEditingTitle(false);
        });
      } else {
        setExisting(null);
        setTitle(seedTitle || '');
        setDate(normalizeSeedDateParam(seedDateParam) || defaultFirstHappenedDate({
          babyBirthday: family?.babyBirthday,
          goal: seedGoal,
        }));
        setNote(typeof seedNote === 'string' ? seedNote : '');
        setSelectedPhoto(seedPhoto);
        setEditingTitle(false);
      }
      return () => {
        alive = false;
      };
    }, [family?.babyBirthday, family?.id, id, seedGoal, seedTitle, seedDateParam, seedNote, seedPhoto]),
  );

  const firstPhotoWindow = useMemo(
    () => seededFirst
      ? firstPhotoSearchWindow({
        babyBirthday: family?.babyBirthday,
        happenedDate: date,
        goal: seedGoal,
      })
      : null,
    [date, family?.babyBirthday, seedGoal, seededFirst],
  );

  useEffect(() => {
    let alive = true;
    if (!family?.id) {
      setSharedPhotos([]);
      return () => {
        alive = false;
      };
    }

    loadFirstPhotoCandidates({
      familyId: family.id,
      firstPhotoWindow,
      userId: user?.id,
    })
      .then((photos) => {
        if (!alive) return;
        const merged = mergeSeedIntoCandidates(photos || [], seedPhoto);
        setSharedPhotos(merged);
        if (seedPhoto && merged[0] && merged[0] !== seedPhoto) {
          // A saved archive row matches the seeded asset — select it so save reuses the upload.
          setSelectedPhoto((current) => (
            current
              && current.asset_owner_user_id === merged[0].asset_owner_user_id
              && current.asset_id === merged[0].asset_id
              ? merged[0]
              : current
          ));
        }
      })
      .catch(() => {
        if (alive) setSharedPhotos([]);
      });

    return () => {
      alive = false;
    };
  }, [family?.id, firstPhotoWindow, firstPhotoWindow?.capturedBefore, firstPhotoWindow?.capturedOnOrAfter, seedPhoto, user?.id]);

  const happenedAgeLabel = useMemo(
    () => firstHappenedAgeLabel({
      babyBirthday: family?.babyBirthday,
      happenedDate: date,
    }),
    [date, family?.babyBirthday],
  );
  const happenedDateCaption = useMemo(
    () => firstHappenedDateCaption({
      babyBirthday: family?.babyBirthday,
      babyName: family?.babyName,
      happenedDate: date,
    }),
    [date, family?.babyBirthday, family?.babyName],
  );
  const targetAgeLabel = happenedAgeLabel || existing?.target_age_label || seedTargetAge || '';
  const suggestedTitleLocked = Boolean(seededFirst && !editingTitle);
  const effectiveTitle = title.trim() || (seededFirst ? seedTitle : '');
  const photoRailCaption = firstPhotoWindow
    ? "Showing earliest photos from birth through this first's date, oldest first."
    : 'Pick one photo already in the family archive. Its date fills in automatically when available.';

  const toggleTitleEditing = useCallback(() => {
    if (editingTitle && seedTitle && !title.trim()) {
      setTitle(seedTitle);
    }
    setEditingTitle((value) => !value);
  }, [editingTitle, seedTitle, title]);

  const selectPhoto = useCallback((photo) => {
    setSelectedPhoto(photo);
    const photoDate = firstPhotoHappenedDate(photo);
    if (photoDate) setDate(photoDate);
  }, []);

  const save = async () => {
    if (!effectiveTitle) return;
    setSaving(true);
    try {
      let photoForSave = selectedPhoto;
      if (selectedPhoto?.localOnly) {
        await uploadForTag({ familyId: family?.id, assetId: selectedPhoto.asset_id });
        photoForSave = {
          ...selectedPhoto,
          asset_owner_user_id: user?.id,
        };
      }
      const happenedAt = date ? `${date}T12:00:00.000Z` : null;
      const assetOwnerUserId = photoForSave?.asset_owner_user_id || null;
      const assetId = photoForSave?.asset_id || null;
      const momentId = existing?.moment_id || seedMomentId || photoForSave?.moment_id || null;
      const goalKey = existing?.goal_key || seedGoalKey || null;
      let savedFirst = null;
      const shouldNotifyPartner = !existing || existing.done === false;
      if (existing) {
        savedFirst = await Firsts.update(existing.id, { title: effectiveTitle, note: note.trim() || null, happenedAt, assetOwnerUserId, assetId, targetAgeLabel: targetAgeLabel.trim() || null, momentId, goalKey, done: true });
      } else {
        savedFirst = await Firsts.create({ familyId: family?.id, title: effectiveTitle, note, happenedAt, assetOwnerUserId, assetId, targetAgeLabel: targetAgeLabel.trim() || null, momentId, goalKey, done: true });
      }
      if (shouldNotifyPartner) {
        notifyPartnerFirstSaved({
          familyId: family?.id,
          actorUserId: user?.id,
          firstId: savedFirst?.id,
          title: savedFirst?.title || effectiveTitle,
        }).catch((err) => console.warn('notify partner first saved', err?.message));
      }
      close();
    } catch (err) {
      Alert.alert('Could not save', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    if (existing.created_by_user_id !== user?.id) {
      Alert.alert('Cannot delete', 'Only the parent who added this first can delete it.');
      return;
    }
    Alert.alert('Delete first?', 'The milestone text will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Firsts.delete(existing.id);
          close();
        },
      },
    ]);
  };

  return (
    <Screen bare scroll keyboard edges={{ top: false, bottom: true }} contentStyle={styles.screenContent}>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <Title>{existing ? 'edit this first' : 'add a first'}</Title>
        {seededFirst ? (
          <View style={[styles.templateCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <View style={styles.templateHeader}>
              <View style={styles.templateTitleWrap}>
                <Caption>Suggested first</Caption>
                <Title style={styles.templateTitle}>{title || seedTitle}</Title>
              </View>
              <Pressable
                onPress={toggleTitleEditing}
                accessibilityRole="button"
                accessibilityLabel="Edit first title"
                hitSlop={10}
                style={({ pressed }) => [
                  styles.editTitleButton,
                  { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <Ionicons name={editingTitle ? 'checkmark' : 'pencil'} size={16} color={theme.semantic.primary} />
              </Pressable>
            </View>
            <Body style={styles.templateBody}>
              Add the date, a few words, and an optional saved photo when this one happens.
            </Body>
          </View>
        ) : null}
        {suggestedTitleLocked ? null : (
          <Field
            value={title}
            onChangeText={setTitle}
            placeholder='e.g. First word: "dada"'
            caption="Name the milestone; the date below handles the age automatically."
            autoCapitalize="sentences"
            autoFocus={editingTitle}
          />
        )}
        <BirthDatePicker
          value={date}
          onChange={setDate}
          caption={happenedDateCaption}
          placeholder="When did it happen?"
          accessibilityLabel="First happened date"
        />
        <Field
          as="textarea"
          value={note}
          onChangeText={setNote}
          placeholder="What happened around it?"
          caption="Optional. One small detail is enough."
        />
        <View>
          <Caption>Attach a photo, optional</Caption>
          <Caption>{photoRailCaption}</Caption>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            <Pressable
              onPress={() => setSelectedPhoto(null)}
              style={[
                styles.photoChoice,
                !selectedPhoto && { borderColor: theme.semantic.primary },
              ]}
            >
              <PhotoPlaceholder style={StyleSheet.absoluteFill} icon="flag-outline" />
              {!selectedPhoto ? <SelectedCheck /> : null}
            </Pressable>
            {sharedPhotos.map((photo) => {
              const key = `${photo.localOnly ? 'local' : photo.asset_owner_user_id}:${photo.asset_id}`;
              const selected = selectedPhoto
                && selectedPhoto.asset_owner_user_id === photo.asset_owner_user_id
                && selectedPhoto.asset_id === photo.asset_id;
              const sourceUri = photo.thumbUrl || photo.fullUrl || photo.uri || photo.localUri;
              return (
                <Pressable
                  key={key}
                  onPress={() => selectPhoto(photo)}
                  style={[styles.photoChoice, selected && { borderColor: theme.semantic.primary }]}
                >
                  {sourceUri ? (
                    <Image
                      source={{ uri: sourceUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                  )}
                  {selected ? <SelectedCheck /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={styles.composerRow}>
          {existing ? <Button variant="quiet" size="md" fullWidth={false} onPress={remove}>Delete</Button> : <View />}
          <View style={styles.composerActions}>
            <Button variant="ghost" size="md" fullWidth={false} onPress={close}>Cancel</Button>
            <Button size="md" fullWidth={false} onPress={save} loading={saving} disabled={!effectiveTitle}>Save</Button>
          </View>
        </View>
      </View>
    </Screen>
  );
}

async function loadFirstPhotoCandidates({ familyId, firstPhotoWindow, userId }) {
  if (!firstPhotoWindow) {
    return listSharedTagged(familyId, { limit: RECENT_PHOTO_LIMIT });
  }

  const savedPhotos = await listSharedTaggedChronological(familyId, {
    ...firstPhotoWindow,
    limit: FIRST_PHOTO_CANDIDATE_LIMIT,
  });
  const localPhotos = await listLocalFirstPhotoCandidates({ firstPhotoWindow, userId });
  return mergePhotoCandidates(savedPhotos, localPhotos).slice(0, FIRST_PHOTO_CANDIDATE_LIMIT);
}

async function listLocalFirstPhotoCandidates({ firstPhotoWindow, userId }) {
  if (!userId || !firstPhotoWindow?.capturedOnOrAfter || !firstPhotoWindow?.capturedBefore) return [];
  const permission = await getLibraryPermissionStatus().catch(() => null);
  if (!permission?.granted) return [];

  const createdAfterMs = new Date(firstPhotoWindow.capturedOnOrAfter).getTime();
  const createdBeforeMs = new Date(firstPhotoWindow.capturedBefore).getTime();
  if (!Number.isFinite(createdAfterMs) || !Number.isFinite(createdBeforeMs)) return [];

  const { assets } = await fetchPhotosPage({
    pageSize: FIRST_PHOTO_CANDIDATE_LIMIT,
    createdAfterMs,
    createdBeforeMs,
    sortAscending: true,
  });

  return (assets || []).map((asset) => {
    const assetId = normalizeMediaLibraryAssetId(asset.id);
    return {
      localOnly: true,
      asset_owner_user_id: userId,
      asset_id: assetId,
      creation_time: Number.isFinite(asset.creationTime) ? new Date(asset.creationTime).toISOString() : null,
      uri: asset.uri,
      localUri: asset.localUri,
    };
  }).filter((photo) => photo.asset_id);
}

function mergePhotoCandidates(savedPhotos = [], localPhotos = []) {
  const seen = new Set();
  const merged = [];
  for (const photo of [...savedPhotos, ...localPhotos]) {
    const key = `${photo.asset_owner_user_id || ''}:${photo.asset_id || ''}`;
    if (!photo?.asset_id || seen.has(key)) continue;
    seen.add(key);
    merged.push(photo);
  }
  return merged.sort((a, b) => {
    const aTime = a.creation_time ? new Date(a.creation_time).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.creation_time ? new Date(b.creation_time).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
  },
  root: {
    flexGrow: 1,
    gap: space.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  photoRow: {
    gap: space.sm,
    paddingTop: space.sm,
  },
  templateCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: 4,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  templateTitleWrap: {
    flex: 1,
    gap: 4,
  },
  templateTitle: {
    fontSize: 21,
    lineHeight: 26,
  },
  templateBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  editTitleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoChoice: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheck: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  composerActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
});

function SelectedCheck() {
  const theme = useTheme();
  return (
    <View style={[styles.selectedCheck, { backgroundColor: theme.semantic.primary }]}>
      <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />
    </View>
  );
}
