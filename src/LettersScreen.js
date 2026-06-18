import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  SegmentedControl,
  Title,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { Family, relationshipTitle } from './families';
import { Letters } from './rituals';

export default function LettersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const theme = useTheme();
  const { family } = useFamily();
  const [letters, setLetters] = useState([]);
  const [members, setMembers] = useState({});
  const [tab, setTab] = useState(requestedTab === 'spouse' ? 'spouse' : 'child');

  useEffect(() => {
    if (requestedTab === 'spouse') setTab('spouse');
    if (requestedTab === 'child') setTab('child');
  }, [requestedTab]);

  const load = useCallback(async () => {
    if (!family?.id) return;
    const [letterRows, memberRows] = await Promise.all([
      Letters.list(family.id),
      Family.members(family.id).catch(() => []),
    ]);
    setLetters(letterRows);
    setMembers(Object.fromEntries(memberRows.map((m) => [m.userId, memberName(m)])));
  }, [family?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const childLetters = useMemo(() => letters.filter((letter) => letter.audience !== 'spouse'), [letters]);
  const spouseLetters = useMemo(() => letters.filter((letter) => letter.audience === 'spouse'), [letters]);

  const nudge = useMemo(() => {
    if (!childLetters.length) return 'Write the first one when the house is quiet.';
    const last = childLetters[0];
    const name = members[last.author_user_id] || 'Someone';
    return `${name} wrote last. Maybe the next one comes from the other parent.`;
  }, [childLetters, members]);

  return (
    <AppShell
      active="letters"
      title={tab === 'spouse' ? 'letters for us.' : "letters he'll open when he's eighteen."}
      subtitle={tab === 'spouse' ? 'for the two of you.' : family?.babyName ? `for ${family.babyName}, one day.` : 'for one day.'}
    >
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'spouse', label: 'For us' },
          { value: 'child', label: 'For baby' },
        ]}
      />

      {tab === 'spouse' ? (
        <>
          <Card variant="muted">
            <Eyebrow>For us</Eyebrow>
            <Title style={styles.heroTitle}>Small letters for the two of you.</Title>
            <Body>Leave something your spouse can read today.</Body>
            <Button
              size="md"
              fullWidth={false}
              style={styles.heroButton}
              onPress={() => router.push({ pathname: '/letter-compose', params: { audience: 'spouse' } })}
              icon={<Ionicons name="heart-outline" size={16} color={theme.colors.onPrimary} />}
            >
              Write to your spouse
            </Button>
          </Card>
          {spouseLetters.length ? spouseLetters.map((letter) => (
            <Pressable key={letter.id} onPress={() => router.push({ pathname: '/letter-detail', params: { id: letter.id } })}>
              <Card padding="md" style={styles.letterCard}>
                <View style={[styles.letterIcon, { backgroundColor: theme.colors.primarySoft }]}>
                  <Ionicons name="mail-open-outline" size={18} color={theme.semantic.primary} />
                </View>
                <View style={styles.letterBody}>
                  <Eyebrow>{formatDate(letter.created_at)}</Eyebrow>
                  <Title style={styles.letterTitle}>{letter.title || 'A note for us'}</Title>
                  <Caption>from {members[letter.author_user_id] || 'Family'}</Caption>
                </View>
              </Card>
            </Pressable>
          )) : (
            <Card variant="ghost">
              <Body>No notes for the two of you yet.</Body>
            </Card>
          )}
        </>
      ) : (
        <>
          <Card variant="muted">
            <Body style={[styles.script, { color: theme.semantic.primary }]}>
              {family?.babyName ? `for ${family.babyName}, one day` : 'for one day'}
            </Body>
            <Title style={styles.heroTitle}>Sealed in time.</Title>
            <Body>We open the next one on the eighteenth birthday, together.</Body>
            <Caption style={styles.nudge}>{nudge}</Caption>
            <Button
              size="md"
              fullWidth={false}
              style={styles.heroButton}
              onPress={() => router.push('/letter-compose')}
              icon={<Ionicons name="mail-outline" size={16} color={theme.colors.onPrimary} />}
            >
              Write a letter
            </Button>
          </Card>
          {childLetters.length ? childLetters.map((letter) => {
            const openable = isOpenable(letter.open_on);
            return (
              <Pressable key={letter.id} onPress={() => router.push({ pathname: '/letter-detail', params: { id: letter.id } })}>
                <Card padding="md" style={styles.letterCard}>
                  <View style={[styles.letterIcon, { backgroundColor: openable ? theme.colors.primarySoft : theme.semantic.cardAlt }]}>
                    <Ionicons name={openable ? 'mail-open-outline' : 'lock-closed-outline'} size={18} color={theme.semantic.primary} />
                  </View>
                  <View style={styles.letterBody}>
                    <Eyebrow>{openable ? 'Open now' : `Age ${ageLabel(letter.open_on, family?.babyBirthday)}`}</Eyebrow>
                    <Title style={styles.letterTitle}>{letter.title || 'Untitled letter'}</Title>
                    <Caption>from {members[letter.author_user_id] || 'Family'} · opens {formatDate(letter.open_on)}</Caption>
                  </View>
                </Card>
              </Pressable>
            );
          }) : (
            <Card variant="ghost">
              <Body>No letters sealed yet.</Body>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}

function memberName(member) {
  return member.displayName || relationshipTitle(member.relationshipLabel);
}

function isOpenable(openOn) {
  return new Date(`${openOn}T00:00:00`).getTime() <= Date.now();
}

function formatDate(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ageLabel(openOn, birthday) {
  if (!openOn || !birthday) return 'future';
  return Math.max(0, new Date(openOn).getFullYear() - new Date(birthday).getFullYear());
}

const styles = StyleSheet.create({
  script: {
    fontFamily: 'Caveat',
    fontSize: 22,
    lineHeight: 28,
  },
  heroTitle: {
    fontSize: 25,
    lineHeight: 31,
    marginVertical: space.sm,
  },
  nudge: {
    marginTop: space.md,
  },
  heroButton: {
    marginTop: space.lg,
  },
  letterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
  },
  letterIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  letterBody: {
    flex: 1,
  },
  letterTitle: {
    fontSize: 19,
    lineHeight: 23,
  },
});
