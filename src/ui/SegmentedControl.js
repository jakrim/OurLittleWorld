import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { radius, space, useTheme } from './theme';

export default function SegmentedControl({ value, options, onChange, style }) {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) {
                Haptics.selectionAsync();
                onChange?.(option.value);
              }
            }}
            style={[styles.item, active && { backgroundColor: theme.semantic.card }]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? theme.semantic.text : theme.semantic.textMuted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 4,
  },
  item: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  label: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 12,
    fontWeight: '600',
  },
});
