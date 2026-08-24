import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { glass, radius, useTheme } from './theme';

export default function GlassButton({ icon, onPress, accessibilityLabel, style }) {
  const theme = useTheme();
  const iconColor = theme.colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || icon}
      style={[styles.root, { borderColor: theme.isDark ? glass.glassBorderMuted : glass.glassBorderStrong }, style]}
    >
      <BlurView intensity={36} tint={theme.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Ionicons name={icon} size={19} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
