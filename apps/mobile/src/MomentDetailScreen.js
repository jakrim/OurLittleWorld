import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import BirthDatePicker from './ui/BirthDatePicker';
import { Body, Button, Caption, Card, Field, HomeIndicator, PhotoPlaceholder, Screen, Title, V, glass, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { Family } from './families';
import { Firsts, Letters, WeeklyDigests } from './rituals';
import { ageAt, formatAge } from './photos';
import { CONTEXT_DRAFT_LABEL, CONTEXT_DRAFT_USE_LABEL, factsOnlyContextDraft } from './captionTemplateModel.js';
import { firstHappenedDateCaption } from './firstComposeSeedModel.js';
import { isMediaPolicyError, promptOverLimitVideo } from './mediaPolicy';
import { deleteMoment, deleteVoiceNote, getMomentDetail, setMomentSharedWith, toggleMomentReaction, updateMoment } from './moments';
import { uploadForTag } from './photoSync';
import { removeAutoSavedMemory } from './autoSaveCorrection';
import { AUTO_SAVE_CORRECTION_COPY, isAutoSavedMemory } from './autoSaveCorrectionModel';
import { shareMemoryMoment } from './shareMoment';
import PhotoActionSheet from './PhotoActionSheet';
import { isLocalAssetDeleted } from './localAssetDeletion';
import { formatTagLabel, normalizeMomentTags } from './tagModel';
import { buildMomentConnectionChips } from './momentConnectionChips';
import { buildMomentMilestoneRoute } from './momentMilestoneModel';
import { buildLibraryManualQaMomentDetail } from './libraryManualQaFixtures';

const REACTIONS = [
  { key: 'heart', emoji: '🫶' },
  { key: 'spark', emoji: '😂' },
  { key: 'seen', emoji: '🥺' },
];

const REACTION_PICKER = [
  ...REACTIONS,
  { key: 'wow', emoji: '🥰' },
  { key: 'proud', emoji: '👏' },
  { key: 'tear', emoji: '😭' },
  { key: 'star', emoji: '✨' },
];

const REACTION_LABELS = {
  heart: 'love',
  spark: 'laugh',
  seen: 'touched',
  wow: 'adoring',
  proud: 'proud',
  tear: 'tearful',
  star: 'star',
};

export default function MomentDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const window = useWindowDimensions();
  const mediaOverlayTextColor = theme.isDark ? theme.colors.ink : theme.colors.bg;
  const params = useLocalSearchParams();
  const momentId = Array.isArray(params.momentId) ? params.momentId[0] : params.momentId;
  const { family } = useFamily();
  const { user } = useAuth();
  const [moment, setMoment] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reacting, setReacting] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editDate, setEditDate] = useState('');
  const [sharingCircle, setSharingCircle] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [promotingVideo, setPromotingVideo] = useState(false);
  const [photoFocused, setPhotoFocused] = useState(false);

  const voice = moment?.voiceNotes?.find((item) => item.audioUrl) || null;
  const player = useAudioPlayer(voice?.audioUrl ? { uri: voice.audioUrl } : null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);

  const load = async () => {
    if (!family?.id || !momentId) return;
    setLoading(true);
    try {
      const manualQaMoment = __DEV__
        ? buildLibraryManualQaMomentDetail(params.qa, momentId, { userId: user?.id })
        : null;
      if (manualQaMoment) {
        setMoment(manualQaMoment);
        return;
      }
      const next = await getMomentDetail({ familyId: family.id, momentId });
      if (!next) {
        setMoment(null);
        return;
      }
      const linkedFirsts = await Firsts.listForMoment(family.id, momentId);
      const [linkedLetters, linkedDigest] = await Promise.all([
        Letters.listConnectedToMoment(family.id, {
          momentId,
          firstIds: linkedFirsts.map((first) => first.id).filter(Boolean),
        }),
        WeeklyDigests.getForMomentDate(family.id, next.captured_at),
      ]);
      setMoment({
        ...next,
        connectedFirsts: linkedFirsts,
        connectedLetters: linkedLetters,
        connectedDigest: linkedDigest,
      });
    } finally {
      setLoading(false);
    }
  };

  // Promote a poster-only video candidate into a playable video. Only works
  // on the device that owns the local asset.
  const promoteVideo = async (media) => {
    if (!family?.id || promotingVideo) return;
    if (media?.owner_user_id && user?.id && media.owner_user_id !== user.id) {
      Alert.alert('Saved on another device', 'The playable video can be saved from the family member who took it.');
      return;
    }
    const assetId = media?.local_identifier;
    if (!assetId) return;
    if (isLocalAssetDeleted(media)) {
      Alert.alert('Still in the vault', 'The original was deleted from this phone, but this saved moment is still in the family vault.');
      return;
    }
    setPromotingVideo(true);
    try {
      await uploadForTag({ familyId: family.id, assetId });
      await load();
    } catch (err) {
      if (isMediaPolicyError(err)) {
        promptOverLimitVideo({
          onSeeVault: () => router.push('/purchase'),
        });
      } else {
        Alert.alert('Could not save playable video', err?.message || String(err));
      }
    } finally {
      setPromotingVideo(false);
    }
  };

  useEffect(() => {
    load();
  }, [family?.id, momentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPhotoFocused(false);
  }, [momentId]);

  useEffect(() => {
    let alive = true;
    if (!family?.id) {
      setMembers([]);
      return () => {
        alive = false;
      };
    }
    Family.members(family.id)
      .then((rows) => {
        if (alive) setMembers(rows || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [family?.id]);

  const capturedLabel = useMemo(() => {
    if (!moment?.captured_at) return '';
    return new Date(moment.captured_at).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [moment?.captured_at]);
  const capturedAgeLabel = useMemo(() => {
    if (!family?.babyBirthday || !moment?.captured_at) return '';
    return formatAge(ageAt(family.babyBirthday, new Date(moment.captured_at).getTime()));
  }, [family?.babyBirthday, moment?.captured_at]);

  const reactionCounts = useMemo(() => {
    const out = {};
    for (const reaction of moment?.reactions || []) {
      out[reaction.emoji] = (out[reaction.emoji] || 0) + 1;
    }
    return out;
  }, [moment?.reactions]);

  const myReactions = useMemo(
    () => new Set((moment?.reactions || []).filter((row) => row.author_user_id === user?.id).map((row) => row.emoji)),
    [moment?.reactions, user?.id],
  );
  const firstMedia = moment?.media?.[0] || null;
  const firstMediaAutoSaved = isAutoSavedMemory(firstMedia);
  const circleMembers = useMemo(() => members.filter((member) => member.role === 'circle'), [members]);
  const sharedWith = useMemo(() => normalizeSharedWith(moment?.shared_with), [moment?.shared_with]);
  const sharedWithCircle = sharedWith.includes('circle');
  const canWrite = ['creator', 'partner'].includes(family?.me?.role);
  const isOwner = !!moment?.author_user_id && moment.author_user_id === user?.id;
  const connectionChips = useMemo(() => buildMomentConnectionChips({
    moment,
    firsts: moment?.connectedFirsts || [],
    letters: moment?.connectedLetters || [],
    digest: moment?.connectedDigest || null,
    canWrite,
  }), [canWrite, moment]);
  const storyActions = useMemo(
    () => connectionChips.filter((chip) => chip.group === 'action'),
    [connectionChips],
  );
  const storyConnections = useMemo(
    () => connectionChips.filter((chip) => chip.group !== 'action'),
    [connectionChips],
  );
  const setPhotoFocus = useCallback((focused) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPhotoFocused(focused);
  }, []);
  const sheetHandleGesture = useMemo(() => Gesture.Pan()
    .enabled(!photoFocused)
    .activeOffsetY([-8, 8])
    .onEnd((gesture) => {
      if (gesture.translationY > 36 || gesture.velocityY > 500) setPhotoFocus(true);
    })
    .runOnJS(true), [photoFocused, setPhotoFocus]);
  const editDateCaption = useMemo(
    () => firstHappenedDateCaption({
      babyBirthday: family?.babyBirthday,
      babyName: family?.babyName,
      happenedDate: editDate,
    }),
    [editDate, family?.babyBirthday, family?.babyName],
  );
  const editContextDraft = useMemo(
    () => factsOnlyContextDraft({
      babyBirthday: family?.babyBirthday,
      happenedDate: editDate || dateOnlyFromIso(moment?.captured_at),
      placeLabel: editPlace,
      firstTitle: moment?.connectedFirsts?.[0]?.title,
      tags: normalizeMomentTags(String(editTags || '').split(',')),
    }),
    [
      editDate,
      editPlace,
      editTags,
      family?.babyBirthday,
      moment?.captured_at,
      moment?.connectedFirsts,
    ],
  );

  const onReaction = async (key) => {
    if (!family?.id || !moment?.id || reacting) return;
    setReacting(true);
    try {
      await toggleMomentReaction({ familyId: family.id, momentId: moment.id, emoji: key });
      await load();
      setReactionPickerOpen(false);
    } catch (err) {
      Alert.alert('Could not react', err?.message || String(err));
    } finally {
      setReacting(false);
    }
  };

  const toggleVoice = () => {
    if (!voice?.audioUrl) return;
    if (playerStatus.playing) player.pause();
    else player.play();
  };

  const openEdit = () => {
    setEditTitle(moment?.title || '');
    setEditNote(moment?.caption_note || '');
    setEditPlace(moment?.place_name || '');
    setEditTags((moment?.tags || []).map(formatTagLabel).join(', '));
    setEditDate(dateOnlyFromIso(moment?.captured_at));
    setEditOpen(true);
    setMenuVisible(false);
  };

  const openConnectionChip = (chip) => {
    if (chip.key === 'possible-first') {
      setAsMilestone();
      return;
    }
    if (chip.action === 'edit') {
      openEdit();
      return;
    }
    if (chip.route) router.push(chip.route);
  };

  const saveEdit = async () => {
    if (!family?.id || !moment?.id || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateMoment({
        familyId: family.id,
        momentId: moment.id,
        patch: {
          title: editTitle,
          captionNote: editNote,
          placeName: editPlace,
          capturedAt: capturedAtFromDate(editDate),
        },
        tags: editTags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      setEditOpen(false);
      await load();
    } catch (err) {
      Alert.alert('Could not update moment', err?.message || String(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleCircleShare = async () => {
    if (!family?.id || !moment?.id || sharingCircle) return;
    if (!circleMembers.length) {
      setMenuVisible(false);
      router.push('/invite');
      return;
    }
    setSharingCircle(true);
    try {
      const next = sharedWithCircle
        ? sharedWith.filter((item) => item !== 'circle')
        : Array.from(new Set([...sharedWith, 'circle']));
      await setMomentSharedWith({ familyId: family.id, momentId: moment.id, sharedWith: next });
      await load();
    } catch (err) {
      Alert.alert('Could not update sharing', err?.message || String(err));
    } finally {
      setSharingCircle(false);
      setMenuVisible(false);
    }
  };

  const shareOutsideApp = async () => {
    setMenuVisible(false);
    try {
      const ageLabel = family?.babyBirthday && moment?.captured_at
        ? formatAge(ageAt(family.babyBirthday, new Date(moment.captured_at).getTime()))
        : '';
      if (firstMedia?.media_type !== 'video' && (firstMedia?.fullUrl || firstMedia?.thumbUrl)) {
        await shareMemoryMoment({
          sourceUri: firstMedia.fullUrl || firstMedia.thumbUrl,
          babyName: family?.babyName,
          ageLabel,
          dateLabel: capturedLabel,
          memoryNote: moment?.caption_note || moment?.title,
          placeLabel: moment?.place_name,
        });
        return;
      }
      const lines = [
        moment?.title || `${family?.babyName || 'A little one'} moment`,
        capturedLabel,
        moment?.place_name,
        moment?.caption_note,
        'shared from our little world',
      ].filter(Boolean);
      await Share.share({
        title: moment?.title || 'Our Little World moment',
        message: lines.join('\n'),
      });
    } catch (err) {
      Alert.alert('Could not share', err?.message || String(err));
    }
  };

  const confirmRemoveAutoSaved = () => {
    if (!family?.id || !user?.id || !firstMedia) return;
    setMenuVisible(false);
    Alert.alert(AUTO_SAVE_CORRECTION_COPY.confirmTitle, AUTO_SAVE_CORRECTION_COPY.confirmBody, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: AUTO_SAVE_CORRECTION_COPY.actionLabel,
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAutoSavedMemory({
              familyId: family.id,
              userId: user.id,
              target: firstMedia,
            });
            Alert.alert(AUTO_SAVE_CORRECTION_COPY.successTitle, AUTO_SAVE_CORRECTION_COPY.successBody);
            router.back();
          } catch (err) {
            Alert.alert('Could not remove auto-save', err?.message || String(err));
          }
        },
      },
    ]);
  };

  const setAsMilestone = async () => {
    if (!family?.id || !moment?.id) return;
    setMenuVisible(false);
    try {
      const existing = (await Firsts.list(family.id)).find((row) => row.moment_id === moment.id);
      const route = buildMomentMilestoneRoute({ moment, existingFirst: existing, media: firstMedia });
      if (route) router.push(route);
    } catch (err) {
      Alert.alert('Could not set milestone', err?.message || String(err));
    }
  };

  const confirmDelete = () => {
    setMenuVisible(false);
    Alert.alert('Delete this moment?', 'This removes the saved Moment from the book, including copied media, voice notes, and reactions. Any originals in Photos stay where they are.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMoment({ familyId: family.id, momentId: moment.id });
            router.back();
          } catch (err) {
            Alert.alert('Could not delete moment', err?.message || String(err));
          }
        },
      },
    ]);
  };

  const confirmDeleteVoice = () => {
    if (!voice?.id) return;
    setMenuVisible(false);
    Alert.alert('Remove voice note?', 'This removes the audio from this Moment, but keeps the photo, note, tags, and reactions.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVoiceNote({ familyId: family.id, momentId: moment.id, voiceNoteId: voice.id });
            await load();
          } catch (err) {
            Alert.alert('Could not remove voice note', err?.message || String(err));
          }
        },
      },
    ]);
  };

  const actionSheetPhoto = firstMedia ? {
    thumbUrl: firstMedia.thumbUrl || firstMedia.posterUrl,
    fullUrl: firstMedia.fullUrl || firstMedia.posterUrl || firstMedia.thumbUrl,
  } : null;

  const menuActions = [
    { icon: 'share-outline', label: 'Share outside app', onPress: shareOutsideApp },
    { icon: 'create-outline', label: 'Edit title and note', onPress: openEdit, disabled: !isOwner },
    { icon: 'mic-off-outline', label: 'Remove voice note', onPress: confirmDeleteVoice, destructive: true, disabled: !isOwner || !voice?.id },
    { icon: 'flag-outline', label: 'Set as milestone', onPress: setAsMilestone, disabled: !canWrite },
    firstMediaAutoSaved
      ? { icon: 'sparkles-outline', label: AUTO_SAVE_CORRECTION_COPY.actionLabel, onPress: confirmRemoveAutoSaved, destructive: true, disabled: !isOwner }
      : null,
    {
      icon: sharedWithCircle ? 'eye-off-outline' : 'people-outline',
      label: sharedWithCircle ? 'Keep between co-parents' : 'Share to family circle',
      onPress: toggleCircleShare,
      disabled: !isOwner,
    },
    { icon: 'trash-outline', label: 'Delete moment', onPress: confirmDelete, destructive: true, disabled: !isOwner },
  ].filter(Boolean);

  if (loading) {
    return (
      <Screen variant="warm">
        <View style={styles.center}>
          <ActivityIndicator color={theme.semantic.primary} />
        </View>
      </Screen>
    );
  }

  if (!moment) {
    return (
      <Screen variant="warm">
        <View style={styles.center}>
          <Title>Moment unavailable.</Title>
          <Button style={styles.backButton} onPress={() => router.back()}>Back</Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      variant="dark"
      scroll
      bare
      edges={{ top: true, bottom: false }}
      contentStyle={styles.detailContent}
      onScroll={(event) => {
        if (photoFocused && event.nativeEvent.contentOffset.y > 8) setPhotoFocus(false);
      }}
    >
      <View style={[styles.detailHero, photoFocused && { height: Math.max(520, window.height - 128) }]}>
        <MediaMosaic
          media={moment.media || []}
          theme={theme}
          onPromoteVideo={promoteVideo}
          promotingVideo={promotingVideo}
          photoFocused={photoFocused}
          onPhotoPress={() => setPhotoFocus(true)}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[glass.mediaScrim, glass.mediaScrimClear, glass.mediaScrim]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.topRow, styles.heroTopRow]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[styles.iconButton, { backgroundColor: glass.mediaChrome, borderColor: glass.mediaChromeBorder }]}
          >
            <Ionicons name="chevron-back" size={19} color={mediaOverlayTextColor} />
          </Pressable>
          <Caption style={{ color: mediaOverlayTextColor }}>{capturedLabel}</Caption>
          <Pressable
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open moment actions"
            style={[styles.iconButton, { backgroundColor: glass.mediaChrome, borderColor: glass.mediaChromeBorder }]}
          >
            <Ionicons name="ellipsis-horizontal" size={19} color={mediaOverlayTextColor} />
          </Pressable>
        </View>
        {!photoFocused ? <View style={styles.heroCaption}>
          {capturedAgeLabel ? (
            <Caption style={[styles.heroAge, { color: mediaOverlayTextColor }]}>{capturedAgeLabel}</Caption>
          ) : null}
          <Title style={[styles.heroTitle, { color: mediaOverlayTextColor }]}>
            {moment.title || 'A little moment'}
          </Title>
          <Caption style={[styles.heroMeta, { color: glass.inverseTextBody }]}>
            {[firstMediaAutoSaved ? 'Added by the assistant' : null, moment.place_name, capturedLabel].filter(Boolean).join(' · ') || 'Saved moment'}
          </Caption>
        </View> : null}
      </View>

      <View style={[styles.detailSheet, { backgroundColor: theme.semantic.card }]}>
        <GestureDetector gesture={sheetHandleGesture}>
        <View collapsable={false}>
        <Pressable
          onPress={() => setPhotoFocus(!photoFocused)}
          accessibilityRole="button"
          accessibilityLabel={photoFocused ? 'Show moment details' : 'Show full photo'}
          style={styles.sheetHandleTouch}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.semantic.border }]} />
          {photoFocused ? <Caption>Swipe up for details</Caption> : null}
        </Pressable>
        </View>
        </GestureDetector>
        {photoFocused ? null : <>
        {editOpen ? (
          <Card variant="muted">
            <Caption>Edit moment</Caption>
            <V gap="sm" style={styles.editFields}>
              <Field
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Title"
                caption="Shown on this memory card."
                autoCapitalize="sentences"
              />
              <Field
                value={editPlace}
                onChangeText={setEditPlace}
                placeholder="Place"
                caption="Optional. Helps group this memory by location."
                autoCapitalize="words"
              />
              <BirthDatePicker
                value={editDate}
                onChange={setEditDate}
                placeholder="When did it happen?"
                accessibilityLabel="Moment happened date"
                caption={editDateCaption}
                defaultDate={dateOnlyFromIso(moment?.captured_at) || todayIsoDate()}
              />
              <Field
                as="textarea"
                value={editNote}
                onChangeText={setEditNote}
                placeholder="Note"
                caption="Private to this family archive."
              />
              {editContextDraft && !editNote.trim() ? (
                <Pressable
                  onPress={() => setEditNote(editContextDraft)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use suggested line: ${editContextDraft}`}
                  style={[styles.contextDraftRow, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
                >
                  <View style={styles.contextDraftText}>
                    <Caption>{CONTEXT_DRAFT_LABEL}</Caption>
                    <Body>{editContextDraft}</Body>
                  </View>
                  <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>{CONTEXT_DRAFT_USE_LABEL}</Caption>
                </Pressable>
              ) : null}
              <Field
                value={editTags}
                onChangeText={setEditTags}
                placeholder="Tags, separated by commas"
                caption="Separate with commas; we clean up duplicates and #tags."
                autoCapitalize="none"
              />
            </V>
            <View style={styles.editActions}>
              <Button variant="ghost" size="sm" fullWidth={false} onPress={() => setEditOpen(false)}>Cancel</Button>
              <Button size="sm" fullWidth={false} onPress={saveEdit} loading={savingEdit}>Save</Button>
            </View>
          </Card>
        ) : null}

        {storyActions.length ? (
          <StoryLinkSection
            title="Add to the story"
            chips={storyActions}
            theme={theme}
            onOpen={openConnectionChip}
          />
        ) : null}
        {storyConnections.length ? (
          <StoryLinkSection
            title="Connected to this moment"
            chips={storyConnections}
            theme={theme}
            onOpen={openConnectionChip}
          />
        ) : null}

        {voice ? (
          <Card variant="muted">
            <View style={styles.voiceHeader}>
              <View>
                <Caption>Voice note</Caption>
                <Title style={styles.voiceTitle}>{formatSeconds(playerStatus.duration || voice.duration_sec)}</Title>
              </View>
              <Pressable
                onPress={toggleVoice}
                accessibilityRole="button"
                accessibilityLabel={playerStatus.playing ? 'Pause voice note' : 'Play voice note'}
                style={[styles.playButton, { backgroundColor: theme.semantic.primary }]}
              >
                <Ionicons name={playerStatus.playing ? 'pause' : 'play'} size={18} color={theme.colors.onPrimary} />
              </Pressable>
            </View>
            <Waveform values={voice.waveform} color={theme.semantic.primary} />
          </Card>
        ) : null}

        {moment.caption_note ? (
          <Card variant="muted" style={{ backgroundColor: theme.colors.primarySoft }}>
            <Caption>Handwritten note</Caption>
            <Body style={[styles.handwrittenNote, { color: theme.colors.ink }]}>{moment.caption_note}</Body>
          </Card>
        ) : null}

        <Card variant="muted">
          <Caption>Family reactions</Caption>
          <View style={styles.reactionRow}>
            {REACTIONS.map((reaction) => {
              const active = myReactions.has(reaction.key);
              return (
                <Pressable
                  key={reaction.key}
                  onPress={() => onReaction(reaction.key)}
                  disabled={reacting}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${reactionLabel(reaction)}`}
                  accessibilityState={{ selected: active, disabled: reacting }}
                  style={[
                    styles.reactionButton,
                    {
                      backgroundColor: active ? theme.semantic.primary : theme.semantic.cardAlt,
                      borderColor: active ? theme.semantic.primary : theme.semantic.border,
                    },
                  ]}
                >
                  <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                  <Caption style={{ color: active ? theme.colors.onPrimary : theme.semantic.textSoft }}>
                    {reactionCounts[reaction.key] || 0}
                  </Caption>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setReactionPickerOpen((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={reactionPickerOpen ? 'Hide more reactions' : 'Show more reactions'}
              accessibilityState={{ expanded: reactionPickerOpen }}
              style={[styles.reactionButton, styles.reactionAddButton, { borderColor: theme.semantic.border }]}
            >
              <Ionicons name={reactionPickerOpen ? 'chevron-up' : 'add'} size={16} color={theme.semantic.primary} />
            </Pressable>
          </View>
          {reactionPickerOpen ? (
            <View style={[styles.reactionPicker, { borderColor: theme.semantic.border }]}>
              <Caption>Pick a reaction</Caption>
              <View style={styles.reactionPickerGrid}>
                {REACTION_PICKER.map((reaction) => {
                  const active = myReactions.has(reaction.key);
                  return (
                    <Pressable
                      key={reaction.key}
                      onPress={() => onReaction(reaction.key)}
                      disabled={reacting}
                      accessibilityRole="button"
                      accessibilityLabel={`React with ${reactionLabel(reaction)}`}
                      accessibilityState={{ selected: active, disabled: reacting }}
                      style={[
                        styles.reactionPickerButton,
                        {
                          backgroundColor: active ? theme.semantic.primary : theme.semantic.card,
                          borderColor: active ? theme.semantic.primary : theme.semantic.border,
                        },
                      ]}
                    >
                      <Text style={styles.reactionPickerEmoji}>{reaction.emoji}</Text>
                      <Caption style={{ color: active ? theme.colors.onPrimary : theme.semantic.textSoft }}>
                        {reactionCounts[reaction.key] || 0}
                      </Caption>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {moment.tags?.length ? (
            <View style={styles.tagRow}>
              {moment.tags.map((tag) => (
                <Caption key={tag} style={[styles.tagPill, { backgroundColor: theme.semantic.card, color: theme.semantic.textSoft }]}>
                  #{formatTagLabel(tag)}
                </Caption>
              ))}
            </View>
          ) : null}
        </Card>
        </>}
      </View>
      <HomeIndicator color={mediaOverlayTextColor} />
      <PhotoActionSheet
        photo={actionSheetPhoto}
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        actions={menuActions}
        subtitle={isOwner ? 'What should happen with this moment?' : 'Only the parent who saved this moment can edit or delete it.'}
      />
    </Screen>
  );
}

function reactionLabel(reaction) {
  return REACTION_LABELS[reaction.key] || reaction.key;
}

function StoryLinkSection({ title, chips, theme, onOpen }) {
  return (
    <View style={styles.connectionSection}>
      <Caption>{title}</Caption>
      <View style={styles.connectionChips}>
        {chips.map((chip) => (
          <ConnectionChip
            key={chip.key}
            chip={chip}
            theme={theme}
            onPress={() => onOpen(chip)}
          />
        ))}
      </View>
    </View>
  );
}

function ConnectionChip({ chip, theme, onPress }) {
  const interactive = Boolean(chip.route || chip.action);
  const content = (
    <>
      <View style={[styles.connectionIcon, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name={chip.icon || 'ellipse-outline'} size={15} color={theme.semantic.primary} />
      </View>
      <View style={styles.connectionText}>
        <Body style={styles.connectionLabel}>{chip.label}</Body>
        <Caption numberOfLines={2}>{chip.detail}</Caption>
      </View>
      {interactive ? (
        <Ionicons name="chevron-forward" size={15} color={theme.semantic.textMuted} />
      ) : null}
    </>
  );

  if (!interactive) {
    return (
      <View style={[styles.connectionChip, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${chip.label}: ${chip.detail}`}
      style={({ pressed }) => [
        styles.connectionChip,
        {
          backgroundColor: theme.semantic.cardAlt,
          borderColor: theme.semantic.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

function MediaMosaic({ media, theme, onPromoteVideo, promotingVideo, photoFocused = false, onPhotoPress }) {
  if (!media.length) {
    return (
      <Pressable
        onPress={onPhotoPress}
        accessibilityRole="button"
        accessibilityLabel="Show full photo"
        style={[styles.heroMedia, { backgroundColor: theme.semantic.cardAlt }]}
      >
        <PhotoPlaceholder style={StyleSheet.absoluteFill} />
      </Pressable>
    );
  }
  const first = media[0];
  return (
    <View style={styles.mediaWrap}>
      <View style={[styles.heroMedia, { backgroundColor: photoFocused ? glass.photoBackdrop : theme.semantic.cardAlt }]}>
        {first.media_type === 'video' ? (
          first.fullUrl
            ? <VideoPlayerTile media={first} theme={theme} />
            : (
              <VideoPlaceholder
                media={first}
                theme={theme}
                large
                onPromote={onPromoteVideo}
                promoting={promotingVideo}
              />
            )
        ) : first.fullUrl || first.thumbUrl ? (
          <Pressable
            onPress={onPhotoPress}
            accessibilityRole="button"
            accessibilityLabel="Show full photo"
            style={StyleSheet.absoluteFill}
          >
            <Image
              source={{ uri: first.fullUrl || first.thumbUrl }}
              style={StyleSheet.absoluteFill}
              contentFit={photoFocused ? 'contain' : 'cover'}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={onPhotoPress}
            accessibilityRole="button"
            accessibilityLabel="Show full photo"
            style={StyleSheet.absoluteFill}
          >
            <PhotoPlaceholder style={StyleSheet.absoluteFill} />
          </Pressable>
        )}
      </View>
      {media.length > 1 ? (
        <View style={styles.mediaCountBadge}>
          <Caption style={styles.mediaCountText}>+{media.length - 1}</Caption>
        </View>
      ) : null}
    </View>
  );
}

function VideoPlaceholder({ media, theme, large = false, onPromote, promoting = false }) {
  const posterOnly = Boolean(media.metadata?.posterOnly || media.quota_class === 'poster_only');
  const localAssetDeleted = isLocalAssetDeleted(media);
  const canPromote = posterOnly && onPromote && media.local_identifier && !localAssetDeleted;
  const statusLabel = localAssetDeleted
    ? 'Deleted from your phone, still in the vault'
    : posterOnly ? 'Video moment waiting to save' : `Video ${formatSeconds(media.duration_sec)}`;
  const promoteButton = canPromote ? (
    <Pressable
      onPress={() => onPromote(media)}
      disabled={promoting}
      accessibilityRole="button"
      accessibilityLabel="Save playable video"
      style={[styles.promoteVideoButton, { backgroundColor: theme.semantic.primary, opacity: promoting ? 0.6 : 1 }]}
    >
      <Caption style={[styles.promoteVideoText, { color: theme.colors.onPrimary }]}>
        {promoting ? 'Saving video...' : 'Save playable video'}
      </Caption>
    </Pressable>
  ) : null;

  if (media.posterUrl) {
    return (
      <View style={styles.videoPlaceholder}>
        <Image source={{ uri: media.posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={large ? 52 : 28} color={theme.colors.onPrimary} />
          <Caption style={[styles.videoOverlayLabel, { color: theme.colors.onPrimary }]}>
            {statusLabel}
          </Caption>
          {promoteButton}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.videoPlaceholder}>
      <Ionicons name="play-circle" size={large ? 52 : 26} color={theme.semantic.primary} />
      <Caption style={{ color: theme.semantic.textSoft, marginTop: 4 }}>
        {statusLabel}
      </Caption>
      {promoteButton}
    </View>
  );
}

function VideoPlayerTile({ media, theme }) {
  const [frameReady, setFrameReady] = useState(false);
  const source = useMemo(
    () => ({
      uri: media.fullUrl,
      metadata: {
        title: media.file_name || 'Our Little World video',
        artist: 'Our Little World',
      },
    }),
    [media.file_name, media.fullUrl],
  );
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.audioMixingMode = 'auto';
  });

  useEffect(() => {
    setFrameReady(false);
  }, [media.fullUrl]);

  return (
    <View style={styles.videoPlaceholder}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls
        fullscreenOptions={{ enable: true, orientation: 'default' }}
        allowsVideoFrameAnalysis={false}
        onFirstFrameRender={() => setFrameReady(true)}
      />
      {!frameReady && media.posterUrl ? (
        <Image
          source={{ uri: media.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          pointerEvents="none"
        />
      ) : null}
      {!frameReady ? (
        <View pointerEvents="none" style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={52} color={theme.colors.onPrimary} />
          <Caption style={[styles.videoOverlayLabel, { color: theme.colors.onPrimary }]}>
            Video {formatSeconds(media.duration_sec)}
          </Caption>
        </View>
      ) : null}
    </View>
  );
}

function Waveform({ values, color }) {
  const bars = values?.length ? values : Array.from({ length: 24 }, (_, i) => 0.25 + ((i % 5) / 8));
  return (
    <View style={styles.waveform}>
      {bars.map((value, index) => (
        <View
          key={`${index}-${value}`}
          style={[
            styles.waveBar,
            {
              height: 8 + Math.round(Number(value || 0.2) * 24),
              backgroundColor: color,
              opacity: 0.35 + Number(value || 0.2) * 0.45,
            },
          ]}
        />
      ))}
    </View>
  );
}

function formatSeconds(value) {
  const total = Math.round(Number(value || 0));
  if (!Number.isFinite(total) || total <= 0) return '';
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function normalizeSharedWith(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function dateOnlyFromIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function capturedAtFromDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  return `${value}T12:00:00.000Z`;
}

function todayIsoDate() {
  return dateOnlyFromIso(new Date());
}

const styles = StyleSheet.create({
  detailContent: {
    paddingBottom: space.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  backButton: {
    marginTop: space.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  detailHero: {
    height: 440,
    width: '100%',
    backgroundColor: glass.photoBackdrop,
  },
  heroTopRow: {
    position: 'absolute',
    top: space.md,
    left: space.xl,
    right: space.xl,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaWrap: {
    flex: 1,
  },
  heroMedia: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  mediaCountBadge: {
    position: 'absolute',
    right: space.xl,
    bottom: 128,
    minWidth: 34,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.mediaChrome,
    borderWidth: 1,
    borderColor: glass.mediaChromeBorder,
  },
  mediaCountText: {
    color: glass.inverseTextBody,
    fontWeight: '800',
    letterSpacing: 0,
  },
  heroCaption: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: 42,
  },
  heroAge: {
    fontStyle: 'italic',
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    marginTop: space.xs,
    textShadowColor: glass.mediaTextShadow,
    textShadowRadius: 8,
  },
  heroMeta: {
    marginTop: space.xs,
    textTransform: 'none',
    letterSpacing: 0,
  },
  detailSheet: {
    marginTop: -22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetHandleTouch: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginBottom: space.sm,
  },
  connectionSection: {
    gap: space.sm,
  },
  connectionChips: {
    gap: space.sm,
  },
  connectionChip: {
    width: '100%',
    minHeight: 68,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  connectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionText: {
    flex: 1,
    minWidth: 0,
  },
  connectionLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.mediaScrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlayLabel: {
    marginTop: 4,
    textShadowColor: glass.mediaTextShadow,
    textShadowRadius: 6,
  },
  promoteVideoButton: {
    marginTop: space.sm,
    minHeight: 40,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoteVideoText: {
    fontWeight: '800',
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
    marginVertical: space.sm,
  },
  handwrittenNote: {
    fontFamily: 'Caveat',
    fontSize: 22,
    lineHeight: 29,
    marginTop: space.sm,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  tagPill: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  editFields: {
    marginTop: space.md,
  },
  contextDraftRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  contextDraftText: {
    flex: 1,
    minWidth: 0,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.md,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceTitle: {
    fontSize: 21,
    lineHeight: 26,
    marginTop: 2,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: space.lg,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  reactionButton: {
    minWidth: 64,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  reactionEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  reactionAddButton: {
    minWidth: 44,
    backgroundColor: glass.clear,
    borderStyle: 'dashed',
  },
  reactionPicker: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.md,
  },
  reactionPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  reactionPickerButton: {
    width: 58,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  reactionPickerEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
});
