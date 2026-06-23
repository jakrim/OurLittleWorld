import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { radius, space, useTheme } from './theme';

export default function SegmentedControl({ value, options, onChange, style, columns }) {
  const theme = useTheme();
  const columnCount = Number.isFinite(columns) && columns > 1 ? columns : null;
  const itemWidth = columnCount ? `${100 / columnCount}%` : null;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.root,
        columnCount ? styles.rootWrapped : null,
        { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border },
        style,
      ]}
    >
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
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            style={[
              styles.item,
              columnCount ? [styles.itemWrapped, { width: itemWidth }] : null,
              active && { backgroundColor: theme.semantic.card },
            ]}
          >
            <Text
              numberOfLines={columnCount ? 2 : 1}
              adjustsFontSizeToFit={!!columnCount}
              minimumFontScale={0.88}
              style={[
                styles.label,
                columnCount ? styles.labelWrapped : null,
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
  rootWrapped: {
    flexWrap: 'wrap',
    rowGap: 4,
  },
  item: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  itemWrapped: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 52,
  },
  label: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 12,
    fontWeight: '600',
  },
  labelWrapped: {
    textAlign: 'center',
  },
});
