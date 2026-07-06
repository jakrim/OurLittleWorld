import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Body, Button, Caption, Card, Field, HomeIndicator, PhotoPlaceholder, Screen, Title, V, glass, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { Family } from './families';
import { Firsts } from './rituals';
import { ageAt, formatAge } from './photos';
import { isMediaPolicyError, promptOverLimitVideo } from './mediaPolicy';
import { deleteMoment, deleteVoiceNote, getMomentDetail, setMomentSharedWith, toggleMomentReaction, updateMoment } from './moments';
import { uploadForTag } from './photoSync';
import { shareMemoryMoment } from './shareMoment';
import PhotoActionSheet from './PhotoActionSheet';
import { isLocalAssetDeleted } from './localAssetDeletion';

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
  const [sharingCircle, setSharingCircle] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [promotingVideo, setPromotingVideo] = useState(false);

  const voice = moment?.voiceNotes?.find((item) => item.audioUrl) || null;
  const player = useAudioPlayer(voice?.audioUrl ? { uri: voice.audioUrl } : null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);

  const load = async () => {
    if (!family?.id || !momentId) return;
    setLoading(true);
    try {
      const next = await getMomentDetail({ familyId: family.id, momentId });
      setMoment(next);
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
  const circleMembers = useMemo(() => members.filter((member) => member.role === 'circle'), [members]);
  const sharedWith = useMemo(() => normalizeSharedWith(moment?.shared_with), [moment?.shared_with]);
  const sharedWithCircle = sharedWith.includes('circle');
  const canWrite = ['creator', 'partner'].includes(family?.me?.role);
  const isOwner = !!moment?.author_user_id && moment.author_user_id === user?.id;

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
    setEditTags((moment?.tags || []).join(', '));
    setEditOpen(true);
    setMenuVisible(false);
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

  const setAsMilestone = async () => {
    if (!family?.id || !moment?.id) return;
    setMenuVisible(false);
    try {
      const existing = (await Firsts.list(family.id)).find((row) => row.moment_id === moment.id);
      const row = existing || await Firsts.create({
        familyId: family.id,
        title: moment.title || 'A little first',
        note: moment.caption_note || null,
        happenedAt: moment.captured_at || null,
        momentId: moment.id,
        done: true,
      });
      router.push({ pathname: '/first-compose', params: { id: row.id, momentId: moment.id } });
    } catch (err) {
      Alert.alert('Could not set milestone', err?.message || String(err));
    }
  };

  const confirmDelete = () => {
    setMenuVisible(false);
    Alert.alert('Delete this moment?', 'This removes the saved Moment, linked media rows, voice notes, reactions, and archive compatibility rows.', [
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
    {
      icon: sharedWithCircle ? 'eye-off-outline' : 'people-outline',
      label: sharedWithCircle ? 'Keep between co-parents' : 'Share to family circle',
      onPress: toggleCircleShare,
      disabled: !isOwner,
    },
    { icon: 'trash-outline', label: 'Delete moment', onPress: confirmDelete, destructive: true, disabled: !isOwner },
  ];

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
    <Screen variant="dark" scroll bare edges={{ top: true, bottom: false }} contentStyle={styles.detailContent}>
      <View style={styles.detailHero}>
        <MediaMosaic media={moment.media || []} theme={theme} onPromoteVideo={promoteVideo} promotingVideo={promotingVideo} />
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
            <Ionicons name="chevron-back" size={19} color={theme.colors.bg} />
          </Pressable>
          <Caption style={{ color: theme.colors.bg }}>{capturedLabel}</Caption>
          <Pressable
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open moment actions"
            style={[styles.iconButton, { backgroundColor: glass.mediaChrome, borderColor: glass.mediaChromeBorder }]}
          >
            <Ionicons name="ellipsis-horizontal" size={19} color={theme.colors.bg} />
          </Pressable>
        </View>
        <View style={styles.heroCaption}>
          {capturedAgeLabel ? (
            <Caption style={[styles.heroAge, { color: theme.colors.bg }]}>{capturedAgeLabel}</Caption>
          ) : null}
          <Title style={[styles.heroTitle, { color: theme.colors.bg }]}>
            {moment.title || 'A little moment'}
          </Title>
          <Caption style={[styles.heroMeta, { color: glass.inverseTextBody }]}>
            {[moment.place_name, capturedLabel].filter(Boolean).join(' · ') || 'Saved moment'}
          </Caption>
        </View>
      </View>

      <View style={[styles.detailSheet, { backgroundColor: theme.semantic.card }]}>
        <View style={[styles.sheetHandle, { backgroundColor: theme.semantic.border }]} />
        {editOpen ? (
          <Card variant="muted">
            <Caption>Edit moment</Caption>
            <V gap="sm" style={styles.editFields}>
              <Field value={editTitle} onChangeText={setEditTitle} placeholder="Title" autoCapitalize="sentences" />
              <Field value={editPlace} onChangeText={setEditPlace} placeholder="Place" autoCapitalize="words" />
              <Field as="textarea" value={editNote} onChangeText={setEditNote} placeholder="Note" />
              <Field value={editTags} onChangeText={setEditTags} placeholder="Tags, separated by commas" autoCapitalize="none" />
            </V>
            <View style={styles.editActions}>
              <Button variant="ghost" size="sm" fullWidth={false} onPress={() => setEditOpen(false)}>Cancel</Button>
              <Button size="sm" fullWidth={false} onPress={saveEdit} loading={savingEdit}>Save</Button>
            </View>
          </Card>
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
          <View style={styles.sharedHeader}>
            <View style={styles.sharedCopy}>
              <Caption>Shared with</Caption>
              <Title style={styles.sharedTitle}>{sharedWithLabel({ sharedWithCircle, circleCount: circleMembers.length })}</Title>
              <Body>{sharedWithCircle ? 'View-only family can see this saved moment.' : 'Kept between co-parents unless you share it to the family circle.'}</Body>
            </View>
            <View style={[styles.sharedIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name={sharedWithCircle ? 'people-outline' : 'lock-closed-outline'} size={19} color={theme.semantic.primary} />
            </View>
          </View>
          <Button
            size="sm"
            fullWidth={false}
            variant="quiet"
            style={styles.sharedButton}
            onPress={toggleCircleShare}
            loading={sharingCircle}
            disabled={!isOwner}
          >
            {circleMembers.length ? (sharedWithCircle ? 'Keep between co-parents' : 'Share to circle') : 'Invite family circle'}
          </Button>
        </Card>

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
                  #{tag}
                </Caption>
              ))}
            </View>
          ) : null}
        </Card>
      </View>
      <HomeIndicator color={theme.colors.bg} />
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

function MediaMosaic({ media, theme, onPromoteVideo, promotingVideo }) {
  if (!media.length) {
    return (
      <View style={[styles.heroMedia, { backgroundColor: theme.semantic.cardAlt }]}>
        <PhotoPlaceholder style={StyleSheet.absoluteFill} />
      </View>
    );
  }
  const first = media[0];
  return (
    <View style={styles.mediaWrap}>
      <View style={[styles.heroMedia, { backgroundColor: theme.semantic.cardAlt }]}>
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
          <Image source={{ uri: first.fullUrl || first.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <PhotoPlaceholder style={StyleSheet.absoluteFill} />
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

function sharedWithLabel({ sharedWithCircle, circleCount }) {
  if (sharedWithCircle && circleCount > 0) return `Co-parents + ${circleCount} circle ${circleCount === 1 ? 'member' : 'members'}`;
  if (sharedWithCircle) return 'Co-parents + family circle';
  return 'Co-parents';
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
    marginBottom: space.sm,
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
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.md,
  },
  sharedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  sharedCopy: {
    flex: 1,
  },
  sharedTitle: {
    fontSize: 22,
    lineHeight: 27,
    marginVertical: space.xs,
  },
  sharedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedButton: {
    marginTop: space.lg,
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
