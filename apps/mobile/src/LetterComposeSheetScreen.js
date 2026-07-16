import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
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

import { Body, Button, Caption, Eyebrow, Field, Screen, Title, radius, shadow, space, useTheme } from './ui';
import BestPhotoRail from './ui/BestPhotoRail';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { candidateId } from './bestPhotoCandidateModel.js';
import { loadBestPhotoCandidates } from './bestPhotoCandidates';
import { canTranscribeLetterLocally, transcribeLetterRecording } from './letterTranscription';
import { isMediaPolicyError, promptOverLimitVideo } from './mediaPolicy';
import { uploadLetterAttachments } from './moments';
import { notifyPartnerLetterSaved } from './notificationEvents';
import { Letters } from './rituals';

const STARTERS = [
  { icon: 'sunny-outline', label: 'Right now', text: 'Right now, I want you to know…' },
  { icon: 'heart-outline', label: 'A small thing', text: 'A small thing I never want to forget…' },
  { icon: 'time-outline', label: 'When you read this', text: 'When you read this someday…' },
  { icon: 'sparkles-outline', label: 'What I see in you', text: 'Something I already see in you…' },
];

export default function LetterComposeSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const bodyInputRef = useRef(null);
  const seedTitle = firstParam(params.title);
  const seedBody = firstParam(params.body);
  const sourceMomentId = firstParam(params.sourceMomentId);
  const sourceFirstId = firstParam(params.sourceFirstId);
  const sourceDigestWeekStart = firstParam(params.sourceDigestWeekStart);
  const source = firstParam(params.source);
  const sourceLabel = sourceContextLabel({ sourceMomentId, sourceFirstId, sourceDigestWeekStart, source });
  const [title, setTitle] = useState(seedTitle || '');
  const [body, setBody] = useState(seedBody || '');
  const [assets, setAssets] = useState([]);
  const [bestPhotos, setBestPhotos] = useState({ photos: [], suppressedCount: 0 });
  const [bestPhotosLoading, setBestPhotosLoading] = useState(false);
  const [voice, setVoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptAdded, setTranscriptAdded] = useState(false);

  const recording = Boolean(recorderState.isRecording);
  const audioSeconds = recording
    ? Math.round((recorderState.durationMillis || 0) / 1000)
    : Math.round(voice?.durationSec || 0);
  const hasDraft = Boolean(title.trim() || body.trim() || assets.length || voice?.uri);
  const canSave = Boolean(body.trim() || assets.length || voice?.uri);
  const privateCaption = useMemo(
    () => `Only the two family writers can read this letter for ${family?.babyName || 'your baby'}.`,
    [family?.babyName],
  );

  useEffect(() => {
    let alive = true;
    if (!family?.id || !user?.id) return () => { alive = false; };
    setBestPhotosLoading(true);
    loadBestPhotoCandidates({
      familyId: family.id,
      userId: user.id,
      babyBirthday: family.babyBirthday,
      limit: 10,
    })
      .then((result) => {
        if (alive) setBestPhotos(result);
      })
      .catch(() => {
        if (alive) setBestPhotos({ photos: [], suppressedCount: 0 });
      })
      .finally(() => {
        if (alive) setBestPhotosLoading(false);
      });
    return () => { alive = false; };
  }, [family?.babyBirthday, family?.id, user?.id]);

  const leave = async () => {
    if (recorderState.isRecording) {
      await recorder.stop().catch(() => {});
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (router.canGoBack?.()) router.back();
    else router.replace('/letters');
  };

  const close = () => {
    if (!hasDraft) {
      leave();
      return;
    }
    Alert.alert('Leave this letter?', 'This unsaved draft will be discarded.', [
      { text: 'Keep writing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 12 - assets.length),
      orderedSelection: true,
      quality: 1,
      exif: false,
      shouldDownloadFromNetwork: true,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    });
    if (result.canceled || !result.assets?.length) return;
    setAssets((current) => [...current, ...result.assets].slice(0, 12));
  };

  const captureMedia = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
      exif: false,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets?.length) return;
    setAssets((current) => [...current, ...result.assets].slice(0, 12));
  };

  const toggleBestPhoto = (photo) => {
    const id = candidateId(photo);
    if (!id) return;
    setAssets((current) => {
      const selected = current.some((asset) => candidateId(asset) === id);
      if (selected) return current.filter((asset) => candidateId(asset) !== id);
      return [...current, photo].slice(0, 12);
    });
  };

  const startRecording = async () => {
    setAudioBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to add your voice to this letter.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoice(null);
      setTranscriptAdded(false);
    } catch (error) {
      Alert.alert('Could not record', error?.message || String(error));
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
      const durationSec = recorder.currentTime
        || (recorderState.durationMillis ? recorderState.durationMillis / 1000 : null);
      setVoice({
        uri,
        durationSec,
        mimeType: 'audio/mp4',
        waveform: buildWaveform(durationSec || 8),
      });
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (error) {
      Alert.alert('Could not keep recording', error?.message || String(error));
    } finally {
      setAudioBusy(false);
    }
  };

  const addTranscript = async () => {
    if (!voice?.uri || transcribing) return;
    if (!canTranscribeLetterLocally()) {
      Alert.alert('Transcription needs the latest build', 'Your voice recording is still attached. Rebuild or update the iPhone app to add its on-device transcript.');
      return;
    }
    setTranscribing(true);
    try {
      const transcript = await transcribeLetterRecording(voice.uri);
      if (!transcript) throw new Error('No clear speech was found in this recording');
      setBody((current) => current.trim() ? `${current.trim()}\n\n${transcript}` : transcript);
      setTranscriptAdded(true);
      requestAnimationFrame(() => bodyInputRef.current?.focus());
    } catch (error) {
      Alert.alert('Could not transcribe on this iPhone', `${error?.message || String(error)}. The original recording is still attached.`);
    } finally {
      setTranscribing(false);
    }
  };

  const applyStarter = (starter) => {
    setBody((current) => current.trim() ? `${current.trim()}\n\n${starter.text} ` : `${starter.text} `);
    requestAnimationFrame(() => bodyInputRef.current?.focus());
  };

  const completeSave = async (letter, { videoPosterOnly = false } = {}) => {
    let attachmentWarning = null;
    try {
      await uploadLetterAttachments({
        familyId: family.id,
        letterId: letter.id,
        assets,
        voice,
        videoPosterOnly,
      });
    } catch (error) {
      if (isMediaPolicyError(error) && !videoPosterOnly) {
        setSaving(false);
        promptOverLimitVideo({
          onPosterOnly: async () => {
            setSaving(true);
            await completeSave(letter, { videoPosterOnly: true });
          },
          onSeeVault: () => router.push('/purchase'),
        });
        return;
      }
      attachmentWarning = error;
    }

    notifyPartnerLetterSaved({
      familyId: family?.id,
      actorUserId: user?.id,
      letterId: letter?.id,
    }).catch((error) => console.warn('notify partner letter saved', error?.message));
    leave();
    if (attachmentWarning) {
      requestAnimationFrame(() => Alert.alert(
        'Letter saved',
        'The words are safe, but one or more attachments could not finish uploading. You can keep the originals and try again from a new letter.',
      ));
    }
  };

  const save = async () => {
    if (!canSave || !family?.id) return;
    setSaving(true);
    try {
      const letter = await Letters.create({
        familyId: family.id,
        title,
        body,
        openOn: null,
        sourceMomentId,
        sourceFirstId,
      });
      await completeSave(letter);
    } catch (error) {
      Alert.alert('Could not save letter', error?.message || String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bare scroll keyboard edges={{ top: false, bottom: true }} contentStyle={styles.screenContent}>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <View style={[styles.handle, { backgroundColor: theme.semantic.borderStrong }]} />
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Eyebrow>Letter to {family?.babyName || 'your little one'}</Eyebrow>
            <Title style={styles.heading}>write a letter</Title>
          </View>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close letter composer"
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: theme.semantic.cardAlt,
                borderColor: theme.semantic.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={19} color={theme.semantic.textSoft} />
          </Pressable>
        </View>

        <View style={styles.privacyLine}>
          <Ionicons name="lock-closed-outline" size={15} color={theme.semantic.secondary} />
          <Caption style={{ color: theme.semantic.textSoft }}>{privateCaption}</Caption>
        </View>

        {sourceLabel ? (
          <View style={[styles.sourceLine, { borderColor: theme.semantic.border }]}>
            <Ionicons name="link-outline" size={16} color={theme.semantic.primary} />
            <Caption>{sourceLabel}</Caption>
          </View>
        ) : null}

        <Field
          value={title}
          onChangeText={setTitle}
          placeholder="Give this letter a title (optional)"
          inputProps={{ returnKeyType: 'next', onSubmitEditing: () => bodyInputRef.current?.focus() }}
        />

        {!body.trim() ? (
          <View style={styles.starterSection}>
            <Caption style={styles.sectionLabel}>A place to begin</Caption>
            <View style={styles.starterRow}>
              {STARTERS.map((starter) => (
                <Pressable
                  key={starter.label}
                  onPress={() => applyStarter(starter)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.starterChip,
                    {
                      backgroundColor: theme.semantic.cardAlt,
                      borderColor: theme.semantic.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name={starter.icon} size={15} color={theme.semantic.primary} />
                  <Caption style={{ color: theme.semantic.textSoft }}>{starter.label}</Caption>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Field
          inputRef={bodyInputRef}
          as="textarea"
          value={body}
          onChangeText={setBody}
          placeholder="Tell them what this season felt like, what made you laugh, or what you hope they carry with them."
          inputStyle={styles.letterInput}
          inputProps={{ autoCorrect: true, spellCheck: true, keyboardType: 'default' }}
        />

        <View style={styles.toolsSection}>
          <View style={styles.sectionHeadingRow}>
            <View>
              <Title style={styles.sectionTitle}>Bring the moment with you</Title>
              <Caption>Words, voice, and the pieces of today belong together.</Caption>
            </View>
          </View>
          <BestPhotoRail
            photos={bestPhotos.photos}
            loading={bestPhotosLoading}
            selectedIds={new Set(assets.map(candidateId).filter(Boolean))}
            onToggle={toggleBestPhoto}
            onOpenPicker={pickMedia}
            title="Best recent photos"
            caption={letterPhotoCaption(bestPhotos)}
            pickerLabel="Open photo library"
          />
          <View style={styles.toolRow}>
            <ToolButton theme={theme} icon="camera-outline" label="Camera" onPress={captureMedia} />
            <ToolButton
              theme={theme}
              icon={recording ? 'stop' : 'mic-outline'}
              label={recording ? `${audioSeconds}s` : voice ? 'Redo voice' : 'Voice'}
              active={recording}
              busy={audioBusy}
              onPress={recording ? stopRecording : startRecording}
            />
            <ToolButton
              theme={theme}
              icon="text-outline"
              label={transcribing ? 'Listening…' : 'Transcript'}
              disabled={!voice?.uri || transcribing}
              busy={transcribing}
              onPress={addTranscript}
            />
          </View>
        </View>

        {assets.length ? (
          <View style={styles.attachmentSection}>
            <View style={styles.attachmentHeading}>
              <Caption style={styles.sectionLabel}>{assets.length} {assets.length === 1 ? 'keepsake' : 'keepsakes'}</Caption>
              <Pressable onPress={pickMedia} accessibilityRole="button">
                <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>Add more</Caption>
              </Pressable>
            </View>
            <View style={styles.mediaGrid}>
              {assets.map((asset, index) => (
                <View key={`${asset.uri}-${index}`} style={[styles.mediaTile, { backgroundColor: theme.semantic.cardAlt }]}>
                  {asset.type === 'video' ? (
                    <View style={styles.videoPreview}>
                      <Ionicons name="play-circle" size={34} color={theme.semantic.primary} />
                      <Caption>{formatDuration(asset.duration)}</Caption>
                    </View>
                  ) : (
                    <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  )}
                  <Pressable
                    onPress={() => setAssets((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove attachment ${index + 1}`}
                    style={[styles.removeMedia, { backgroundColor: theme.colors.scrimDeep }]}
                  >
                    <Ionicons name="close" size={14} color={theme.colors.onPrimary} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {voice?.uri ? (
          <View style={[styles.voiceCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <View style={[styles.voiceIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="mic" size={19} color={theme.semantic.primary} />
            </View>
            <View style={styles.voiceBody}>
              <Body style={styles.voiceTitle}>Your voice is part of this letter</Body>
              <Waveform values={voice.waveform} color={theme.semantic.primary} />
              <Caption>
                {formatSeconds(voice.durationSec)} · original recording kept privately
                {transcriptAdded ? ' · editable transcript added' : ''}
              </Caption>
            </View>
            <Pressable
              onPress={() => { setVoice(null); setTranscriptAdded(false); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove voice recording"
            >
              <Ionicons name="trash-outline" size={18} color={theme.semantic.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.openLine, { borderColor: theme.semantic.border }]}>
          <View style={[styles.openIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name="albums-outline" size={18} color={theme.semantic.primary} />
          </View>
          <View style={styles.openCopy}>
            <Body style={styles.openTitle}>Lives in your family world</Body>
            <Caption>Open anytime. Existing sealed letters still honor their chosen dates.</Caption>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={theme.semantic.secondary} />
        </View>

        <Button
          onPress={save}
          loading={saving}
          disabled={!canSave}
          icon={<Ionicons name="mail-outline" size={18} color={theme.colors.onPrimary} />}
          accessibilityHint="Saves the words and selected attachments to your private family world"
        >
          Save letter
        </Button>
        <Caption align="center">Nothing is shared outside your two family writers.</Caption>
      </View>
    </Screen>
  );
}

function ToolButton({ theme, icon, label, onPress, active = false, disabled = false, busy = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.toolButton,
        {
          backgroundColor: active ? theme.semantic.primary : theme.semantic.cardAlt,
          borderColor: active ? theme.semantic.primary : theme.semantic.border,
          opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={active ? theme.colors.onPrimary : theme.semantic.primary} />
      <Caption numberOfLines={1} style={{ color: active ? theme.colors.onPrimary : theme.semantic.textSoft, fontWeight: '700' }}>
        {label}
      </Caption>
    </Pressable>
  );
}

function Waveform({ values, color }) {
  return (
    <View style={styles.waveform}>
      {(values || []).map((value, index) => (
        <View
          key={`${index}-${value}`}
          style={[styles.waveBar, { height: 6 + Math.round(value * 18), backgroundColor: color, opacity: 0.35 + value * 0.5 }]}
        />
      ))}
    </View>
  );
}

function buildWaveform(seedSeconds) {
  const base = Math.max(1, Math.min(30, Number(seedSeconds || 8)));
  return Array.from({ length: 24 }, (_, index) => {
    const wave = Math.sin((index / 24) * Math.PI * 2.4 + base) * 0.35;
    const taper = index < 3 || index > 20 ? 0.65 : 1;
    return Math.max(0.18, Math.min(1, (0.52 + wave) * taper));
  });
}

function letterPhotoCaption(result) {
  if (result?.suppressedCount) {
    return `Showing the clearest distinct photos; ${result.suppressedCount} similar ${result.suppressedCount === 1 ? 'shot was' : 'shots were'} tucked away.`;
  }
  if (!result?.photos?.length) return 'Choose any photo or video from your native library.';
  return 'Clear, distinct photos first. Similar bursts stay out of the way.';
}

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sourceContextLabel({ sourceMomentId, sourceFirstId, sourceDigestWeekStart, source }) {
  if (sourceFirstId) return 'Started from a saved first.';
  if (sourceMomentId) return 'Started from a saved moment.';
  if (sourceDigestWeekStart) return 'Started from this weekly digest.';
  if (source === 'world' || source === 'book') return 'Started from Our World.';
  return null;
}

function formatDuration(milliseconds) {
  if (!milliseconds) return 'Video';
  return formatSeconds(Number(milliseconds) / 1000);
}

function formatSeconds(value) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1 },
  root: {
    gap: space.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: space.xs },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  headerCopy: { flex: 1 },
  heading: { fontSize: 36, lineHeight: 42, marginTop: 2 },
  closeButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  privacyLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sourceLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, paddingBottom: space.md },
  starterSection: { gap: space.sm },
  sectionLabel: { fontWeight: '700' },
  starterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  starterChip: { minHeight: 40, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  letterInput: { minHeight: 220, fontSize: 19, lineHeight: 29 },
  toolsSection: { gap: space.md, paddingTop: space.sm },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 23, lineHeight: 29 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  toolButton: { flexBasis: '47%', flexGrow: 1, minWidth: 0, height: 72, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  attachmentSection: { gap: space.sm },
  attachmentHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mediaTile: { width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden', ...shadow.whisper },
  videoPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  removeMedia: { position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voiceCard: { borderRadius: radius.md, borderWidth: 1, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  voiceIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  voiceBody: { flex: 1, gap: 3 },
  voiceTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  waveform: { height: 25, flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 3, borderRadius: radius.pill },
  openLine: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  openIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  openCopy: { flex: 1 },
  openTitle: { fontWeight: '700', fontSize: 15, lineHeight: 20 },
});
