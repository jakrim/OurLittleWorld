import React, { useEffect, useState } from 'react';
import { View, ScrollView, Keyboard, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { semantic, space, useTheme } from './theme';

/**
 * Standard wrapper for every OLW screen.
 *
 *   <Screen>...</Screen>                    cream bg, top + bottom safe area
 *   <Screen scroll>...</Screen>             auto wraps in ScrollView
 *   <Screen scroll keyboard>...</Screen>    ScrollView + extra bottom inset while the keyboard is open
 *   <Screen variant="warm">...</Screen>     gradient cream → blush at top
 *   <Screen variant="dark">...</Screen>     deep plum bg (for hero / detail moments)
 *
 * Children get padded horizontally by default; pass `bare` to opt out.
 */
export default function Screen({
  children,
  scroll = false,
  keyboard = false,
  bare = false,
  variant = 'plain',
  contentStyle,
  edges = { top: true, bottom: true },
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!scroll || !keyboard) return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e) => setKeyboardHeight(e?.endCoordinates?.height ?? 0);
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [scroll, keyboard]);

  const insetBottom = edges.bottom ? insets.bottom : 0;
  const scrollBottomPad =
    insetBottom + keyboardHeight + (keyboardHeight > 0 ? space.lg : 0);

  const safeEdges = getSafeEdges(edges, scroll && keyboard);
  const keyboardInsetStyle = scroll && keyboard
    ? { paddingBottom: scrollBottomPad }
    : null;

  const contentPadding = bare
    ? null
    : { paddingHorizontal: space.xl };

  const Background = (
    <BackgroundLayer variant={variant} theme={theme} />
  );

  const ChildrenWrap = (
    <View style={[styles.children, contentPadding, contentStyle]}>{children}</View>
  );

  if (scroll) {
    const Inner = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, keyboardInsetStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        {ChildrenWrap}
      </ScrollView>
    );

    return (
      <View style={[styles.root, { backgroundColor: theme.semantic.bg }]}>
        {Background}
        <SafeAreaView style={styles.safe} edges={safeEdges}>
          {Inner}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.semantic.bg }]}>
      {Background}
      <SafeAreaView style={styles.safe} edges={safeEdges}>
        {ChildrenWrap}
      </SafeAreaView>
    </View>
  );
}

function getSafeEdges(edges, keyboardControlsBottom) {
  if (Array.isArray(edges)) return keyboardControlsBottom ? edges.filter((edge) => edge !== 'bottom') : edges;
  const out = [];
  if (edges.top) out.push('top');
  if (edges.bottom && !keyboardControlsBottom) out.push('bottom');
  if (edges.left) out.push('left');
  if (edges.right) out.push('right');
  return out;
}

function BackgroundLayer({ variant, theme }) {
  const { colors, semantic } = theme;
  if (variant === 'warm') {
    return (
      <LinearGradient
        colors={[colors.primarySoft, colors.bg, colors.bg]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  if (variant === 'dawn') {
    return (
      <LinearGradient
        colors={[colors.primarySoft, colors.bgAlt, colors.bg]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  if (variant === 'dusk') {
    return (
      <LinearGradient
        colors={[colors.primarySoft, colors.bgAlt, colors.bg]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  if (variant === 'dark') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.isDark ? colors.bg : colors.ink }]} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: semantic.bg }]} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bg,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  children: {
    flexGrow: 1,
  },
});
