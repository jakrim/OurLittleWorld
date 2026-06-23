import React, { useRef } from 'react';
import { Pressable, Text, View, StyleSheet, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

import { space, radius, shadow, useTheme } from './theme';
import useReducedMotion from './useReducedMotion';

/**
 * The OLW button.
 *
 *   variant="primary"     filled coral, white text. The default CTA.
 *   variant="secondary"   filled rose, white text.
 *   variant="ghost"       transparent + 1.5px coral border + coral text.
 *   variant="quiet"       no background, just coral text. For tertiary actions.
 *   variant="dark"        ink fill, cream text. For inverted contexts.
 *
 *   size="lg" | "md" | "sm"
 *   icon={<Some/>}        rendered before the label
 *   loading                shows muted "…" instead of children
 *
 * Tapping triggers a selection-strength haptic on iOS automatically.
 */
export default function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  trailing,
  loading,
  disabled,
  fullWidth = true,
  style,
  haptic = 'selection',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const buttonLabel = accessibilityLabel || (typeof children === 'string' ? children : undefined);

  const handlePress = () => {
    if (isDisabled) return;
    if (haptic === 'selection') Haptics.selectionAsync();
    if (haptic === 'soft') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (haptic === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPress?.();
  };

  const onPressIn = () => {
    if (reducedMotion) return;
    Animated.timing(scale, { toValue: 0.98, duration: 70, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, { toValue: 1, duration: 90, useNativeDriver: true }).start();
  };

  const variants = getVariants(theme);
  const v = variants[variant] || variants.primary;
  const s = sizes[size]      || sizes.lg;

  return (
    <Animated.View style={[{ transform: [{ scale }], width: fullWidth ? '100%' : undefined }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: !!isDisabled,
          busy: !!loading,
          ...accessibilityState,
        }}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor: v.bg,
            borderColor: v.border || 'transparent',
            borderWidth: v.border ? 1.5 : 0,
            paddingVertical: s.padY,
            paddingHorizontal: s.padX,
            minHeight: s.minHeight,
            opacity: disabled ? 0.45 : 1,
          },
          v.shadow ? shadow.press : null,
        ]}
      >
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={[styles.label, { color: v.fg, fontSize: s.font }]} numberOfLines={1}>
            {loading ? '…' : children}
          </Text>
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function getVariants(theme) {
  const { colors, semantic } = theme;
  return {
    primary:   { bg: semantic.primary,   fg: colors.onPrimary, shadow: true },
    secondary: { bg: semantic.secondary, fg: colors.onPrimary, shadow: true },
    ghost:     { bg: 'transparent',      fg: semantic.primary, border: semantic.primary, shadow: false },
    quiet:     { bg: 'transparent',      fg: semantic.primary, shadow: false },
    dark:      {
      bg: theme.isDark ? colors.surface : colors.ink,
      fg: theme.isDark ? colors.ink : colors.bg,
      shadow: true,
    },
    cream:     { bg: colors.bg,          fg: colors.ink,       shadow: true },
  };
}

const sizes = {
  lg: { padY: 18, padX: 28, font: 17, minHeight: 58 },
  md: { padY: 14, padX: 22, font: 15, minHeight: 48 },
  sm: { padY: 10, padX: 16, font: 14, minHeight: 44 },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: space.sm,
  },
  trailing: {
    marginLeft: space.sm,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0,
  },
});
