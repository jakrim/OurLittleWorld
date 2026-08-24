import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Brand } from './Type';
import { radius, shadow, space, useTheme } from './theme';

export default function BrandedBackHeader({
  onBack,
  accessibilityLabel = 'Go back',
  style,
  brandStyle,
}) {
  const theme = useTheme();

  return (
    <View style={[styles.root, style]}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        style={[
          styles.backButton,
          {
            backgroundColor: theme.semantic.card,
            borderColor: theme.semantic.border,
          },
        ]}
      >
        <Ionicons name="chevron-back" size={20} color={theme.semantic.textSoft} />
      </Pressable>
      <Brand numberOfLines={1} style={[styles.brand, brandStyle]}>
        our little world
      </Brand>
      <View style={styles.trailingBalance} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.whisper,
  },
  brand: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space.sm,
    textAlign: 'center',
  },
  trailingBalance: {
    width: 40,
    height: 40,
  },
});
