import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import BirthDatePicker from './ui/BirthDatePicker';
import { Body, Button, Caption, Field, Screen, Title, radius, shadow, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { buildAddMomentState } from './addMomentModel';
import { CONTEXT_DRAFT_LABEL, CONTEXT_DRAFT_USE_LABEL, factsOnlyContextDraft } from './captionTemplateModel.js';
import { firstHappenedDateCaption } from './firstComposeSeedModel.js';
import { isMediaPolicyError, promptOverLimitVideo } from './mediaPolicy';
import { createMomentWithMedia } from './moments';
import PostSaveNudgeSheet from './PostSaveNudgeSheet';
import { dismissPostSaveNudge, readPostSaveNudgeState, recordPostSaveNudgeShown } from './postSaveNudgeStore';
import { selectPostSaveNudge } from './postSaveNudgeModel';
import { Firsts } from './rituals';
import { buildAddManualQaFixture, buildAddManualQaPostSaveNudge } from './addManualQaFixtures';
import { trackAnalyticsEvent } from './analytics';
import { bucketCount } from './analyticsEventsModel';
import { analyticsEnvironment, analyticsPlatform, mediaKindForAssets } from './analyticsProductContext';

const SECONDARY_ACTIONS = [
  { icon: 'chatbubble-ellipses-outline', title: "Answer today's prompt", route: '/prompt' },
  { icon: 'flag-outline', title: 'Add a first', route: '/first-compose' },
  { icon: 'mail-outline', title: 'Write a letter', route: '/letter-compose' },
  { icon: 'sparkles-outline', title: 'Scan library', route: '/reference' },
];

export default function AddSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [assets, setAssets] = useState([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [place, setPlace] = useState('');
  const [tagText, setTagText] = useState('');
  const [happenedDate, setHappenedDate] = useState('');
  const [voice, setVoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [postSaveNudge, setPostSaveNudge] = useState(null);
  const [postSaveDryRun, setPostSaveDryRun] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const manualQaFixture = useMemo(
    () => (__DEV__ ? buildAddManualQaFixture(params.qa) : null),
    [params.qa],
  );

  useEffect(() => {
    if (!manualQaFixture) return;
    setAssets(manualQaFixture.assets);
    setTitle('');
    setNote('');
    setPlace('');
    setTagText('');
    setHappenedDate('');
    setVoice(null);
    setContextOpen(false);
  }, [manualQaFixture]);

  const tags = useMemo(
    () => tagText.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tagText],
  );
  const addState = useMemo(
    () => buildAddMomentState({ assets, voice, note, title, place, tags }),
    [assets, note, place, tags, title, voice],
  );
  const happenedDateCaption = useMemo(
    () => firstHappenedDateCaption({
      babyBirthday: family?.babyBirthday,
      babyName: family?.babyName,
      happenedDate,
    }),
    [family?.babyBirthday, family?.babyName, happenedDate],
  );
  const contextDraft = useMemo(
    () => factsOnlyContextDraft({
      babyBirthday: family?.babyBirthday,
      happenedDate,
      placeLabel: place,
      tags,
    }),
    [family?.babyBirthday, happenedDate, place, tags],
  );

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/timeline');
  }, [router]);

  const openAction = useCallback((action) => {
    router.push(action.route);
  }, [router]);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 12,
      orderedSelection: true,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      quality: 1,
      exif: true,
      shouldDownloadFromNetwork: true,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    });
    if (result.canceled || !result.assets?.length) return;
    setAssets((current) => [...current, ...result.assets].slice(0, 24));
  };

  const removeAsset = (index) => {
    setAssets((current) => current.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    setAudioBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to add a voice note.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoice(null);
    } catch (err) {
      Alert.alert('Could not record', err?.message || String(err));
    } finally {
      setAudioBusy(false);
    }
  };

  const stopRecording = async () => {
    setAudioBusy(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Recording did not produce an audio file');
      const durationSec = recorder.currentTime || (recorderState.durationMillis ? recorderState.durationMillis / 1000 : null);
      setVoice({
        uri,
        durationSec,
        mimeType: 'audio/mp4',
        waveform: buildWaveform(durationSec || 8),
      });
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch (err) {
      Alert.alert('Could not save recording', err?.message || String(err));
    } finally {
      setAudioBusy(false);
    }
  };

  const clearVoice = () => setVoice(null);

  const finishPostSave = useCallback(async (route = null) => {
    const nudge = postSaveNudge;
    if (nudge?.momentId && family?.id && !postSaveDryRun) {
      await dismissPostSaveNudge({
        familyId: family.id,
        userId: user?.id,
        momentId: nudge.momentId,
      });
    }
    setPostSaveNudge(null);
    setPostSaveDryRun(false);
    router.replace('/timeline');
    if (route) requestAnimationFrame(() => router.push(route));
  }, [family?.id, postSaveDryRun, postSaveNudge, router, user?.id]);

  const saveMoment = async ({ videoPosterOnly = false } = {}) => {
    if (!family?.id) return;
    setSaving(true);
    try {
      const dryRun = !!manualQaFixture;
      const moment = dryRun
        ? manualQaFixture.moment
        : await createMomentWithMedia({
          familyId: family.id,
          title,
          note,
          placeName: place,
          tags,
          assets,
          voice,
          videoPosterOnly,
          capturedAt: capturedAtFromDate(happenedDate),
        });
      if (!dryRun) {
        trackAnalyticsEvent('moment_saved', {
          surface: 'add',
          save_source: 'add_sheet',
          media_kind: mediaKindForAssets(assets, Boolean(voice)),
          media_count_bucket: bucketCount(assets.length),
          has_voice: Boolean(voice),
          has_text_note: Boolean(note.trim()),
          happened_at_changed: Boolean(happenedDate),
          child_age_band: 'unknown',
        }, {
          family_id: family.id,
          actor_role: family?.me?.role || 'creator',
          plan_state: 'unknown',
          platform: analyticsPlatform(Platform.OS),
          environment: analyticsEnvironment(),
        });
      }
      const nudge = dryRun
        ? buildAddManualQaPostSaveNudge(manualQaFixture, { family, assets, note, voice })
        : await buildPostSaveNudge({
          family,
          user,
          moment,
          assets,
          note,
          voice,
        });
      if (nudge) {
        if (!dryRun) await recordPostSaveNudgeShown({ familyId: family.id, userId: user?.id });
        setPostSaveDryRun(dryRun);
        setPostSaveNudge(nudge);
        return;
      }
      router.replace('/timeline');
    } catch (err) {
      if (isMediaPolicyError(err)) {
        promptOverLimitVideo({
          onPosterOnly: () => saveMoment({ videoPosterOnly: true }),
          onSeeVault: () => router.push('/purchase'),
        });
      } else {
        Alert.alert('Could not save moment', err?.message || String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const contextExpanded = addState.canShowContext && (contextOpen || addState.hasContext);
  const showHappenedDate = addState.hasPrimaryContent || Boolean(happenedDate);
  const recording = !!recorderState.isRecording;
  const audioSeconds = recording
    ? Math.round((recorderState.durationMillis || 0) / 1000)
    : Math.round(voice?.durationSec || 0);

  if (postSaveNudge) {
    return (
      <PostSaveNudgeSheet
        nudge={postSaveNudge}
        theme={theme}
        onDismiss={() => finishPostSave(null)}
        onAction={() => finishPostSave(postSaveNudge.route)}
      />
    );
  }

  return (
    <Screen bare scroll keyboard>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Title style={styles.title}>Save a moment</Title>
            <Caption>Add a photo, a voice note, or a few words. Context can come later.</Caption>
          </View>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close add moment"
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: theme.semantic.cardAlt,
                borderColor: theme.semantic.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={18} color={theme.semantic.textSoft} />
          </Pressable>
        </View>

        <View style={styles.primaryActions}>
          <Button
            variant="ghost"
            onPress={pickMedia}
            testID="add-media-button"
            icon={<Ionicons name="images-outline" size={17} color={theme.semantic.primary} />}
          >
            Add photos or videos
          </Button>
          <Button
            variant={recording ? 'dark' : 'ghost'}
            onPress={recording ? stopRecording : startRecording}
            loading={audioBusy}
            icon={<Ionicons name={recording ? 'stop-circle-outline' : 'mic-outline'} size={17} color={recording ? theme.colors.bg : theme.semantic.primary} />}
          >
            {recording ? `Stop recording ${audioSeconds}s` : voice ? `Voice note ${audioSeconds}s` : 'Add voice note'}
          </Button>
        </View>

        {assets.length ? (
          <View style={styles.mediaStrip}>
            {assets.map((asset, index) => (
              <View key={`${asset.uri}-${index}`} style={[styles.mediaThumb, { backgroundColor: theme.semantic.cardAlt }]}>
                {asset.type === 'video' ? (
                  <View style={styles.videoTile}>
                    <Ionicons name="play-circle" size={30} color={theme.semantic.primary} />
                    <Caption style={styles.videoLabel}>{formatDuration(asset.duration)}</Caption>
                  </View>
                ) : (
                  <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                )}
                <Pressable
                  onPress={() => removeAsset(index)}
                  style={[styles.removeThumb, { backgroundColor: theme.colors.ink }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove media item ${index + 1}`}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={12} color={theme.colors.bg} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {voice?.uri ? (
          <View style={[styles.voiceCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <Ionicons name="mic" size={17} color={theme.semantic.primary} />
            <View style={styles.voiceBody}>
              <Caption>Voice note · {audioSeconds}s</Caption>
              <Waveform values={voice.waveform} color={theme.semantic.primary} />
            </View>
            <Pressable
              onPress={clearVoice}
              accessibilityRole="button"
              accessibilityLabel="Remove voice note"
              hitSlop={12}
            >
              <Ionicons name="trash-outline" size={17} color={theme.semantic.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <Field
          as="textarea"
          value={note}
          onChangeText={setNote}
          placeholder="Write one line about this moment"
          caption="A few words are enough, or leave this blank if the media or voice already says it."
        />
        {contextDraft && !note.trim() ? (
          <Pressable
            onPress={() => setNote(contextDraft)}
            accessibilityRole="button"
            accessibilityLabel={`Use suggested line: ${contextDraft}`}
            style={[styles.contextDraftRow, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <View style={styles.contextDraftText}>
              <Caption>{CONTEXT_DRAFT_LABEL}</Caption>
              <Body>{contextDraft}</Body>
            </View>
            <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>{CONTEXT_DRAFT_USE_LABEL}</Caption>
          </Pressable>
        ) : null}

        {showHappenedDate ? (
          <BirthDatePicker
            value={happenedDate}
            onChange={setHappenedDate}
            placeholder="When did it happen? (optional)"
            accessibilityLabel="Moment happened date"
            caption={happenedDateCaption}
            defaultDate={todayIsoDate()}
          />
        ) : null}

        {addState.canShowContext ? (
          <Pressable
            onPress={() => setContextOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={contextExpanded ? 'Hide optional context' : 'Add optional context'}
            style={({ pressed }) => [
              styles.contextToggle,
              {
                backgroundColor: theme.semantic.cardAlt,
                borderColor: theme.semantic.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <View style={styles.contextToggleIcon}>
              <Ionicons name="pricetag-outline" size={17} color={theme.semantic.primary} />
            </View>
            <View style={styles.contextToggleCopy}>
              <Body style={styles.contextToggleTitle}>
                {addState.hasContext ? 'Edit context' : 'Add context'}
              </Body>
              <Caption>Optional title, place, and tags for the book.</Caption>
            </View>
            <Ionicons
              name={contextExpanded ? 'chevron-up' : 'chevron-down'}
              size={17}
              color={theme.semantic.textMuted}
            />
          </Pressable>
        ) : null}

        {contextExpanded ? (
          <View style={styles.fields}>
            <Field
              value={title}
              onChangeText={setTitle}
              placeholder="Title (optional)"
              caption="The moment can stay untitled."
            />
            <Field
              value={place}
              onChangeText={setPlace}
              placeholder="Place (optional)"
              caption="Helps the book group memories by where they happened."
            />
            <Field
              value={tagText}
              onChangeText={setTagText}
              placeholder="Tags (optional, comma separated)"
              caption={tags.length
                ? tags.map((tag) => `#${tag}`).join(' ')
                : 'Separate with commas; we clean up duplicates and #tags.'}
              autoCapitalize="none"
            />
          </View>
        ) : null}

        <Button onPress={saveMoment} loading={saving} disabled={!addState.canSave || saving}>
          Save moment
        </Button>

        <View style={styles.secondaryGrid}>
          {SECONDARY_ACTIONS.map((action) => (
            <Pressable
              key={action.title}
              onPress={() => openAction(action)}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              style={({ pressed }) => [
                styles.secondaryAction,
                {
                  backgroundColor: theme.semantic.cardAlt,
                  borderColor: theme.semantic.border,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <Ionicons name={action.icon} size={17} color={theme.semantic.primary} />
              <Body style={styles.secondaryTitle}>{action.title}</Body>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function capturedAtFromDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  return `${value}T12:00:00.000Z`;
}

function todayIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function buildPostSaveNudge({ family, user, moment, assets, note, voice }) {
  try {
    const [state, goalDefinitions, firstRows] = await Promise.all([
      readPostSaveNudgeState({ familyId: family.id, userId: user?.id }),
      Firsts.listGoalDefinitions(),
      Firsts.list(family.id),
    ]);
    return selectPostSaveNudge({
      state,
      moment: {
        id: moment.id,
        assets,
        media: moment.media,
        voice: moment.voice || voice,
        hasVoice: Boolean(moment.voice || voice?.uri),
        note,
        capturedAt: moment.capturedAt,
      },
      goals: goalDefinitions,
      firsts: firstRows,
      birthdayISO: family.babyBirthday,
      babyName: family.babyName,
    });
  } catch (err) {
    console.warn('buildPostSaveNudge', err?.message);
    return null;
  }
}

function buildWaveform(seedSeconds) {
  const base = Math.max(1, Math.min(30, Number(seedSeconds || 8)));
  return Array.from({ length: 24 }, (_, i) => {
    const wave = Math.sin((i / 24) * Math.PI * 2.4 + base) * 0.35;
    const taper = i < 3 || i > 20 ? 0.65 : 1;
    return Math.max(0.18, Math.min(1, (0.52 + wave) * taper));
  });
}

function formatDuration(ms) {
  if (!ms) return '';
  const total = Math.round(Number(ms) / 1000);
  if (!Number.isFinite(total) || total <= 0) return '';
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function Waveform({ values, color }) {
  return (
    <View style={styles.waveform}>
      {(values || []).map((value, index) => (
        <View
          key={`${index}-${value}`}
          style={[
            styles.waveBar,
            {
              height: 8 + Math.round(value * 22),
              backgroundColor: color,
              opacity: 0.35 + value * 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
    marginBottom: 4,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActions: {
    gap: space.sm,
  },
  mediaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  mediaThumb: {
    width: 74,
    height: 74,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.whisper,
  },
  videoTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: {
    marginTop: 2,
    fontSize: 10,
  },
  removeThumb: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  voiceBody: {
    flex: 1,
  },
  waveform: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  contextToggle: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  contextToggleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextToggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  contextToggleTitle: {
    fontWeight: '800',
  },
  fields: {
    gap: space.md,
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
  secondaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  secondaryAction: {
    width: '48%',
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  secondaryTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
});
