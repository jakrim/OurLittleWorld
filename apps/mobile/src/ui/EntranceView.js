import React, { useEffect, useRef } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import useReducedMotion from './useReducedMotion';

export const ENTRANCE_STAGGER_MS = 30;
const ENTRANCE_DURATION_MS = 220;
const ENTRANCE_OFFSET_Y = 10;

export default function EntranceView({
  children,
  index = 0,
  delayMs = 0,
  style,
}) {
  const reducedMotion = useReducedMotion();
  const hasStarted = useRef(false);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const translateY = useSharedValue(reducedMotion ? 0 : ENTRANCE_OFFSET_Y);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = delayMs + Math.max(0, index) * ENTRANCE_STAGGER_MS;
    opacity.value = withDelay(delay, withTiming(1, { duration: ENTRANCE_DURATION_MS }));
    translateY.value = withDelay(delay, withTiming(0, { duration: ENTRANCE_DURATION_MS }));
  }, [delayMs, index, opacity, reducedMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
