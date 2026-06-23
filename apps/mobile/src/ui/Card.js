import React from 'react';
import { View, StyleSheet } from 'react-native';

import { space, radius, shadow, useTheme } from './theme';

/**
 *   <Card>...</Card>                  white surface, soft shadow
 *   <Card variant="muted">...</Card>  cream-tinted surface, no shadow
 *   <Card variant="dark">...</Card>   ink surface for inverted moments
 *   <Card padding="lg">...</Card>     control inner padding
 */
export default function Card({
  children,
  variant = 'plain',
  padding = 'lg',
  style,
}) {
  const theme = useTheme();
  const variants = getVariants(theme);
  const v = variants[variant] || variants.plain;
  const padPx = paddings[padding] ?? paddings.lg;
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: v.bg, padding: padPx, borderColor: v.border ?? 'transparent', borderWidth: v.border ? 1 : 0 },
        v.shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function getVariants(theme) {
  return {
    plain: { bg: theme.semantic.card, shadow: shadow.whisper },
    muted: { bg: theme.semantic.cardAlt, shadow: null, border: theme.semantic.border },
    dark:  { bg: theme.isDark ? theme.colors.surface : theme.colors.ink, shadow: shadow.soft },
    ghost: { bg: 'transparent', shadow: null, border: theme.semantic.border },
  };
}

const paddings = {
  none: 0,
  sm: space.md,
  md: space.lg,
  lg: space.xl,
  xl: space.xxl,
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
  },
});
