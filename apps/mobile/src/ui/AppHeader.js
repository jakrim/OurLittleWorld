import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import BrandMark from './BrandMark';
import { Brand, Caption, Hero } from './Type';
import { radius, shadow, space, useTheme } from './theme';

export default function AppHeader({ title, subtitle, onBack, onSettings, onActivity, activityUnread = false, right }) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.brandRow}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[styles.iconButton, styles.backButton, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={theme.semantic.textSoft} />
          </Pressable>
        ) : (
          <View style={[styles.markFrame, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
            <BrandMark size={46} fillFrame />
          </View>
        )}
        <View style={styles.titleWrap}>
          <Brand numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.brand}>our little world</Brand>
          <Hero numberOfLines={1} maxFontSizeMultiplier={1.4} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.title}>
            {title}
          </Hero>
          {subtitle ? (
            <Caption numberOfLines={1} maxFontSizeMultiplier={1.4} adjustsFontSizeToFit minimumFontScale={0.75}>
              {subtitle}
            </Caption>
          ) : null}
        </View>
        {right}
        {onActivity ? (
          <Pressable
            onPress={onActivity}
            accessibilityRole="button"
            accessibilityLabel="Open activity"
            style={[styles.iconButton, styles.activityButton, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.semantic.textSoft} />
            {activityUnread ? <View style={[styles.unreadDot, { backgroundColor: theme.semantic.primary }]} /> : null}
          </Pressable>
        ) : null}
        <Pressable
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          style={[styles.iconButton, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
        >
          <Ionicons name="settings-outline" size={18} color={theme.semantic.textSoft} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markFrame: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
    overflow: 'hidden',
    ...shadow.whisper,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: space.sm,
  },
  brand: {
    fontSize: 12,
    lineHeight: 15,
    opacity: 0.75,
  },
  title: {
    fontSize: 25,
    lineHeight: 29,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.whisper,
  },
  backButton: {
    marginRight: space.md,
  },
  activityButton: {
    marginRight: space.sm,
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
