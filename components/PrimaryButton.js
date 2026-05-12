import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { palette, radii, shadow, spacing, text } from '../constants/theme';

/**
 * Modern, soft-shadow CTA used across the new Our Little World screens. Keeps
 * the playful display font but trades the legacy heavy padding for a
 * cleaner pill shape. `variant` chooses the colour treatment.
 */
export default function PrimaryButton({
  children,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
}) {
  const palettes = {
    primary: { bg: palette.primary, fg: palette.cream },
    accent: { bg: palette.accent, fg: palette.cream },
    soft: { bg: palette.blush, fg: palette.plum },
    ghost: { bg: 'transparent', fg: palette.primary, border: palette.primary },
  };
  const p = palettes[variant] || palettes.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: p.bg,
          borderColor: p.border || 'transparent',
          borderWidth: p.border ? 1.5 : 0,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text style={[styles.label, { color: p.fg }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    ...text.title,
    fontSize: 22,
    color: palette.cream,
  },
});
