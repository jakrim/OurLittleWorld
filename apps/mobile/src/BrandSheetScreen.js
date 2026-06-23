import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  Body,
  Brand,
  BrandLockup,
  BrandMark,
  Caption,
  Card,
  Display,
  Eyebrow,
  LOGO_MARK_VARIANTS,
  PALETTE_NAMES,
  Screen,
  Title,
  palettes,
  radius,
  space,
  useTheme,
} from './ui';

const LOCKUP_PREVIEW_SIZES = ['sm', 'md', 'lg', 'xl'];

export default function BrandSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Screen variant="warm" scroll>
      <View style={styles.root}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
          <Ionicons name="chevron-back" size={18} color={theme.semantic.textSoft} />
          <Caption>Back</Caption>
        </Pressable>

        <Card>
          <Eyebrow>Brand sheet</Eyebrow>
          <Display style={styles.heroTitle}>our little world</Display>
          <Body>Internal reference for app icon checks, lockups, palette swatches, and type tone.</Body>
        </Card>

        <Card>
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>LogoMark variants</Eyebrow>
              <Title style={styles.sectionTitle}>Five sanctioned marks.</Title>
            </View>
          </View>
          <View style={styles.variantGrid}>
            {LOGO_MARK_VARIANTS.map((variant) => (
              <View key={variant.value} style={[styles.variantTile, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
                <BrandMark size={72} variant={variant.value} fillFrame={variant.value === 'rooted'} />
                <Caption style={styles.variantLabel}>{variant.label}</Caption>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <Eyebrow>Lockup scale</Eyebrow>
          <Title style={styles.sectionTitle}>sm / md / lg / xl</Title>
          <View style={styles.lockupStack}>
            {LOCKUP_PREVIEW_SIZES.map((size) => (
              <View key={size} style={[styles.lockupRow, { borderColor: theme.semantic.border }]}>
                <Caption style={styles.lockupSize}>{size}</Caption>
                <BrandLockup
                  size={size}
                  variant={size === 'sm' ? 'rooted' : 'nest'}
                  align="left"
                  tagline={size === 'xl' ? 'private baby book, not a feed' : undefined}
                />
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <Eyebrow>Palettes</Eyebrow>
          <Title style={styles.sectionTitle}>Light and dark families.</Title>
          <View style={styles.paletteStack}>
            {PALETTE_NAMES.map((name) => {
              const palette = palettes[name];
              return (
                <View key={name} style={[styles.paletteRow, { borderColor: theme.semantic.border }]}>
                  <View style={styles.paletteText}>
                    <Body style={styles.paletteName}>{palette.label}</Body>
                    <Caption>{name}</Caption>
                  </View>
                  <Swatches slots={palette.light} />
                  <Swatches slots={palette.dark} />
                </View>
              );
            })}
          </View>
        </Card>

        <Card>
          <Eyebrow>Type specimen</Eyebrow>
          <View style={styles.typeStack}>
            <Brand>our little world</Brand>
            <Display>A private place for the small things.</Display>
            <Title>Sealed in time.</Title>
            <Body>Quiet sentences, sentence case, no pressure. The product should feel more like a shared keepsake than a social feed.</Body>
            <Caption>Caption text stays useful, soft, and short.</Caption>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function Swatches({ slots }) {
  return (
    <View style={styles.swatches}>
      {[slots.bg, slots.primary, slots.accent, slots.secondary, slots.ink].map((color, index) => (
        <View key={`${color}-${index}`} style={[styles.swatch, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroTitle: {
    marginVertical: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sectionTitle: {
    fontSize: 23,
    lineHeight: 29,
    marginTop: space.xs,
  },
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  variantTile: {
    width: '31.8%',
    minHeight: 126,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.sm,
  },
  variantLabel: {
    marginTop: space.sm,
    textAlign: 'center',
  },
  lockupStack: {
    gap: space.md,
    marginTop: space.lg,
  },
  lockupRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  lockupSize: {
    width: 24,
    fontWeight: '800',
  },
  paletteStack: {
    marginTop: space.lg,
    gap: space.sm,
  },
  paletteRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  paletteText: {
    flex: 1,
    minWidth: 0,
  },
  paletteName: {
    fontSize: 14,
    lineHeight: 19,
  },
  swatches: {
    flexDirection: 'row',
    gap: 3,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  typeStack: {
    gap: space.md,
    marginTop: space.lg,
  },
});
