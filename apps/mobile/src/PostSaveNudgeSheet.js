// Post-save assistant follow-up sheet (C2, X1). One question after a save —
// never a takeover the parent can't quietly dismiss. Extracted from
// AddSheetScreen so first-compose can offer the letter nudge too.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Body, Button, Caption, Screen, Title, space } from './ui';

export default function PostSaveNudgeSheet({ nudge, theme, onDismiss, onAction, savedLabel = 'Moment saved' }) {
  return (
    <Screen bare>
      <View style={[styles.followupRoot, { backgroundColor: theme.semantic.card }]}>
        <View style={[styles.followupHandle, { backgroundColor: theme.semantic.border }]} />
        <View style={[styles.followupIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name={iconForNudge(nudge.kind)} size={22} color={theme.semantic.primary} />
        </View>
        <Caption>{savedLabel}</Caption>
        <Title style={styles.followupTitle}>{nudge.question}</Title>
        <Body style={styles.followupBody}>
          {bodyForNudge(nudge.kind)}
        </Body>
        <View style={styles.followupActions}>
          <Button fullWidth={false} onPress={onAction}>
            {nudge.actionLabel}
          </Button>
          <Button variant="quiet" fullWidth={false} onPress={onDismiss}>
            Not now
          </Button>
        </View>
      </View>
    </Screen>
  );
}

function iconForNudge(kind) {
  if (kind === 'first') return 'flag-outline';
  if (kind === 'letter') return 'mail-outline';
  if (kind === 'book-ready') return 'book-outline';
  return 'mic-outline';
}

function bodyForNudge(kind) {
  if (kind === 'first') return 'This can link the moment to the family firsts timeline.';
  if (kind === 'letter') return 'A single line is enough; the date and age are already started.';
  if (kind === 'book-ready') return 'A short parent-written line can make this moment easier to place in the baby book.';
  return 'Open the moment now so the voice can stay close to the photos.';
}

const styles = StyleSheet.create({
  followupRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  followupHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    marginBottom: space.lg,
  },
  followupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  followupBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  followupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
});
