import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';

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
    () => letter && new Date(`${letter.open_on}T00:00:00`).getTime() <= Date.now(),
    [letter],
  );

  useEffect(() => {
    if (!letter || !openable || letter.opened_at) return;
    let alive = true;
    Letters.open(letter.id)
      .then((next) => {
        if (alive) setLetter(next);
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
    Alert.alert('Delete letter?', 'This sealed letter will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Letters.deleteOwn(letter.id);
          close();
        },
      },
    ]);
  };

  return (
    <Screen bare>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        {letter ? (
          <>
            <Eyebrow>{openable ? 'Open letter' : 'Sealed letter'}</Eyebrow>
            <Title style={styles.title}>{letter.title || 'Untitled letter'}</Title>
            <Caption>
              from {members[letter.author_user_id] || 'Family'} · opens {formatDate(letter.open_on)}
            </Caption>
            {openable ? (
              <Body style={styles.body}>{letter.body}</Body>
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

function formatDate(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeUntilLabel(openOn) {
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
  root: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  title: {
    marginTop: space.sm,
  },
  body: {
    marginTop: space.lg,
    marginBottom: space.xl,
  },
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
