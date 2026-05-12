import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Body, Caption, colors, semantic, space, radius, shadow } from './ui';

/**
 * Liquid-glass photo action sheet.
 *
 * Shown on long-press of any photo tile across the OLW surfaces.
 * Renders a translucent BlurView (iOS systemMaterial) bottom sheet with
 * a small photo preview and a column of stacked actions.
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
  const slide = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 11, tension: 130 }),
        Animated.timing(dim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      slide.setValue(0);
      dim.setValue(0);
    }
  }, [dim, slide, visible]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const opacity = slide;
  const backdropOpacity = dim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

  const previewUri = photo?.thumbUrl || photo?.fullUrl || photo?.uri;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,12,16,1)', opacity: backdropOpacity }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View style={[styles.sheetWrap, { opacity, transform: [{ translateY }] }]} pointerEvents="box-none">
          <View style={styles.sheet}>
            <BlurView intensity={80} tint="systemMaterial" style={StyleSheet.absoluteFill} />
            <View style={styles.glassHighlight} pointerEvents="none" />

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
                      color={action.destructive ? '#FFFFFF' : colors.ink}
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

            <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.actionPressed]}>
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
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  sheet: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingTop: space.md,
    paddingBottom: space.md,
    paddingHorizontal: space.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
    ...shadow.soft,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(45,31,38,0.18)',
    alignSelf: 'center',
    marginBottom: space.md,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
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
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
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
    borderBottomColor: 'rgba(45,31,38,0.12)',
  },
  actionPressed: {
    backgroundColor: 'rgba(45,31,38,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.7)',
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
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cancelLabel: {
    color: colors.plum,
    fontWeight: '600',
  },
});
