import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { radius as radiusTokens, useTheme } from './theme';

export default function PhotoPlaceholder({
  style,
  icon = 'image-outline',
  seed = 'default',
  radius = radiusTokens.md,
  source,
  uri,
  contentFit = 'cover',
  children,
}) {
  const theme = useTheme();
  const imageSource = source || (uri ? { uri } : null);
  const gradient = gradientForSeed(seed);

  return (
    <LinearGradient
      colors={[theme.semantic.photoPlaceholderBg, theme.semantic.photoPlaceholderBgAlt]}
      start={gradient.start}
      end={gradient.end}
      style={[styles.root, { borderRadius: radius }, style]}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.iconWrap, { borderColor: theme.semantic.photoPlaceholderBorder }]}>
          <Ionicons name={icon} size={24} color={theme.semantic.photoPlaceholderIcon} />
        </View>
      )}
      {children ? <View style={StyleSheet.absoluteFill}>{children}</View> : null}
    </LinearGradient>
  );
}

function gradientForSeed(seed) {
  const text = String(seed || 'default');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  const horizontal = hash % 2 === 0;
  return horizontal
    ? { start: { x: 0, y: 0.2 }, end: { x: 1, y: 0.8 } }
    : { start: { x: 0.2, y: 0 }, end: { x: 0.8, y: 1 } };
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
});
