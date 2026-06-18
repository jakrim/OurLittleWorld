import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';

import { Body, Button, Caption, Eyebrow, Screen, Title, space, useTheme } from './ui';
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
    () => letter && (letter.audience === 'spouse' || new Date(`${letter.open_on}T00:00:00`).getTime() <= Date.now()),
    [letter],
  );

  useEffect(() => {
    if (!letter || letter.audience === 'spouse' || !openable || letter.opened_at) return;
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
            <Eyebrow>{letter.audience === 'spouse' ? 'For us' : openable ? 'Open letter' : 'Sealed letter'}</Eyebrow>
            <Title style={styles.title}>{letter.title || (letter.audience === 'spouse' ? 'A note for us' : 'Untitled letter')}</Title>
            <Caption>
              from {members[letter.author_user_id] || 'Family'}
              {letter.audience === 'spouse' ? ` · ${formatDate(letter.created_at)}` : ` · opens ${formatDate(letter.open_on)}`}
            </Caption>
            <Body style={styles.body}>
              {openable ? letter.body : 'This one stays sealed until the date you chose.'}
            </Body>
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
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
});
