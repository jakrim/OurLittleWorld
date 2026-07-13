import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Brand, Caption } from './Type';
import { glass, space, useTheme } from './theme';

export const LOGO_MARK_VARIANTS = [
  { value: 'rooted', label: 'Rooted' },
  { value: 'trio', label: 'Trio' },
  { value: 'nest', label: 'Nest' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'aperture', label: 'Aperture' },
];

export const LOCKUP_SIZES = {
  sm: { mark: 28, brand: 13, caption: 10 },
  md: { mark: 42, brand: 17, caption: 11 },
  lg: { mark: 62, brand: 24, caption: 12 },
  xl: { mark: 88, brand: 32, caption: 13 },
};

export default function BrandMark({
  size = 112,
  showWordmark = false,
  fillFrame = false,
  tone = 'light',
  variant = 'rooted',
  style,
}) {
  const theme = useTheme();
  const wordmarkColor = tone === 'dark' ? theme.colors.bg : theme.semantic.primary;
  const normalizedVariant = LOGO_MARK_VARIANTS.some((item) => item.value === variant) ? variant : 'rooted';

  return (
    <View style={[styles.root, !showWordmark && { width: size, height: size }, style]}>
      {normalizedVariant === 'rooted' ? (
        <Image
          source={require('../../assets/brand/logo-mark-circle.png')}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityLabel="Our Little World rooted logo"
          fadeDuration={0}
        />
      ) : (
        <DrawnMark size={size} variant={normalizedVariant} tone={tone} fillFrame={fillFrame} />
      )}

      {showWordmark ? (
        <Brand align="center" style={[styles.wordmark, { color: wordmarkColor }]}>
          our little world
        </Brand>
      ) : null}
    </View>
  );
}

export function BrandLockup({
  size = 'md',
  variant = 'rooted',
  tagline,
  tone = 'light',
  align = 'center',
  style,
}) {
  const theme = useTheme();
  const scale = LOCKUP_SIZES[size] || LOCKUP_SIZES.md;
  const color = tone === 'dark' ? theme.colors.bg : theme.semantic.primary;
  const captionColor = tone === 'dark' ? theme.colors.bg : theme.semantic.textSoft;
  const row = align === 'left';
  return (
    <View style={[styles.lockup, row && styles.lockupRow, style]}>
      <BrandMark size={scale.mark} variant={variant} fillFrame={variant === 'rooted'} tone={tone} />
      <View style={[styles.lockupText, row && styles.lockupTextRow]}>
        <Brand
          align={row ? 'left' : 'center'}
          style={[styles.lockupBrand, { fontSize: scale.brand, lineHeight: Math.round(scale.brand * 1.2), color }]}
        >
          our little world
        </Brand>
        {tagline ? (
          <Caption
            align={row ? 'left' : 'center'}
            style={[styles.lockupCaption, { color: captionColor, fontSize: scale.caption }]}
          >
            {tagline}
          </Caption>
        ) : null}
      </View>
    </View>
  );
}

function DrawnMark({ size, variant, tone, fillFrame }) {
  const theme = useTheme();
  const stroke = tone === 'dark' ? theme.colors.bg : theme.semantic.primary;
  const soft = tone === 'dark' ? glass.glassBorderMuted : theme.colors.primarySoft;
  const frameStyle = fillFrame ? {
    backgroundColor: soft,
    borderColor: tone === 'dark' ? glass.mediaChromeBorder : theme.semantic.border,
    borderWidth: 1,
    borderRadius: size / 2,
  } : null;
  return (
    <View
      accessibilityLabel={`Our Little World ${variant} logo`}
      style={[styles.drawnRoot, { width: size, height: size }, frameStyle]}
    >
      {variant === 'trio' ? <TrioMark size={size} stroke={stroke} soft={soft} /> : null}
      {variant === 'nest' ? <NestMark size={size} stroke={stroke} soft={soft} /> : null}
      {variant === 'spiral' ? <SpiralMark size={size} stroke={stroke} soft={soft} /> : null}
      {variant === 'aperture' ? <ApertureMark size={size} stroke={stroke} soft={soft} /> : null}
    </View>
  );
}

function TrioMark({ size, stroke, soft }) {
  const dot = size * 0.2;
  return (
    <>
      <View style={[styles.softCircle, { width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36, backgroundColor: soft }]} />
      {[0, 1, 2].map((i) => {
        const left = [0.27, 0.52, 0.39][i] * size;
        const top = [0.28, 0.28, 0.5][i] * size;
        return (
          <View
            key={i}
            style={[styles.trioDot, { left, top, width: dot, height: dot, borderRadius: dot / 2, borderColor: stroke }]}
          />
        );
      })}
      <View style={[styles.trioStem, { backgroundColor: stroke, height: size * 0.34, top: size * 0.44 }]} />
    </>
  );
}

function NestMark({ size, stroke, soft }) {
  return (
    <>
      <View style={[styles.nestBowl, { width: size * 0.66, height: size * 0.44, borderRadius: size * 0.33, borderColor: stroke, backgroundColor: soft }]} />
      <View style={[styles.nestInner, { width: size * 0.42, height: size * 0.28, borderRadius: size * 0.21, borderColor: stroke, borderTopColor: 'transparent' }]} />
      <View style={[styles.nestEgg, { width: size * 0.14, height: size * 0.18, borderRadius: size * 0.09, backgroundColor: stroke }]} />
    </>
  );
}

function SpiralMark({ size, stroke, soft }) {
  return (
    <>
      <View style={[styles.spiralOuter, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35, borderColor: stroke, backgroundColor: soft }]} />
      <View style={[styles.spiralMid, { width: size * 0.46, height: size * 0.46, borderRadius: size * 0.23, borderColor: stroke, borderLeftColor: 'transparent' }]} />
      <View style={[styles.spiralInner, { width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, borderColor: stroke, borderBottomColor: 'transparent' }]} />
      <View style={[styles.spiralBreak, { width: size * 0.34, height: size * 0.2, backgroundColor: soft }]} />
    </>
  );
}

function ApertureMark({ size, stroke, soft }) {
  const bladeWidth = size * 0.34;
  const bladeHeight = size * 0.12;
  return (
    <>
      <View style={[styles.apertureFrame, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35, borderColor: stroke, backgroundColor: soft }]} />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <View
          key={deg}
          style={[
            styles.apertureBlade,
            {
              width: bladeWidth,
              height: bladeHeight,
              borderRadius: bladeHeight / 2,
              backgroundColor: stroke,
              transform: [{ rotate: `${deg}deg` }, { translateX: size * 0.13 }],
            },
          ]}
        />
      ))}
      <View style={[styles.apertureCenter, { width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, backgroundColor: soft, borderColor: stroke }]} />
    </>
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
  lockup: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockupRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  lockupText: {
    marginTop: space.sm,
  },
  lockupTextRow: {
    marginTop: 0,
    marginLeft: space.md,
  },
  lockupBrand: {
    letterSpacing: 0,
  },
  lockupCaption: {
    marginTop: 2,
    textTransform: 'none',
    letterSpacing: 0,
  },
  drawnRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  softCircle: {
    position: 'absolute',
  },
  trioDot: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  trioStem: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
  },
  nestBowl: {
    position: 'absolute',
    bottom: '24%',
    borderWidth: 2,
  },
  nestInner: {
    position: 'absolute',
    bottom: '30%',
    borderWidth: 2,
  },
  nestEgg: {
    position: 'absolute',
    top: '34%',
  },
  spiralOuter: {
    position: 'absolute',
    borderWidth: 2,
  },
  spiralMid: {
    position: 'absolute',
    borderWidth: 2,
  },
  spiralInner: {
    position: 'absolute',
    borderWidth: 2,
  },
  spiralBreak: {
    position: 'absolute',
    right: 0,
    top: '28%',
    opacity: 0.95,
    transform: [{ rotate: '-22deg' }],
  },
  apertureFrame: {
    position: 'absolute',
    borderWidth: 2,
  },
  apertureBlade: {
    position: 'absolute',
    opacity: 0.74,
  },
  apertureCenter: {
    position: 'absolute',
    borderWidth: 1,
  },
});
