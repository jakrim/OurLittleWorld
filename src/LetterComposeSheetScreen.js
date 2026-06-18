import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import BirthDatePicker from './ui/BirthDatePicker';
import { Body, Button, Caption, Field, Screen, Title, radius, shadow, space, useTheme } from './ui';
import { useFamily } from './FamilyContext';
import { addYearsToIsoDate, Letters } from './rituals';

const SPOUSE_STARTERS = [
  { key: 'blank', label: 'Blank', text: '' },
  { key: 'thank-you', label: 'Thank you for', text: 'Thank you for ' },
  { key: 'noticed', label: 'I noticed', text: 'I noticed ' },
  { key: 'missed', label: 'I missed', text: 'I missed ' },
  { key: 'proud', label: "I'm proud of us for", text: "I'm proud of us for " },
  { key: 'help', label: 'I could use help with', text: 'I could use help with ' },
  { key: 'loved', label: 'One thing I loved today', text: 'One thing I loved today ' },
];

export default function LetterComposeSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family } = useFamily();
  const bodyInputRef = useRef(null);
  const requestedAudience = Array.isArray(params.audience) ? params.audience[0] : params.audience;
  const audience = requestedAudience === 'spouse' ? 'spouse' : 'child';
  const spouseMode = audience === 'spouse';
  const defaultOpenOn = addYearsToIsoDate(family?.babyBirthday, 18);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [openOn, setOpenOn] = useState(defaultOpenOn);
  const [starterKey, setStarterKey] = useState(spouseMode ? 'blank' : null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace(spouseMode ? { pathname: '/letters', params: { tab: 'spouse' } } : '/letters');
  };

  useEffect(() => {
    setOpenOn(defaultOpenOn);
  }, [defaultOpenOn]);

  useEffect(() => {
    setStarterKey(spouseMode ? 'blank' : null);
  }, [spouseMode]);

  const chooseStarter = (starter) => {
    setStarterKey(starter.key);
    setBody((current) => replaceStarterPrefix(current, starter.text));
    setTimeout(() => bodyInputRef.current?.focus?.(), 0);
  };

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await Letters.create({ familyId: family?.id, title, body, openOn, audience, starterKey });
      if (spouseMode) {
        router.replace({ pathname: '/letters', params: { tab: 'spouse' } });
      } else {
        close();
      }
    } catch (err) {
      Alert.alert(spouseMode ? 'Could not save note' : 'Could not seal letter', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bare scroll keyboard edges={{ top: false, bottom: true }} contentStyle={styles.screenContent}>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <Title>{spouseMode ? 'write to your spouse' : 'write a letter'}</Title>
        {spouseMode ? <Body>A small note they can read today.</Body> : null}
        <Field value={title} onChangeText={setTitle} placeholder="Title, optional" />
        {spouseMode ? (
          <View>
            <Caption>Choose a start</Caption>
            <View style={styles.starterGrid}>
              {SPOUSE_STARTERS.map((starter) => {
                const active = starter.key === starterKey;
                return (
                  <Pressable
                    key={starter.key}
                    onPress={() => chooseStarter(starter)}
                    style={[
                      styles.starterChip,
                      {
                        backgroundColor: active ? theme.colors.primarySoft : theme.semantic.cardAlt,
                        borderColor: active ? theme.semantic.primary : theme.semantic.border,
                      },
                    ]}
                  >
                    <Caption style={{ color: active ? theme.semantic.primary : theme.semantic.textSoft, fontWeight: active ? '700' : '600' }}>
                      {starter.label}
                    </Caption>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <Field
          inputRef={bodyInputRef}
          as="textarea"
          value={body}
          onChangeText={setBody}
          placeholder={spouseMode ? 'A few honest lines are enough.' : 'Start with what you want them to know.'}
          inputProps={{
            autoCorrect: true,
            spellCheck: true,
            keyboardType: 'default',
          }}
        />
        {spouseMode ? null : <BirthDatePicker value={openOn} onChange={setOpenOn} caption={null} />}
        <View style={styles.actionRow}>
          <Button variant="ghost" size="md" fullWidth={false} onPress={close}>Cancel</Button>
          <Button size="md" fullWidth={false} onPress={save} loading={saving} disabled={!body.trim()}>
            {spouseMode ? 'Save note' : 'Seal letter'}
          </Button>
        </View>
      </View>
    </Screen>
  );
}

function replaceStarterPrefix(value, nextStarterText) {
  const current = value || '';
  const matched = SPOUSE_STARTERS
    .filter((starter) => starter.text)
    .find((starter) => current.startsWith(starter.text));
  if (!matched) return current.trim() ? current : nextStarterText;
  return `${nextStarterText}${current.slice(matched.text.length)}`;
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
  starterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  starterChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    ...shadow.whisper,
  },
});
