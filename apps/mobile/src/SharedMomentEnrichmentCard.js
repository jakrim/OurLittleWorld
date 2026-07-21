import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import {
  clearSharedAnnotationDraft,
  deleteSharedAnnotationVoiceDraft,
  persistSharedAnnotationVoiceDraft,
  readSharedAnnotationDraft,
  saveSharedAnnotationDraft,
} from './sharedAnnotationDraftStore';
import {
  ensureMomentTextAnnotation,
  ensureMomentVoiceAnnotation,
  removeMomentAnnotation,
} from './sharedEnrichment';
import { Body, Button, Caption, Card, Field, space } from './ui';

export default function SharedMomentEnrichmentCard({
  familyId,
  momentId,
  userId,
  canWrite,
  annotations = [],
  voiceNotes = [],
  membersById = {},
  theme,
  onSaved,
}) {
  const scope = useMemo(() => ({ familyId, momentId, userId }), [familyId, momentId, userId]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const recording = Boolean(recorderState.isRecording);

  useEffect(() => {
    let alive = true;
    if (!familyId || !momentId || !userId) return undefined;
    readSharedAnnotationDraft(scope).then((value) => {
      if (alive) setDraft(value);
    });
    return () => { alive = false; };
  }, [familyId, momentId, scope, userId]);

  const persist = useCallback(async (patch) => {
    const next = await saveSharedAnnotationDraft(scope, patch);
    setDraft(next);
    return next;
  }, [scope]);

  const changeText = (text) => {
    setDraft((current) => ({ ...(current || {}), text }));
    persist({ text, commitState: 'draft', lastErrorCode: null }).catch(() => {
      setNotice('This draft could not be stored yet. Keep this screen open and try again.');
    });
  };

  const startRecording = async () => {
    if (busy || audioBusy || !canWrite) return;
    setAudioBusy(true);
    setNotice('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to add your voice to this shared memory.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setNotice('Recording…');
    } catch {
      setNotice('Recording could not start. Try once more.');
    } finally {
      setAudioBusy(false);
    }
  };

  const stopRecording = useCallback(async ({ interrupted = false } = {}) => {
    if (!recorderState.isRecording || audioBusy || !draft) return;
    setAudioBusy(true);
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('No recording');
      const uri = await persistSharedAnnotationVoiceDraft({ sourceUri: recorder.uri, momentId });
      const durationSec = recorder.currentTime || ((recorderState.durationMillis || 0) / 1000);
      const previousUri = draft.voice?.uri;
      await persist({
        voice: {
          uri,
          durationSec,
          mimeType: 'audio/mp4',
          waveform: buildWaveform(durationSec || 8),
        },
        commitState: 'draft',
        lastErrorCode: null,
      });
      if (previousUri && previousUri !== uri) await deleteSharedAnnotationVoiceDraft(previousUri).catch(() => null);
      setNotice(interrupted ? 'Recording stopped in the background. Your draft is safe.' : 'Voice draft saved on this device.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      setNotice('That recording did not finish. Your text draft is still safe.');
    } finally {
      setAudioBusy(false);
    }
  }, [audioBusy, draft, momentId, persist, recorder, recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && recorderState.isRecording) stopRecording({ interrupted: true });
    });
    return () => subscription.remove();
  }, [recorderState.isRecording, stopRecording]);

  const removeVoiceDraft = async () => {
    if (!draft?.voice?.uri || busy || audioBusy) return;
    const uri = draft.voice.uri;
    await persist({ voice: null, commitState: 'draft', lastErrorCode: null });
    await deleteSharedAnnotationVoiceDraft(uri).catch(() => null);
    setNotice('Voice draft removed.');
  };

  const save = async () => {
    if (!draft || busy || recording || (!draft.text.trim() && !draft.voice?.uri)) return;
    setBusy(true);
    setNotice('Saving your words with your name…');
    await persist({ commitState: 'saving', lastErrorCode: null });
    try {
      if (draft.text.trim()) {
        await ensureMomentTextAnnotation({
          familyId,
          momentId,
          annotationId: draft.textAnnotationId,
          body: draft.text,
        });
      }
      if (draft.voice?.uri) {
        await ensureMomentVoiceAnnotation({
          familyId,
          momentId,
          annotationId: draft.voiceAnnotationId,
          voice: draft.voice,
          voiceNoteId: draft.voiceNoteId,
          voiceObjectId: draft.voiceObjectId,
        });
      }
      await clearSharedAnnotationDraft(scope);
      setDraft(await readSharedAnnotationDraft(scope));
      setNotice('Saved with your name.');
      await onSaved?.();
    } catch {
      await persist({ commitState: 'failed', lastErrorCode: 'save_failed' });
      setNotice('This did not finish. Your private draft is safe; retry the same save.');
    } finally {
      setBusy(false);
    }
  };

  const removeSaved = async (annotation) => {
    if (annotation.author_user_id !== userId || busy) return;
    setBusy(true);
    try {
      await removeMomentAnnotation({ familyId, momentId, annotation });
      await onSaved?.();
    } catch {
      setNotice('That contribution could not be removed yet.');
    } finally {
      setBusy(false);
    }
  };

  const voiceById = useMemo(
    () => Object.fromEntries((voiceNotes || []).map((voice) => [voice.id, voice])),
    [voiceNotes],
  );
  const hasDraft = Boolean(draft?.text.trim() || draft?.voice?.uri);

  return (
    <Card variant="muted" testID="shared-enrichment-card">
      <Caption>From the two of you</Caption>
      <Body style={styles.intro}>Each note stays with the parent who added it.</Body>
      {annotations.length ? (
        <View style={styles.annotationList}>
          {annotations.map((annotation) => (
            <View key={annotation.id} style={[styles.annotation, { borderTopColor: theme.semantic.border }]}>
              <View style={styles.annotationHeader}>
                <Caption style={{ color: theme.semantic.primary }}>
                  {annotation.author_user_id === userId
                    ? 'You'
                    : firstName(membersById[annotation.author_user_id]) || 'Your co-parent'}
                </Caption>
                {annotation.author_user_id === userId && canWrite ? (
                  <Pressable
                    onPress={() => removeSaved(annotation)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove your contribution"
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.semantic.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              {annotation.annotation_type === 'text' ? <Body>{annotation.body}</Body> : null}
              {annotation.annotation_type === 'voice' ? (
                <AnnotationVoicePlayer voice={voiceById[annotation.voice_note_id]} theme={theme} />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canWrite && draft ? (
        <View style={[styles.composer, { borderTopColor: theme.semantic.border }]}>
          <Field
            value={draft.text}
            onChangeText={changeText}
            placeholder="Add what you remember"
            caption="Private on this device until you save it."
            maxLength={1000}
            inputProps={{ editable: !busy, maxFontSizeMultiplier: 1.8 }}
            testID="shared-annotation-text"
          />
          {draft.voice?.uri ? <AnnotationVoicePlayer voice={draft.voice} theme={theme} local /> : null}
          <View style={styles.actions}>
            <Button
              variant={recording ? 'dark' : 'ghost'}
              size="sm"
              fullWidth={false}
              onPress={recording ? () => stopRecording() : startRecording}
              disabled={busy || audioBusy}
              testID={recording ? 'shared-voice-stop' : 'shared-voice-record'}
            >
              {recording ? 'Stop' : draft.voice ? 'Record again' : 'Add voice'}
            </Button>
            {draft.voice && !recording ? (
              <Button variant="ghost" size="sm" fullWidth={false} onPress={removeVoiceDraft} disabled={busy || audioBusy}>
                Remove voice
              </Button>
            ) : null}
            <Button size="sm" fullWidth={false} onPress={save} loading={busy} disabled={!hasDraft || recording} testID="shared-annotation-save">
              {draft.commitState === 'failed' ? 'Retry save' : 'Save to memory'}
            </Button>
          </View>
          {notice ? <Caption>{notice}</Caption> : null}
        </View>
      ) : null}
    </Card>
  );
}

function AnnotationVoicePlayer({ voice, theme, local = false }) {
  const uri = voice?.audioUrl || voice?.uri;
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  if (!uri) return <Caption>Voice note is still preparing.</Caption>;
  return (
    <Pressable
      onPress={() => (status.playing ? player.pause() : player.play())}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Pause voice contribution' : 'Play voice contribution'}
      style={[styles.voiceRow, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
    >
      <Ionicons name={status.playing ? 'pause' : 'play'} size={17} color={theme.semantic.primary} />
      <Body>{local ? 'Voice draft' : 'Voice note'} · {formatSeconds(status.duration || voice.duration_sec || voice.durationSec)}</Body>
    </Pressable>
  );
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function formatSeconds(value) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function buildWaveform(seconds) {
  const length = Math.max(12, Math.min(48, Math.round(Number(seconds || 8) * 2)));
  return Array.from({ length }, (_, index) => Number((0.22 + ((index * 7) % 11) / 16).toFixed(2)));
}

const styles = StyleSheet.create({
  intro: { marginTop: space.xs },
  annotationList: { marginTop: space.sm },
  annotation: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm, gap: space.xs },
  annotationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.md, paddingTop: space.md, gap: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: space.sm },
});
