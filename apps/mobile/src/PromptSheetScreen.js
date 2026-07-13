import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Body, Button, Caption, Field, Screen, Title, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { notifyPartnerPromptAnswered } from './notificationEvents';
import { PROMPT_STARTER_BUTTON_LABEL, promptStarterForToday } from './promptStarterModel';
import { DailyPrompts } from './rituals';
import { patchCachedPromptState, readCachedPromptState, readCachedSharedPhotos } from './useRitualHomeData';
import { createMomentWithMedia } from './moments';

export default function PromptSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const routePromptDate = useMemo(() => promptDateParam(params.promptDate), [params.promptDate]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [value, setValue] = useState('');
  const [promptText, setPromptText] = useState('');
  const [activePromptDate, setActivePromptDate] = useState(null);
  const [starter, setStarter] = useState('');
  const [voice, setVoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/timeline');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (family?.id) {
        if (!routePromptDate) {
          readCachedPromptState({ familyId: family.id, userId: user?.id })
            .then((cached) => {
              if (alive && cached?.mine?.response_text) setValue(cached.mine.response_text);
            })
            .catch(() => {});
        }
        DailyPrompts.getForDate({
          familyId: family.id,
          babyBirthday: family.babyBirthday,
          promptDate: routePromptDate,
        })
          .then((state) => {
            if (!alive) return;
            setPromptText(state?.prompt?.text || '');
            setActivePromptDate(state?.promptDate || routePromptDate || null);
            setValue(state?.mine?.response_text || '');
          })
          .catch(() => {});
        // V1: starter from what was actually saved today (cached archive rows).
        if (!routePromptDate) {
          readCachedSharedPhotos({ familyId: family.id, userId: user?.id })
            .then((photos) => {
              if (alive) setStarter(promptStarterForToday({ sharedPhotos: photos }));
            })
            .catch(() => {});
        } else {
          setStarter('');
        }
      }
      return () => {
        alive = false;
      };
    }, [family?.babyBirthday, family?.id, routePromptDate, user?.id]),
  );

  const startRecording = async () => {
    setAudioBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to answer with a voice note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
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
      if (!recorder.uri) throw new Error('Recording did not produce an audio file');
      const durationSec = recorder.currentTime || (recorderState.durationMillis ? recorderState.durationMillis / 1000 : null);
      setVoice({
        uri: recorder.uri,
        durationSec,
        mimeType: 'audio/mp4',
        waveform: buildWaveform(durationSec || 8),
      });
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (err) {
      Alert.alert('Could not save recording', err?.message || String(err));
    } finally {
      setAudioBusy(false);
    }
  };

  const save = async () => {
    if (!family?.id || (!value.trim() && !voice?.uri)) return;
    setSaving(true);
    try {
      const promptDate = activePromptDate || routePromptDate || null;
      let momentId = null;
      if (voice?.uri) {
        const moment = await createMomentWithMedia({
          familyId: family.id,
          title: promptMomentTitle(promptDate),
          note: value.trim() || promptText,
          tags: ['prompt'],
          voice,
        });
        momentId = moment.id;
      }
      const row = await DailyPrompts.saveResponse({
        familyId: family.id,
        responseText: value,
        momentId,
        babyBirthday: family.babyBirthday,
        promptDate,
      });
      notifyPartnerPromptAnswered({
        familyId: family.id,
        actorUserId: user?.id,
        promptDate: row?.prompt_date,
      }).catch((err) => console.warn('notify partner prompt answer', err?.message));
      await patchCachedPromptState({ familyId: family.id, userId: user?.id, promptRow: row });
      close();
    } catch (err) {
      Alert.alert('Could not save', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const recording = !!recorderState.isRecording;
  const audioSeconds = recording
    ? Math.round((recorderState.durationMillis || 0) / 1000)
    : Math.round(voice?.durationSec || 0);

  return (
    <Screen bare>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <Title>{routePromptDate ? 'catch-up note' : "today's note"}</Title>
        {routePromptDate ? <Caption style={styles.promptDate}>From {formatPromptDateLabel(routePromptDate)}</Caption> : null}
        {promptText ? <Body style={styles.prompt}>{promptText}</Body> : null}
        <Field
          as="textarea"
          value={value}
          onChangeText={setValue}
          placeholder="A few lines are enough."
          caption="Answer in text, voice, or both."
          autoFocus
        />
        {starter && !value.trim() ? (
          <Button
            size="sm"
            fullWidth={false}
            variant="ghost"
            onPress={() => setValue(starter)}
            accessibilityLabel={PROMPT_STARTER_BUTTON_LABEL}
          >
            {PROMPT_STARTER_BUTTON_LABEL}
          </Button>
        ) : null}
        <View style={[styles.voiceCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <Ionicons name="mic-outline" size={18} color={theme.semantic.primary} />
          <View style={styles.voiceText}>
            <Caption>{recording ? `Recording ${audioSeconds}s` : voice ? `Voice note ${audioSeconds}s` : 'Voice answer'}</Caption>
            {voice ? <Waveform values={voice.waveform} color={theme.semantic.primary} /> : null}
          </View>
          {voice ? (
            <Pressable onPress={() => setVoice(null)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={theme.semantic.textMuted} />
            </Pressable>
          ) : (
            <Button
              size="sm"
              fullWidth={false}
              variant={recording ? 'dark' : 'ghost'}
              loading={audioBusy}
              onPress={recording ? stopRecording : startRecording}
            >
              {recording ? 'Stop' : 'Record'}
            </Button>
          )}
        </View>
        <View style={styles.actions}>
          <Button variant="ghost" size="md" fullWidth={false} onPress={close}>Cancel</Button>
          <Button size="md" fullWidth={false} onPress={save} loading={saving} disabled={!value.trim() && !voice?.uri}>Save</Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  prompt: {
    marginTop: -space.sm,
  },
  promptDate: {
    marginTop: -space.md,
  },
  voiceCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  voiceText: {
    flex: 1,
  },
  waveform: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
});

function promptDateParam(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const date = String(raw || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function promptMomentTitle(promptDate) {
  if (!promptDate || promptDate === localIsoDate()) return "Today's prompt";
  return `Prompt from ${formatPromptDateLabel(promptDate)}`;
}

function formatPromptDateLabel(promptDate) {
  const value = new Date(`${promptDate}T12:00:00`);
  if (Number.isNaN(value.getTime())) return promptDate;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
}

function localIsoDate(date = new Date()) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildWaveform(seedSeconds) {
  const base = Math.max(1, Math.min(30, Number(seedSeconds || 8)));
  return Array.from({ length: 22 }, (_, i) => {
    const wave = Math.sin((i / 22) * Math.PI * 2.2 + base) * 0.35;
    return Math.max(0.18, Math.min(1, 0.5 + wave));
  });
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
              height: 7 + Math.round(value * 18),
              backgroundColor: color,
              opacity: 0.35 + value * 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}
