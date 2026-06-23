import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Caption, Field, Screen, Title, radius, space, useTheme } from './ui';
import { useFamily } from './FamilyContext';
import { addYearsToIsoDate, Letters } from './rituals';

export default function LetterComposeSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const bodyInputRef = useRef(null);
  const defaultOpenOn = addYearsToIsoDate(family?.babyBirthday, 18);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/letters');
  };

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await Letters.create({ familyId: family?.id, title, body, openOn: defaultOpenOn });
      close();
    } catch (err) {
      Alert.alert('Could not seal letter', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bare scroll keyboard edges={{ top: false, bottom: true }} contentStyle={styles.screenContent}>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <Title>write a letter</Title>
        <Body>A few honest lines for the eighteenth birthday are enough.</Body>
        <Field value={title} onChangeText={setTitle} placeholder="Title, optional" />
        <Field
          inputRef={bodyInputRef}
          as="textarea"
          value={body}
          onChangeText={setBody}
          placeholder="Start with what you want them to know."
          inputProps={{
            autoCorrect: true,
            spellCheck: true,
            keyboardType: 'default',
          }}
        />
        <View style={[styles.openDateCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <Caption>Sealed until</Caption>
          <Title style={styles.openDateTitle}>{formatOpenDate(defaultOpenOn)}</Title>
          <Body style={styles.openDateBody}>
            Letters open on the eighteenth birthday, matching the family ritual.
          </Body>
        </View>
        <View style={styles.actionRow}>
          <Button variant="ghost" size="md" fullWidth={false} onPress={close}>Cancel</Button>
          <Button size="md" fullWidth={false} onPress={save} loading={saving} disabled={!body.trim()}>
            Seal letter
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
  },
  root: {
    gap: space.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  openDateCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: 4,
  },
  openDateTitle: {
    fontSize: 21,
    lineHeight: 26,
  },
  openDateBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});

function formatOpenDate(value) {
  if (!value) return 'Their eighteenth birthday';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
