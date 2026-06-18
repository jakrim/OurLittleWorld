import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';

import {
  Body,
  Caption,
  Eyebrow,
  Screen,
  Title,
  palettes,
  PALETTE_NAMES,
  radius,
  shadow,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';

const THEME_MODE_OPTIONS = [
  { value: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function SettingsMenuSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();

  const setMode = (mode) => {
    Haptics.selectionAsync();
    theme.setMode(mode);
  };

  const setPalette = (paletteName) => {
    Haptics.selectionAsync();
    theme.setPaletteName(paletteName);
  };

  const go = (route) => {
    Haptics.selectionAsync();
    router.replace(route);
  };

  return (
    <Screen bare>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={[styles.root, { backgroundColor: theme.semantic.card }]}
        contentContainerStyle={styles.content}
      >
        <Eyebrow>Menu</Eyebrow>
        <Title style={styles.title}>settings and home feel.</Title>

        <View style={[styles.themePanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <View style={styles.themePanelHeader}>
            <View>
              <Eyebrow>Theme</Eyebrow>
              <Caption style={styles.themeCaption}>
                {theme.paletteLabel} · {theme.mode === 'system' ? `Auto (${theme.scheme})` : theme.mode}
              </Caption>
            </View>
            <View style={[styles.themePreview, { backgroundColor: theme.colors.bg, borderColor: theme.colors.border }]}>
              <View style={[styles.themePreviewDot, { backgroundColor: theme.colors.primary }]} />
              <View style={[styles.themePreviewDot, { backgroundColor: theme.colors.accent }]} />
            </View>
          </View>

          <View style={styles.themeModeRow}>
            {THEME_MODE_OPTIONS.map((option) => {
              const active = theme.mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMode(option.value)}
                  android_ripple={{ color: theme.colors.primarySoft }}
                  style={[
                    styles.themeModeButton,
                    {
                      backgroundColor: active ? theme.semantic.primary : theme.semantic.card,
                      borderColor: active ? theme.semantic.primary : theme.semantic.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={14}
                    color={active ? theme.colors.onPrimary : theme.semantic.textSoft}
                  />
                  <Caption
                    style={[
                      styles.themeModeText,
                      { color: active ? theme.colors.onPrimary : theme.semantic.textSoft },
                    ]}
                  >
                    {option.label}
                  </Caption>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.paletteQuickRow}>
            {PALETTE_NAMES.map((name) => {
              const meta = palettes[name];
              const slots = meta[theme.scheme];
              const active = theme.paletteName === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => setPalette(name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${meta.label} palette`}
                  style={[
                    styles.paletteQuickButton,
                    {
                      backgroundColor: slots.bg,
                      borderColor: active ? slots.primary : theme.semantic.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.paletteQuickSwatches}>
                    <View style={[styles.paletteQuickSwatch, { backgroundColor: slots.primary }]} />
                    <View style={[styles.paletteQuickSwatch, { backgroundColor: slots.accent }]} />
                  </View>
                  {active ? <Ionicons name="checkmark" size={13} color={slots.ink} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Eyebrow>Settings</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="person-circle-outline"
              label={`${family?.babyName || 'Child'} profile`}
              detail="Name, birthday, photo access"
              onPress={() => go('/setup')}
            />
            <MenuItem
              icon="person-add-outline"
              label="Invite family"
              detail="Bring a co-parent into this world"
              onPress={() => go('/invite')}
            />
            <MenuItem
              icon="sparkles"
              label="Find more photos"
              detail="Reference photo and library scan"
              tint={theme.semantic.primary}
              onPress={() => go('/reference')}
            />
            <MenuItem
              icon="shield-checkmark-outline"
              label="Privacy"
              detail="Shared with your family only"
              onPress={() => go('/setup')}
            />
          </View>
        </View>

        <View>
          <Eyebrow>Rituals</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="sparkles-outline"
              label="Daily memory prompt"
              detail="Write today's small note"
              onPress={() => go('/prompt')}
            />
            <MenuItem
              icon="calendar-outline"
              label="Weekly digest"
              detail="Sunday summary from photos and notes"
              onPress={() => go('/timeline')}
            />
            <MenuItem
              icon="mail-outline"
              label="Time capsules"
              detail="Letters sealed for later"
              onPress={() => go('/letters')}
            />
          </View>
        </View>

        <View>
          <Eyebrow>The Archive</Eyebrow>
          <View style={styles.menuList}>
            <MenuItem
              icon="book-outline"
              label="Library"
              detail="Photos, places, and search"
              onPress={() => go('/library')}
            />
            <MenuItem
              icon="download-outline"
              label="Export to photo book"
              detail="A future handoff surface"
              onPress={() => go('/library')}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function MenuItem({ icon, label, detail, onPress, tint }) {
  const theme = useTheme();
  const iconColor = tint || theme.semantic.textSoft;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [
        styles.menuItem,
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View style={[styles.menuItemIcon, { backgroundColor: theme.semantic.cardAlt }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.menuItemText}>
        <Body style={styles.menuItemLabel}>{label}</Body>
        <Caption>{detail}</Caption>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.semantic.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
  },
  themePanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
  },
  themePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  themeCaption: {
    marginTop: 2,
    textTransform: 'capitalize',
    letterSpacing: 0,
  },
  themePreview: {
    width: 48,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  themePreviewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  themeModeRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  themeModeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  themeModeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'none',
    letterSpacing: 0,
  },
  paletteQuickRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  paletteQuickButton: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteQuickSwatches: {
    flexDirection: 'row',
    gap: 3,
  },
  paletteQuickSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  menuList: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.whisper,
  },
  menuItem: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    gap: space.md,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
  },
  menuItemLabel: {
    color: undefined,
    fontSize: 14,
    lineHeight: 19,
  },
});
