import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Brand } from './Type';
import { space, useTheme } from './theme';

export default function BrandMark({
  size = 112,
  showWordmark = false,
  fillFrame = false,
  tone = 'light',
  style,
}) {
  const theme = useTheme();
  const wordmarkColor = tone === 'dark' ? theme.colors.bg : theme.semantic.primary;

  return (
    <View style={[styles.root, !showWordmark && { width: size, height: size }, style]}>
      <Image
        source={
          fillFrame
            ? require('../../assets/brand/logo-mark-circle.png')
            : require('../../assets/brand/logo-mark.png')
        }
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Our Little World logo"
        fadeDuration={0}
      />

      {showWordmark ? (
        <Brand align="center" style={[styles.wordmark, { color: wordmarkColor }]}>
          our little world
        </Brand>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    marginTop: space.sm,
  },
});
