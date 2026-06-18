import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { radius, useTheme } from './theme';

export default function PhotoPlaceholder({ style, icon = 'image-outline' }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[theme.semantic.border, theme.semantic.cardAlt]}
      style={[styles.root, style]}
    >
      <View style={[styles.iconWrap, { borderColor: theme.semantic.card }]}>
        <Ionicons name={icon} size={24} color={theme.semantic.card} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radius.md,
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
