import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Body, Button, Caption, Eyebrow, Screen, Title, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { Family, relationshipTitle } from './families';
import { Letters } from './rituals';

export default function LetterDetailSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { family } = useFamily();
  const { user } = useAuth();
  const [letter, setLetter] = useState(null);
  const [members, setMembers] = useState({});
  const voice = letter?.voiceNotes?.find((item) => item.audioUrl) || null;
  const player = useAudioPlayer(voice?.audioUrl ? { uri: voice.audioUrl } : null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);

  const close = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/letters');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (family?.id && id) {
        Promise.all([
          Letters.get(family.id, id),
          Family.members(family.id).catch(() => []),
        ]).then(([row, memberRows]) => {
          if (!alive) return;
          setLetter(row || null);
          setMembers(Object.fromEntries(memberRows.map((m) => [m.userId, m.displayName || relationshipTitle(m.relationshipLabel)])));
        });
      }
      return () => {
        alive = false;
      };
    }, [family?.id, id]),
  );

  const openable = useMemo(
    () => letter && isOpenable(letter.open_on),
    [letter],
  );

  useEffect(() => {
    if (!letter || !openable || letter.opened_at) return;
    let alive = true;
    Letters.open(letter.id)
      .then((next) => {
        if (alive) setLetter((current) => ({ ...current, ...next }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [letter, openable]);

  const remove = () => {
    if (!letter) return;
    if (letter.author_user_id !== user?.id) {
      Alert.alert('Cannot delete', 'Only the parent who wrote this letter can delete it.');
      return;
    }
    Alert.alert('Delete letter?', 'This letter will be removed from the baby book.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Letters.deleteOwn(letter.id, family?.id);
          close();
        },
      },
    ]);
  };

  return (
    <Screen bare scroll contentStyle={styles.screenContent}>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        {letter ? (
          <>
            <Eyebrow>{openable ? 'Open letter' : 'Sealed letter'}</Eyebrow>
            <Title style={styles.title}>{letter.title || 'Untitled letter'}</Title>
            <Caption>
              {letterDateCaption(letter, members[letter.author_user_id] || 'Family')}
            </Caption>
            {openable ? (
              <>
                {letter.body?.trim() ? <Body style={styles.body}>{letter.body}</Body> : null}
                {letter.media?.length ? (
                  <View style={styles.mediaSection}>
                    <Caption style={styles.sectionLabel}>Kept with this letter</Caption>
                    <View style={styles.mediaGrid}>
                      {letter.media.map((media, index) => (
                        <LetterMedia key={media.id || index} media={media} theme={theme} featured={index === 0} />
                      ))}
                    </View>
                  </View>
                ) : null}
                {voice ? (
                  <View style={[styles.voiceCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
                    <Pressable
                      onPress={() => {
                        if (playerStatus.playing) player.pause();
                        else player.play();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={playerStatus.playing ? 'Pause letter recording' : 'Play letter recording'}
                      style={[styles.playButton, { backgroundColor: theme.semantic.primary }]}
                    >
                      <Ionicons name={playerStatus.playing ? 'pause' : 'play'} size={20} color={theme.colors.onPrimary} />
                    </Pressable>
                    <View style={styles.voiceBody}>
                      <Body style={styles.voiceTitle}>In their own voice</Body>
                      <Waveform values={voice.waveform} color={theme.semantic.primary} />
                      <Caption>{playbackCaption(playerStatus, voice.duration_sec)}</Caption>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={[styles.sealedPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
                <View style={[styles.sealDisc, { backgroundColor: theme.colors.primarySoft }]}>
                  <Title style={[styles.sealMark, { color: theme.semantic.primary }]}>sealed</Title>
                </View>
                <Title style={styles.sealedTitle}>{timeUntilLabel(letter.open_on)} left</Title>
                <Body style={styles.sealedBody}>This letter stays closed until the date you chose.</Body>
              </View>
            )}
            <View style={styles.actionRow}>
              <Button variant="quiet" size="md" fullWidth={false} onPress={remove}>Delete</Button>
              <Button size="md" fullWidth={false} onPress={close}>Close</Button>
            </View>
          </>
        ) : (
          <>
            <Title>letter unavailable</Title>
            <Button size="md" fullWidth={false} onPress={close}>Close</Button>
          </>
        )}
      </View>
    </Screen>
  );
}

function LetterMedia({ media, theme, featured }) {
  const style = featured ? styles.featuredMedia : styles.secondaryMedia;
  if (media.media_type === 'video') {
    return <LetterVideo media={media} theme={theme} style={style} />;
  }
  return (
    <View style={[style, styles.mediaTile, { backgroundColor: theme.semantic.cardAlt }]}>
      {media.fullUrl || media.thumbUrl ? (
        <Image source={{ uri: media.fullUrl || media.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Ionicons name="image-outline" size={30} color={theme.semantic.textMuted} />
      )}
    </View>
  );
}

function LetterVideo({ media, theme, style }) {
  const source = useMemo(() => media.fullUrl ? { uri: media.fullUrl } : null, [media.fullUrl]);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.audioMixingMode = 'auto';
  });

  return (
    <View style={[style, styles.mediaTile, { backgroundColor: theme.semantic.cardAlt }]}>
      {media.fullUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls
          fullscreenOptions={{ enable: true, orientation: 'default' }}
          allowsVideoFrameAnalysis={false}
        />
      ) : media.posterUrl ? (
        <Image source={{ uri: media.posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      {!media.fullUrl ? (
        <View style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={38} color={theme.colors.onPrimary} />
          <Caption style={{ color: theme.colors.onPrimary }}>{formatSeconds(media.duration_sec)}</Caption>
        </View>
      ) : null}
    </View>
  );
}

function Waveform({ values, color }) {
  const bars = values?.length ? values : Array.from({ length: 24 }, (_, index) => 0.25 + ((index % 5) / 8));
  return (
    <View style={styles.waveform}>
      {bars.map((value, index) => (
        <View
          key={`${index}-${value}`}
          style={[styles.waveBar, { height: 6 + Math.round(Number(value || 0.2) * 18), backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

function playbackCaption(status, duration) {
  const total = Number(status?.duration || duration || 0);
  const current = Number(status?.currentTime || 0);
  return `${formatSeconds(current)} of ${formatSeconds(total)}`;
}

function formatSeconds(value) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return 'open anytime';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOpenable(openOn) {
  if (!openOn) return true;
  return new Date(`${openOn}T00:00:00`).getTime() <= Date.now();
}

function letterDateCaption(letter, author) {
  if (!letter?.open_on) return `from ${author} · open anytime`;
  const label = isOpenable(letter.open_on) ? 'opened' : 'opens';
  return `from ${author} · ${label} ${formatDate(letter.open_on)}`;
}

function timeUntilLabel(openOn) {
  if (!openOn) return 'open now';
  const open = new Date(`${openOn}T00:00:00`);
  const now = new Date();
  if (open.getTime() <= now.getTime()) return 'open now';
  let months = (open.getFullYear() - now.getFullYear()) * 12 + (open.getMonth() - now.getMonth());
  if (open.getDate() < now.getDate()) months -= 1;
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${years}y ${rest}mo` : `${years}y`;
  }
  if (months > 0) return `${months}mo`;
  const days = Math.max(1, Math.ceil((open.getTime() - now.getTime()) / 86400000));
  return `${days}d`;
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
  },
  root: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  title: {
    marginTop: space.sm,
  },
  body: {
    marginTop: space.lg,
    marginBottom: space.lg,
    fontSize: 18,
    lineHeight: 29,
  },
  sectionLabel: { fontWeight: '700' },
  mediaSection: { gap: space.sm, marginBottom: space.lg },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mediaTile: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  featuredMedia: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  secondaryMedia: { width: 96, height: 96, borderRadius: radius.md },
  videoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  voiceCard: { borderRadius: radius.lg, borderWidth: 1, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
  playButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  voiceBody: { flex: 1, gap: 3 },
  voiceTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  waveform: { height: 24, flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 3, borderRadius: radius.pill, opacity: 0.7 },
  sealedPanel: {
    marginTop: space.xl,
    marginBottom: space.xl,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
  },
  sealDisc: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  sealMark: {
    fontFamily: 'Caveat',
    fontSize: 25,
    lineHeight: 31,
  },
  sealedTitle: {
    fontSize: 24,
    lineHeight: 30,
    marginBottom: space.sm,
  },
  sealedBody: {
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
});
