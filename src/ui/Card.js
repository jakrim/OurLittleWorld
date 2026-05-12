import React from 'react';
import { View, StyleSheet } from 'react-native';

import { colors, semantic, space, radius, shadow } from './theme';

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

const variants = {
  plain: { bg: semantic.card, shadow: shadow.whisper },
  muted: { bg: semantic.cardAlt, shadow: null, border: semantic.border },
  dark:  { bg: colors.ink,    shadow: shadow.soft },
  ghost: { bg: 'transparent', shadow: null, border: semantic.border },
};

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
