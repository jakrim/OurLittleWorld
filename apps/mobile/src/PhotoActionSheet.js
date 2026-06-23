import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Caption, colors, glass, semantic, space, radius, shadow } from './ui';
import useReducedMotion from './ui/useReducedMotion';

/**
 * Quiet photo action sheet.
 *
 * Shown on long-press of any photo tile across the OLW surfaces.
 * Renders an opaque bottom sheet with a small photo preview and a column
 * of stacked actions.
 *
 *   <PhotoActionSheet
 *     photo={photo}
 *     visible={!!photo}
 *     onClose={() => setActionPhoto(null)}
 *     actions={[
 *       { icon: 'share-outline', label: 'Share moment', onPress: ... },
 *       { icon: 'trash-outline', label: 'Remove from timeline', destructive: true, onPress: ... },
 *     ]}
 *   />
 */
export default function PhotoActionSheet({ photo, visible, onClose, actions = [], subtitle }) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        slide.setValue(1);
        dim.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(dim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      slide.setValue(0);
      dim.setValue(0);
    }
  }, [dim, reducedMotion, slide, visible]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const opacity = slide;
  const backdropOpacity = dim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

  const previewUri = photo?.thumbUrl || photo?.fullUrl || photo?.uri;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: glass.modalBackdrop, opacity: backdropOpacity }]} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close action sheet"
        />

        <Animated.View style={[styles.sheetWrap, { opacity, transform: [{ translateY }] }]} pointerEvents="box-none">
          <View style={[styles.sheet, { paddingBottom: space.md + Math.max(insets.bottom, space.sm) }]}>
            <View style={styles.handle} />

            {previewUri ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={140} cachePolicy="memory-disk" />
              </View>
            ) : null}

            {subtitle ? (
              <Caption align="center" style={styles.subtitle}>{subtitle}</Caption>
            ) : null}

            <View style={styles.actions}>
              {actions.map((action, i) => (
                <Pressable
                  key={action.label}
                  disabled={action.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={{ disabled: !!action.disabled }}
                  onPress={() => {
                    if (action.disabled) return;
                    action.onPress?.();
                  }}
                  style={({ pressed }) => [
                    styles.action,
                    i < actions.length - 1 && styles.actionDivider,
                    pressed && !action.disabled && styles.actionPressed,
                    action.disabled && styles.actionDisabled,
                  ]}
                >
                  <View style={[styles.actionIcon, action.destructive && styles.actionIconDestructive]}>
                    <Ionicons
                      name={action.icon}
                      size={18}
                      color={action.destructive ? colors.onPrimary : colors.ink}
                    />
                  </View>
                  <Body
                    style={[
                      styles.actionLabel,
                      action.destructive && { color: colors.danger, fontWeight: '600' },
                      action.disabled && { color: colors.muted },
                    ]}
                  >
                    {action.label}
                  </Body>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [styles.cancel, pressed && styles.actionPressed]}
            >
              <Body style={styles.cancelLabel}>Cancel</Body>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.border,
    ...shadow.soft,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: glass.inkHandle,
    alignSelf: 'center',
    marginBottom: space.md,
  },
  previewWrap: {
    width: '100%',
    height: 144,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
    marginBottom: space.md,
  },
  subtitle: {
    color: colors.plum,
    marginBottom: space.md,
    textTransform: 'none',
    letterSpacing: 0,
  },
  actions: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.border,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  actionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: glass.inkHairline,
  },
  actionPressed: {
    backgroundColor: glass.inkPressed,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.card,
  },
  actionIconDestructive: {
    backgroundColor: colors.danger,
  },
  actionLabel: {
    flex: 1,
    color: colors.ink,
  },
  cancel: {
    marginTop: space.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: semantic.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.border,
  },
  cancelLabel: {
    color: colors.plum,
    fontWeight: '600',
  },
});
