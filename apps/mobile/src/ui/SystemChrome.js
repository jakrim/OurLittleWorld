import React from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, useTheme } from './theme';

export function AppStatusBar({ style, backgroundColor = 'transparent', translucent = true }) {
  return (
    <StatusBar
      barStyle={style}
      backgroundColor={backgroundColor}
      translucent={translucent}
    />
  );
}

export function HomeIndicator({ color, floating = false }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const indicatorColor = color || (theme.isDark ? theme.colors.inkSoft : theme.colors.ink);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        floating && styles.floating,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: indicatorColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: Platform.OS === 'ios' ? 24 : 12,
  },
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    width: 134,
    height: 5,
    borderRadius: radius.pill,
    opacity: 0.36,
  },
});
