import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

import useReducedMotion from './useReducedMotion';

export default function AnimatedPressable({
  children,
  disabled,
  onPress,
  style,
  pressableStyle,
  pressedScale = 0.97,
  ...pressableProps
}) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = (event) => {
    pressableProps.onPressIn?.(event);
    if (disabled || reducedMotion) return;
    Animated.timing(scale, { toValue: pressedScale, duration: 80, useNativeDriver: true }).start();
  };

  const onPressOut = (event) => {
    pressableProps.onPressOut?.(event);
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      damping: 18,
      stiffness: 260,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        {...pressableProps}
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={pressableStyle}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
