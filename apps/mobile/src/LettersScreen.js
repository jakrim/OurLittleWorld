import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
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
  const theme = useTheme();
  const { family } = useFamily();
  const [letters, setLetters] = useState([]);
  const [members, setMembers] = useState({});
  const goBackToWorld = useCallback(() => {
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    router.push('/library');
  }, [router]);

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

  const childLetters = useMemo(() => letters, [letters]);

  const openLetter = (letter) => {
    const openable = isOpenable(letter.open_on);
    if (!openable) {
      Alert.alert(
        'Still sealed',
        `This letter opens ${formatDate(letter.open_on)}. ${timeUntilLabel(letter.open_on)} left.`,
        [{ text: 'Keep sealed' }],
      );
      return;
    }
    router.push({ pathname: '/letter-detail', params: { id: letter.id } });
  };

  const nudge = useMemo(() => {
    if (!childLetters.length) return 'Write the first one when the house is quiet.';
    const last = childLetters[0];
    const name = members[last.author_user_id] || 'Someone';
    return `${name} wrote last. Maybe the next one comes from the other parent.`;
  }, [childLetters, members]);

  return (
    <AppShell
      active="world"
      title="letters for later."
      subtitle={family?.babyName ? `for ${family.babyName}, kept close.` : 'kept with your family story.'}
      onBack={goBackToWorld}
    >
      <Card variant="muted">
        <Body style={[styles.script, { color: theme.semantic.primary }]}>
          {family?.babyName ? `for ${family.babyName}` : 'for your child'}
        </Body>
        <Title style={styles.heroTitle}>
          {family?.babyName ? `Letters to ${family.babyName}, kept as long as you need.` : 'Letters kept as long as you need.'}
        </Title>
        <Body>Write the words you want kept with the rest of your private family story.</Body>
        <Caption style={styles.nudge}>{nudge}</Caption>
      </Card>
      {childLetters.length ? childLetters.map((letter) => {
        const openable = isOpenable(letter.open_on);
        const preview = openable ? firstLine(letter.body) : null;
        return (
          <Pressable
            key={letter.id}
            onPress={() => openLetter(letter)}
            accessibilityRole="button"
            accessibilityLabel={openable ? `Open letter: ${letter.title || 'Untitled letter'}` : `Sealed letter: ${letter.title || 'Untitled letter'}`}
            accessibilityHint={!openable ? `Opens ${formatDate(letter.open_on)}.` : 'Opens the saved letter.'}
          >
            <Card padding="md" style={styles.letterCard}>
              <View style={[styles.letterIcon, !openable && styles.sealIcon, { backgroundColor: openable ? theme.colors.primarySoft : theme.semantic.cardAlt }]}>
                <Ionicons name={openable ? 'mail-open-outline' : 'lock-closed-outline'} size={18} color={theme.semantic.primary} />
              </View>
              <View style={styles.letterBody}>
                <Eyebrow>{openable ? 'Open letter' : `sealed - ${timeUntilLabel(letter.open_on)}`}</Eyebrow>
                <Title style={styles.letterTitle}>{letter.title || 'Untitled letter'}</Title>
                <Caption>{letterDateCaption(letter, members[letter.author_user_id] || 'Family')}</Caption>
                {preview ? <Caption numberOfLines={2}>{preview}</Caption> : null}
              </View>
            </Card>
          </Pressable>
        );
      }) : (
        <LetterEmptyState
          babyName={family?.babyName}
          theme={theme}
          onPress={() => router.push('/letter-compose')}
        />
      )}
      {childLetters.length ? (
        <Card variant="ghost" style={styles.footerPrompt}>
          <View style={[styles.footerSeal, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name="mail-outline" size={18} color={theme.semantic.primary} />
          </View>
          <View style={styles.letterBody}>
            <Title style={styles.letterTitle}>Write another letter for their world.</Title>
            <Caption>One small note today can stay with the family story.</Caption>
          </View>
          <Pressable
            onPress={() => router.push('/letter-compose')}
            accessibilityRole="button"
            accessibilityLabel="Write another letter"
            style={[styles.footerAdd, { backgroundColor: theme.semantic.primary }]}
          >
            <Ionicons name="add" size={17} color={theme.colors.onPrimary} />
          </Pressable>
        </Card>
      ) : null}
    </AppShell>
  );
}

function LetterEmptyState({ babyName, theme, onPress }) {
  const title = babyName
    ? `Write the first letter for ${babyName}.`
    : 'Write the first letter for later.';
  return (
    <Card variant="muted" style={styles.emptyLetter}>
      <View style={[styles.emptyLetterIcon, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name="mail-outline" size={19} color={theme.semantic.primary} />
      </View>
      <View style={styles.letterBody}>
        <Eyebrow>First letter</Eyebrow>
        <Title style={styles.emptyLetterTitle}>{title}</Title>
        <Body>One detail, one hope, or one ordinary thing you do not want to lose is enough.</Body>
        <Button
          size="md"
          fullWidth={false}
          style={styles.emptyLetterButton}
          onPress={onPress}
          icon={<Ionicons name="create-outline" size={16} color={theme.colors.onPrimary} />}
        >
          Write the first letter
        </Button>
      </View>
    </Card>
  );
}

function memberName(member) {
  return member.displayName || relationshipTitle(member.relationshipLabel);
}

function isOpenable(openOn) {
  if (!openOn) return true;
  return new Date(`${openOn}T00:00:00`).getTime() <= Date.now();
}

function formatDate(value) {
  if (!value) return 'open anytime';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function letterDateCaption(letter, author) {
  if (!letter?.open_on) return `from ${author} · open anytime`;
  const label = isOpenable(letter.open_on) ? 'opened' : 'opens';
  return `from ${author} · ${label} ${formatDate(letter.open_on)}`;
}

function firstLine(value) {
  return String(value || '').split(/\n+/).map((line) => line.trim()).find(Boolean) || '';
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
  sealIcon: {
    borderRadius: 21,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  letterBody: {
    flex: 1,
  },
  letterTitle: {
    fontSize: 19,
    lineHeight: 23,
  },
  footerPrompt: {
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerSeal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  footerAdd: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.md,
  },
  emptyLetter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  emptyLetterIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  emptyLetterTitle: {
    fontSize: 20,
    lineHeight: 25,
    marginVertical: space.xs,
  },
  emptyLetterButton: {
    marginTop: space.lg,
  },
});
