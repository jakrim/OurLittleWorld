import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { radius, space, useTheme } from './theme';
import useReducedMotion from './useReducedMotion';

const ROOT_PADDING = 4;
const SEGMENT_CONTENT_FADE_MS = 150;
const THUMB_SPRING = { damping: 18, stiffness: 260, mass: 0.75 };

export default function SegmentedControl({ value, options, onChange, style, columns }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [rootWidth, setRootWidth] = useState(0);
  const columnCount = Number.isFinite(columns) && columns > 1 ? columns : null;
  const itemWidth = columnCount ? `${100 / columnCount}%` : null;
  const thumbEnabled = !columnCount && options.length > 0;
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const thumbWidth = thumbEnabled && rootWidth
    ? Math.max(0, (rootWidth - ROOT_PADDING * 2) / options.length)
    : 0;
  const thumbX = thumbWidth * activeIndex;
  const animatedThumbWidth = useSharedValue(thumbWidth);
  const animatedThumbX = useSharedValue(thumbX);

  useEffect(() => {
    if (reducedMotion) {
      animatedThumbWidth.value = thumbWidth;
      animatedThumbX.value = thumbX;
      return;
    }
    animatedThumbWidth.value = withTiming(thumbWidth, { duration: SEGMENT_CONTENT_FADE_MS });
    animatedThumbX.value = withSpring(thumbX, THUMB_SPRING);
  }, [animatedThumbWidth, animatedThumbX, reducedMotion, thumbWidth, thumbX]);

  const thumbStyle = useAnimatedStyle(() => ({
    opacity: animatedThumbWidth.value > 0 ? 1 : 0,
    width: animatedThumbWidth.value,
    transform: [{ translateX: animatedThumbX.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setRootWidth(event.nativeEvent.layout.width)}
      style={[
        styles.root,
        columnCount ? styles.rootWrapped : null,
        { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border },
        style,
      ]}
    >
      {thumbEnabled ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { backgroundColor: theme.semantic.card },
            thumbStyle,
          ]}
        />
      ) : null}
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
              columnCount && active ? { backgroundColor: theme.semantic.card } : null,
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

export function SegmentedContent({ segmentKey, children, style }) {
  const reducedMotion = useReducedMotion();
  const incomingOpacity = useSharedValue(1);
  const outgoingOpacity = useSharedValue(0);
  const lastKeyRef = useRef(segmentKey);
  const lastChildrenRef = useRef(children);
  const [previous, setPrevious] = useState(null);

  useEffect(() => {
    if (lastKeyRef.current !== segmentKey) {
      if (reducedMotion) {
        setPrevious(null);
      } else {
        setPrevious({ key: lastKeyRef.current, children: lastChildrenRef.current });
        incomingOpacity.value = 0;
        outgoingOpacity.value = 1;
        incomingOpacity.value = withTiming(1, { duration: SEGMENT_CONTENT_FADE_MS });
        outgoingOpacity.value = withTiming(0, { duration: SEGMENT_CONTENT_FADE_MS }, (finished) => {
          if (finished) runOnJS(setPrevious)(null);
        });
      }
      lastKeyRef.current = segmentKey;
    }
    lastChildrenRef.current = children;
  }, [children, incomingOpacity, outgoingOpacity, reducedMotion, segmentKey]);

  const incomingStyle = useAnimatedStyle(() => ({ opacity: incomingOpacity.value }));
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoingOpacity.value }));

  return (
    <View style={[styles.contentRoot, style]}>
      {previous ? (
        <Animated.View pointerEvents="none" style={[styles.previousContent, outgoingStyle]}>
          {previous.children}
        </Animated.View>
      ) : null}
      <Animated.View style={incomingStyle}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: ROOT_PADDING,
    position: 'relative',
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
    zIndex: 1,
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
  thumb: {
    position: 'absolute',
    top: ROOT_PADDING,
    bottom: ROOT_PADDING,
    left: ROOT_PADDING,
    borderRadius: radius.sm,
    zIndex: 0,
  },
  contentRoot: {
    position: 'relative',
  },
  previousContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
});
