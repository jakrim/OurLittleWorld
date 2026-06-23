import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Dimensions, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { semantic, space, useTheme } from './theme';
import { AppStatusBar } from './SystemChrome';

/**
 * Standard wrapper for every OLW screen.
 *
 *   <Screen>...</Screen>                    cream bg, top + bottom safe area
 *   <Screen scroll>...</Screen>             auto wraps in ScrollView
 *   <Screen scroll keyboard>...</Screen>    ScrollView inside a KeyboardAvoidingView
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
  statusBarStyle,
  statusBarBackgroundColor = 'transparent',
  keyboardVerticalOffset = 0,
  keyboardBehavior,
  scrollBounce = false,
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const resolvedStatusBarStyle = statusBarStyle || (variant === 'dark' || theme.isDark ? 'light-content' : 'dark-content');
  const scrollFocusedInputIntoView = useCallback((keyboardFrame) => {
    if (!scroll || !keyboard || !scrollRef.current) return;
    const focusedInput = TextInput.State?.currentlyFocusedInput?.();
    if (!focusedInput?.measureInWindow) return;

    const screenHeight = Dimensions.get('window').height;
    const keyboardTop = keyboardFrame?.screenY ?? (screenHeight - (keyboardFrame?.height || keyboardHeight));

    focusedInput.measureInWindow((x, y, width, height) => {
      const focusedBottom = y + height;
      const desiredGap = space.xl;
      if (focusedBottom + desiredGap <= keyboardTop) return;

      const delta = focusedBottom + desiredGap - keyboardTop;
      scrollRef.current?.scrollTo({
        y: Math.max(0, scrollYRef.current + delta),
        animated: true,
      });
    });
  }, [keyboard, keyboardHeight, scroll]);

  useEffect(() => {
    if (!scroll || !keyboard) return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e) => {
      setKeyboardHeight(e?.endCoordinates?.height ?? 0);
      setTimeout(() => {
        scrollFocusedInputIntoView(e?.endCoordinates);
      }, Platform.OS === 'ios' ? 180 : 80);
    };
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [scroll, keyboard, scrollFocusedInputIntoView]);

  const insetBottom = edges.bottom ? insets.bottom : 0;
  const shouldAvoidKeyboard = !!keyboard;
  const avoidBehavior = keyboardBehavior || (Platform.OS === 'ios' ? 'padding' : 'height');
  const avoidProps = shouldAvoidKeyboard
    ? {
        behavior: avoidBehavior,
        keyboardVerticalOffset,
      }
    : {};
  const usesNativeKeyboardAvoidance = shouldAvoidKeyboard && Platform.OS === 'ios';
  const scrollBottomPad =
    insetBottom
    + (scroll && keyboard && !usesNativeKeyboardAvoidance ? keyboardHeight : 0)
    + (scroll && keyboard ? space.lg : 0);

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

  const KeyboardWrap = shouldAvoidKeyboard ? KeyboardAvoidingView : View;

  if (scroll) {
    const Inner = (
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, keyboardInsetStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        bounces={scrollBounce}
        alwaysBounceVertical={scrollBounce}
        overScrollMode={scrollBounce ? 'auto' : 'never'}
        contentInsetAdjustmentBehavior="never"
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {ChildrenWrap}
      </ScrollView>
    );

    return (
      <View style={[styles.root, { backgroundColor: theme.semantic.bg }]}>
        <AppStatusBar style={resolvedStatusBarStyle} backgroundColor={statusBarBackgroundColor} />
        {Background}
        <SafeAreaView style={styles.safe} edges={safeEdges}>
          <KeyboardWrap style={styles.keyboardAvoider} {...avoidProps}>
            {Inner}
          </KeyboardWrap>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.semantic.bg }]}>
      <AppStatusBar style={resolvedStatusBarStyle} backgroundColor={statusBarBackgroundColor} />
      {Background}
      <SafeAreaView style={styles.safe} edges={safeEdges}>
        <KeyboardWrap style={styles.keyboardAvoider} {...avoidProps}>
          {ChildrenWrap}
        </KeyboardWrap>
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
  keyboardAvoider: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  children: {
    flexGrow: 1,
  },
});
