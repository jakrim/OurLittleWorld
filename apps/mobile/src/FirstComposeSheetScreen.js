import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import BirthDatePicker from './ui/BirthDatePicker';
import BestPhotoRail from './ui/BestPhotoRail';
import { Body, Button, Caption, Field, PhotoPlaceholder, Screen, Title, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { SUGGESTED_NOTE_LABEL, SUGGESTED_NOTE_USE_LABEL, suggestedFirstNote } from './captionTemplateModel.js';
import { milestoneDateSourceCaption, shouldLockMilestoneDate } from './momentMilestoneModel.js';
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
import { normalizeMediaLibraryAssetId } from './photos';
import PostSaveNudgeSheet from './PostSaveNudgeSheet';
import { canShowPostSaveNudge, firstSavedLetterNudge } from './postSaveNudgeModel';
import { dismissPostSaveNudge, readPostSaveNudgeState, recordPostSaveNudgeShown } from './postSaveNudgeStore';
import { listSharedTagged, listSharedTaggedChronological, uploadForTag } from './photoSync';
import { FIRST_GOAL_DEFINITIONS, Firsts } from './rituals';
import { loadBestPhotoCandidates } from './bestPhotoCandidates';
import { candidateId } from './bestPhotoCandidateModel.js';

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
  const [photosLoading, setPhotosLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postSaveNudge, setPostSaveNudge] = useState(null);
  const seededFirst = Boolean(seedGoalKey && seedTitle && !existing);
  const seedPhoto = useMemo(() => seedPhotoFromParams({
    seedAssetId,
    seedAssetOwnerUserId,
    seedAssetUri,
    seedDate: seedDateParam,
    userId: user?.id,
  }), [seedAssetId, seedAssetOwnerUserId, seedAssetUri, seedDateParam, user?.id]);
  const sourceMomentId = existing?.moment_id || seedMomentId || null;

  const close = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else if (sourceMomentId) router.replace({ pathname: '/moment/[momentId]', params: { momentId: sourceMomentId } });
    else router.replace('/firsts');
  }, [router, sourceMomentId]);

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

    setPhotosLoading(true);
    loadFirstPhotoCandidates({
      familyId: family.id,
      firstPhotoWindow,
      userId: user?.id,
      babyBirthday: family?.babyBirthday,
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
      })
      .finally(() => {
        if (alive) setPhotosLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [family?.babyBirthday, family?.id, firstPhotoWindow, firstPhotoWindow?.capturedBefore, firstPhotoWindow?.capturedOnOrAfter, seedPhoto, user?.id]);

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
  const dateLockedToMoment = shouldLockMilestoneDate({ sourceMomentId, happenedDate: date });
  const lockedDateCaption = milestoneDateSourceCaption({
    ageCaption: happenedAgeLabel
      ? `${family?.babyName || 'Your child'} was ${happenedAgeLabel}.`
      : '',
  });
  // U1: one quiet sentence from grounded date and computed-age metadata,
  // offered — never auto-inserted; browsing scene labels do not become note copy.
  const suggestedNote = useMemo(() => suggestedFirstNote({
    babyBirthday: family?.babyBirthday,
    happenedDate: date,
    sceneLabels: [],
  }), [date, family?.babyBirthday]);
  const suggestedTitleLocked = Boolean(seededFirst && !editingTitle);
  const effectiveTitle = title.trim() || (seededFirst ? seedTitle : '');
  const photoRailCaption = sharedPhotos.length
    ? (firstPhotoWindow
      ? "Best distinct photos from birth through this first's date, ranked for clarity."
      : 'Best distinct recent photos from this device and your family world.')
    : 'Choose any photo from your native library.';

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

  const pickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      shouldDownloadFromNetwork: true,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    const assetId = normalizeMediaLibraryAssetId(asset.assetId);
    if (!assetId) {
      Alert.alert('Photo unavailable', 'Choose a photo from the native library with Photos access enabled.');
      return;
    }
    selectPhoto({
      ...asset,
      localOnly: true,
      assetId,
      asset_id: assetId,
      asset_owner_user_id: user?.id,
      mediaType: 'image',
      type: 'image',
      localUri: asset.uri,
    });
  }, [selectPhoto, user?.id]);

  const save = async () => {
    if (!effectiveTitle) return;
    setSaving(true);
    try {
      let photoForSave = selectedPhoto;
      if (selectedPhoto?.localOnly) {
        const uploaded = await uploadForTag({ familyId: family?.id, assetId: selectedPhoto.asset_id });
        photoForSave = {
          ...selectedPhoto,
          asset_owner_user_id: user?.id,
          asset_id: uploaded.remoteAssetKey,
          moment_id: uploaded.momentId,
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
      // X1: offer a letter seeded from this first's facts, respecting the same
      // daily cap as the moment post-save nudge. Only for newly-completed firsts.
      if (shouldNotifyPartner) {
        const nudge = await buildFirstSavedLetterNudge({
          family,
          user,
          first: savedFirst || { id: savedFirst?.id, title: effectiveTitle, happened_at: happenedAt },
        });
        if (nudge) {
          await recordPostSaveNudgeShown({ familyId: family?.id, userId: user?.id });
          setPostSaveNudge(nudge);
          setSaving(false);
          return;
        }
      }
      close();
    } catch (err) {
      Alert.alert('Could not save', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const finishPostSave = useCallback(async (route = null) => {
    const nudge = postSaveNudge;
    if (nudge?.momentId && family?.id) {
      await dismissPostSaveNudge({ familyId: family.id, userId: user?.id, momentId: nudge.momentId });
    }
    setPostSaveNudge(null);
    close();
    if (route) requestAnimationFrame(() => router.push(route));
  }, [close, family?.id, postSaveNudge, router, user?.id]);

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

  if (postSaveNudge) {
    return (
      <PostSaveNudgeSheet
        nudge={postSaveNudge}
        theme={theme}
        savedLabel="First saved"
        onDismiss={() => finishPostSave(null)}
        onAction={() => finishPostSave(postSaveNudge.route)}
      />
    );
  }

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
        {dateLockedToMoment ? (
          <View style={[styles.lockedDateCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <View style={styles.lockedDateHeader}>
              <View>
                <Caption>Milestone date</Caption>
                <Body style={styles.lockedDateValue}>{formatLongDate(date)}</Body>
              </View>
              <Ionicons name="calendar-outline" size={20} color={theme.semantic.primary} />
            </View>
            <Caption>{lockedDateCaption}</Caption>
          </View>
        ) : (
          <BirthDatePicker
            value={date}
            onChange={setDate}
            caption={happenedDateCaption}
            placeholder="When did it happen?"
            accessibilityLabel="First happened date"
          />
        )}
        <Field
          as="textarea"
          value={note}
          onChangeText={setNote}
          placeholder="What happened around it?"
          caption="Optional. One small detail is enough."
        />
        {suggestedNote && !note.trim() ? (
          <Pressable
            onPress={() => setNote(suggestedNote)}
            accessibilityRole="button"
            accessibilityLabel={`Use suggested note: ${suggestedNote}`}
            style={[styles.suggestedNoteRow, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <View style={styles.suggestedNoteText}>
              <Caption>{SUGGESTED_NOTE_LABEL}</Caption>
              <Body>{suggestedNote}</Body>
            </View>
            <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>{SUGGESTED_NOTE_USE_LABEL}</Caption>
          </Pressable>
        ) : null}
        {sourceMomentId ? (
          <MomentPhotoSummary photo={selectedPhoto} theme={theme} />
        ) : <View>
          <BestPhotoRail
            photos={sharedPhotos}
            loading={photosLoading}
            selectedIds={new Set([candidateId(selectedPhoto)].filter(Boolean))}
            onToggle={(photo) => {
              if (candidateId(selectedPhoto) === candidateId(photo)) setSelectedPhoto(null);
              else selectPhoto(photo);
            }}
            onOpenPicker={pickPhoto}
            title="Best photos for this First"
            caption={photoRailCaption}
            pickerLabel="Choose from full library"
          />
          {selectedPhoto ? (
            <Button variant="quiet" size="sm" fullWidth={false} onPress={() => setSelectedPhoto(null)}>
              Keep without a photo
            </Button>
          ) : null}
        </View>}
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

function MomentPhotoSummary({ photo, theme }) {
  const uri = photo?.thumbUrl || photo?.fullUrl || photo?.uri || photo?.localUri;
  return (
    <View style={styles.momentPhotoSummary}>
      <View style={[styles.momentPhotoThumb, { borderColor: theme.semantic.border }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <PhotoPlaceholder style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={styles.momentPhotoCopy}>
        <Caption>Photo</Caption>
        <Body>Already attached from this moment.</Body>
      </View>
    </View>
  );
}

function formatLongDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

async function buildFirstSavedLetterNudge({ family, user, first }) {
  try {
    const state = await readPostSaveNudgeState({ familyId: family?.id, userId: user?.id });
    const nudge = firstSavedLetterNudge({ first, birthdayISO: family?.babyBirthday });
    if (!nudge?.momentId) return null;
    if (!canShowPostSaveNudge({ state, momentId: nudge.momentId })) return null;
    return nudge;
  } catch (err) {
    console.warn('buildFirstSavedLetterNudge', err?.message);
    return null;
  }
}

async function loadFirstPhotoCandidates({ familyId, firstPhotoWindow, userId, babyBirthday }) {
  const createdAfterMs = firstPhotoWindow?.capturedOnOrAfter
    ? new Date(firstPhotoWindow.capturedOnOrAfter).getTime()
    : undefined;
  const createdBeforeMs = firstPhotoWindow?.capturedBefore
    ? new Date(firstPhotoWindow.capturedBefore).getTime()
    : undefined;
  const [bestLocal, savedPhotos] = await Promise.all([
    loadBestPhotoCandidates({
      familyId,
      userId,
      babyBirthday,
      createdAfterMs: Number.isFinite(createdAfterMs) ? createdAfterMs : undefined,
      createdBeforeMs: Number.isFinite(createdBeforeMs) ? createdBeforeMs : undefined,
      limit: 12,
    }),
    firstPhotoWindow
      ? listSharedTaggedChronological(familyId, {
        ...firstPhotoWindow,
        limit: FIRST_PHOTO_CANDIDATE_LIMIT,
      })
      : listSharedTagged(familyId, { limit: RECENT_PHOTO_LIMIT }),
  ]);
  return mergePhotoCandidates(bestLocal.photos, savedPhotos).slice(0, FIRST_PHOTO_CANDIDATE_LIMIT);
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
  return merged;
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
  suggestedNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  suggestedNoteText: {
    flex: 1,
    gap: 2,
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
  lockedDateCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
  },
  lockedDateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  lockedDateValue: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    marginTop: 2,
  },
  momentPhotoSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  momentPhotoThumb: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  momentPhotoCopy: {
    flex: 1,
    gap: 2,
  },
  editTitleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
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
