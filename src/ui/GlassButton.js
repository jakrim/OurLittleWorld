import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { radius, useTheme } from './theme';

export default function GlassButton({ icon, onPress, accessibilityLabel, style }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, { borderColor: theme.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.7)' }, style]}
    >
      <BlurView intensity={36} tint={theme.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Ionicons name={icon} size={18} color={theme.isDark ? theme.colors.bg : theme.colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
