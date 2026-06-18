import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';

import { Body, Button, Field, Screen, Title, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { DailyPrompts } from './rituals';
import { patchCachedPromptState, readCachedPromptState } from './useRitualHomeData';

export default function PromptSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [promptText, setPromptText] = useState('');
  const [saving, setSaving] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/timeline');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (family?.id) {
        readCachedPromptState({ familyId: family.id, userId: user?.id })
          .then((cached) => {
            if (alive && cached?.mine?.response_text) setValue(cached.mine.response_text);
          })
          .catch(() => {});
        DailyPrompts.getToday({ familyId: family.id })
          .then((state) => {
            if (!alive) return;
            setPromptText(state?.prompt?.text || '');
            setValue(state?.mine?.response_text || '');
          })
          .catch(() => {});
      }
      return () => {
        alive = false;
      };
    }, [family?.id, user?.id]),
  );

  const save = async () => {
    if (!family?.id || !value.trim()) return;
    setSaving(true);
    try {
      const row = await DailyPrompts.saveResponse({ familyId: family.id, responseText: value });
      await patchCachedPromptState({ familyId: family.id, userId: user?.id, promptRow: row });
      close();
    } catch (err) {
      Alert.alert('Could not save', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bare>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <Title>today's note</Title>
        {promptText ? <Body style={styles.prompt}>{promptText}</Body> : null}
        <Field
          as="textarea"
          value={value}
          onChangeText={setValue}
          placeholder="A few lines are enough."
          autoFocus
        />
        <View style={styles.actions}>
          <Button variant="ghost" size="md" fullWidth={false} onPress={close}>Cancel</Button>
          <Button size="md" fullWidth={false} onPress={save} loading={saving} disabled={!value.trim()}>Save</Button>
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
});
