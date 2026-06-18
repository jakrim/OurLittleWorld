import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Body, Caption, Screen, Title, radius, shadow, space, useTheme } from './ui';

const ACTIONS = [
  { icon: 'chatbubble-ellipses-outline', title: "Answer today's prompt", caption: 'Add one small note for today.', route: '/prompt' },
  { icon: 'flag-outline', title: 'Add a first', caption: 'Save a milestone, tiny or huge.', route: '/first-compose' },
  { icon: 'heart-outline', title: 'Write to your spouse', caption: 'Leave a note for the two of you.', route: '/letter-compose', params: { audience: 'spouse' } },
  { icon: 'mail-outline', title: 'Write a letter', caption: 'Seal something for later.', route: '/letter-compose' },
  { icon: 'images-outline', title: 'Add photos', caption: 'Browse and tag from your library.', route: '/library' },
  { icon: 'sparkles-outline', title: 'Scan library', caption: 'Find more moments automatically.', route: '/reference' },
];

export default function AddSheetScreen() {
  const router = useRouter();
  const theme = useTheme();

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/timeline');
  }, [router]);

  const openAction = useCallback((action) => {
    const destination = action.params
      ? { pathname: action.route, params: action.params }
      : action.route;

    if (router.canGoBack()) {
      router.replace(destination);
      return;
    }

    router.replace('/timeline');
    requestAnimationFrame(() => {
      router.push(destination);
    });
  }, [router]);

  return (
    <Screen bare>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <View style={styles.header}>
          <Title style={styles.title}>what are we saving?</Title>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close add menu"
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: theme.semantic.cardAlt,
                borderColor: theme.semantic.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={18} color={theme.semantic.textSoft} />
          </Pressable>
        </View>
        <View style={styles.actions}>
          {ACTIONS.map((action) => (
            <Pressable
              key={action.title}
              android_ripple={{ color: theme.colors.primarySoft }}
              style={({ pressed }) => [
                styles.action,
                {
                  borderColor: theme.semantic.border,
                  backgroundColor: theme.semantic.cardAlt,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
              onPress={() => openAction(action)}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
                <Ionicons name={action.icon} size={18} color={theme.semantic.primary} />
              </View>
              <View style={styles.actionText}>
                <Body style={styles.actionTitle}>{action.title}</Body>
                <Caption>{action.caption}</Caption>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.semantic.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: {
    flex: 1,
    fontSize: 25,
    lineHeight: 30,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: space.md,
    gap: space.sm,
  },
  action: {
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    ...shadow.whisper,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    lineHeight: 19,
    color: undefined,
  },
});
