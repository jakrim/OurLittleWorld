import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Our Little World — design system.
 *
 * Five home palettes, each with a paired dark variant. Hearth is the default.
 * Components should use palette slots instead of raw hex so the whole app can
 * settle into a family's preferred home and late-night reading mode.
 */

export const PALETTE_NAMES = ['hearth', 'sky', 'linen', 'twilight', 'meadow'];
export const THEME_MODE_NAMES = ['system', 'light', 'dark'];
export const THEME_STORAGE_KEY = 'olw:theme-preferences:v1';

export const palettes = {
  hearth: {
    label: 'Hearth',
    feel: 'Default. Warm peach + sage.',
    light: {
      bg: '#FAF4EE',
      bgAlt: '#FFF8F1',
      surface: '#FFFFFF',
      ink: '#2A1F1A',
      inkSoft: '#5F4B41',
      muted: '#907E72',
      border: '#E8DCD1',
      primary: '#C46A4C',
      primarySoft: '#F2CEC1',
      accent: '#7C9277',
      gold: '#D6A45C',
    },
    dark: {
      bg: '#1A130E',
      bgAlt: '#211912',
      surface: '#2A211A',
      ink: '#F8EFE7',
      inkSoft: '#D7C7BA',
      muted: '#A99588',
      border: '#3E3026',
      primary: '#D98268',
      primarySoft: '#452B22',
      accent: '#9BAF92',
      gold: '#E1B76F',
    },
  },
  sky: {
    label: 'Sky',
    feel: 'Cool teal + warm coral accent.',
    light: {
      bg: '#EEF4F7',
      bgAlt: '#F7FBFC',
      surface: '#FFFFFF',
      ink: '#2E4258',
      inkSoft: '#556879',
      muted: '#82909A',
      border: '#D9E5EA',
      primary: '#5E9C9A',
      primarySoft: '#CBE3E2',
      accent: '#E88474',
      gold: '#D6A45C',
    },
    dark: {
      bg: '#0F181B',
      bgAlt: '#142126',
      surface: '#1D2B31',
      ink: '#EDF6F8',
      inkSoft: '#CAD9DE',
      muted: '#91A7AF',
      border: '#31454D',
      primary: '#78B4B0',
      primarySoft: '#203D3E',
      accent: '#F09A8D',
      gold: '#E0B970',
    },
  },
  linen: {
    label: 'Linen',
    feel: 'Earthy clay + oat.',
    light: {
      bg: '#F4EFE5',
      bgAlt: '#FBF6EC',
      surface: '#FFFFFF',
      ink: '#2A2620',
      inkSoft: '#5F564A',
      muted: '#8D8273',
      border: '#E4DACB',
      primary: '#8A6A45',
      primarySoft: '#E5D4BC',
      accent: '#6E8068',
      gold: '#C69B58',
    },
    dark: {
      bg: '#18140F',
      bgAlt: '#211B14',
      surface: '#2B241B',
      ink: '#F6F0E5',
      inkSoft: '#D5CABA',
      muted: '#A59A89',
      border: '#403629',
      primary: '#A88458',
      primarySoft: '#3B2D1D',
      accent: '#8DA085',
      gold: '#DDB76A',
    },
  },
  twilight: {
    label: 'Twilight',
    feel: 'Dusk plum + lavender.',
    light: {
      bg: '#F1EAEE',
      bgAlt: '#FAF3F7',
      surface: '#FFFFFF',
      ink: '#241A24',
      inkSoft: '#5A4A59',
      muted: '#8A7B89',
      border: '#E3D6DE',
      primary: '#80506C',
      primarySoft: '#DDC3D0',
      accent: '#7C7BA0',
      gold: '#D2A35F',
    },
    dark: {
      bg: '#171016',
      bgAlt: '#211821',
      surface: '#2B2130',
      ink: '#F6EEF4',
      inkSoft: '#D8C6D4',
      muted: '#A48FA1',
      border: '#403246',
      primary: '#9A6B85',
      primarySoft: '#3B2634',
      accent: '#9897BF',
      gold: '#E0B56D',
    },
  },
  meadow: {
    label: 'Meadow',
    feel: 'Sage green + clay.',
    light: {
      bg: '#F2F1E7',
      bgAlt: '#FAF8EE',
      surface: '#FFFFFF',
      ink: '#1F2620',
      inkSoft: '#4E5A4F',
      muted: '#7E897C',
      border: '#E0E0D2',
      primary: '#5C7A55',
      primarySoft: '#D4DFC9',
      accent: '#B07A4C',
      gold: '#CF9F59',
    },
    dark: {
      bg: '#10170F',
      bgAlt: '#172114',
      surface: '#202C1D',
      ink: '#EEF4EA',
      inkSoft: '#CDD9C8',
      muted: '#99A592',
      border: '#34432F',
      primary: '#77946E',
      primarySoft: '#263B21',
      accent: '#C89562',
      gold: '#E0B86D',
    },
  },
};

function addAlpha(hex, alpha) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildColors(slots, scheme) {
  const isDark = scheme === 'dark';
  return {
    ...slots,

    // Legacy aliases kept for screens that have not moved fully to slots yet.
    cream: slots.bg,
    parchment: slots.bgAlt,
    surfaceMuted: slots.bgAlt,
    plum: slots.inkSoft,
    whisper: slots.muted,
    coral: slots.primary,
    coralSoft: slots.primarySoft,
    rose: slots.accent,
    roseSoft: slots.primarySoft,
    goldSoft: slots.primarySoft,
    sage: slots.accent,
    warning: slots.gold,
    danger: isDark ? '#F07F72' : '#C0392B',
    borderStrong: isDark ? '#544237' : '#D7C8BA',
    photoPlaceholderBg: isDark ? '#2C2F33' : '#E9ECEF',
    photoPlaceholderBgAlt: isDark ? '#23262A' : '#F4F5F6',
    photoPlaceholderIcon: isDark ? '#8E969D' : '#A5ADB4',
    photoPlaceholderBorder: isDark ? '#3C4248' : '#D8DEE3',
    scrim: addAlpha(slots.ink, isDark ? 0.62 : 0.42),
    scrimDeep: addAlpha(slots.ink, isDark ? 0.84 : 0.78),
    onPrimary: '#FFFFFF',
  };
}

function buildSemantic(colorsForPalette) {
  return {
    bg: colorsForPalette.bg,
    bgAlt: colorsForPalette.bgAlt,
    card: colorsForPalette.surface,
    cardAlt: colorsForPalette.bgAlt,
    surface: colorsForPalette.surface,
    text: colorsForPalette.ink,
    textSoft: colorsForPalette.inkSoft,
    textMuted: colorsForPalette.muted,
    textWhisper: colorsForPalette.muted,
    primary: colorsForPalette.primary,
    primarySoft: colorsForPalette.primarySoft,
    secondary: colorsForPalette.accent,
    accent: colorsForPalette.accent,
    border: colorsForPalette.border,
    borderStrong: colorsForPalette.borderStrong,
    photoPlaceholderBg: colorsForPalette.photoPlaceholderBg,
    photoPlaceholderBgAlt: colorsForPalette.photoPlaceholderBgAlt,
    photoPlaceholderIcon: colorsForPalette.photoPlaceholderIcon,
    photoPlaceholderBorder: colorsForPalette.photoPlaceholderBorder,
  };
}

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 36,
  xxxl: 56,
  hero: 80,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 22,
  xl: 32,
  pill: 999,
};

export const shadow = {
  /** Subtle resting elevation for cards. */
  whisper: {
    shadowColor: '#3A2531',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  /** Lifted card / hero photo. */
  soft: {
    shadowColor: '#3A2531',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 6,
  },
  /** Pressable buttons. */
  press: {
    shadowColor: '#3A2531',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
};

export const glass = {
  modalBackdrop: 'rgba(20,12,16,1)',
  photoBackdrop: '#000000',
  mediaChrome: 'rgba(255,255,255,0.14)',
  mediaChromeBorder: 'rgba(255,255,255,0.22)',
  glassBorderMuted: 'rgba(255,255,255,0.18)',
  glassBorderStrong: 'rgba(255,255,255,0.7)',
  mediaScrim: 'rgba(20,12,16,0.22)',
  mediaScrimClear: 'rgba(20,12,16,0)',
  mediaTextShadow: 'rgba(0,0,0,0.4)',
  clear: 'transparent',
  photoDim: 'rgba(255,255,255,0.55)',
  floatingPanel: 'rgba(248,242,235,0.95)',
  softWhiteDot: 'rgba(255,255,255,0.86)',
  softWhitePanel: 'rgba(255,255,255,0.66)',
  inverseTextSoft: 'rgba(255,255,255,0.72)',
  inverseTextBody: 'rgba(255,255,255,0.82)',
  inverseChip: 'rgba(255,255,255,0.13)',
  inverseDot: 'rgba(255,255,255,0.28)',
  firstLookScrim: 'rgba(10,5,8,0.52)',
  inverseTextMuted: 'rgba(255,247,238,0.78)',
  inkDivider: 'rgba(45,31,38,0.06)',
  inkScrim: 'rgba(45,31,38,0.6)',
  inkScrimStrong: 'rgba(45,31,38,0.78)',
  writerPill: 'rgba(95,74,88,0.12)',
  circlePill: 'rgba(71,112,92,0.14)',
  sheet: 'rgba(255,255,255,0.55)',
  sheetStrong: 'rgba(255,255,255,0.7)',
  sheetSoft: 'rgba(255,255,255,0.45)',
  highlight: 'rgba(255,255,255,0.85)',
  inkHairline: 'rgba(45,31,38,0.12)',
  inkPressed: 'rgba(45,31,38,0.08)',
  inkHandle: 'rgba(45,31,38,0.18)',
};

/**
 * Type tokens. Newsreader is the intended headline serif, Manrope the UI/body
 * sans, and Caveat the sparing handwritten voice.
 */
export const fonts = {
  display: 'Newsreader',
  displayItalic: 'Newsreader-Italic',
  script: 'Caveat',
  body: 'Manrope',
  bodyRegular: 'Manrope-Regular',
  bodyMedium: 'Manrope',
  bodySemi: 'Manrope-SemiBold',
  bodyBold: 'Manrope-Bold',
};

function buildType(semanticForPalette) {
  return {
    display: {
    fontFamily: fonts.display,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -0.5,
    color: semanticForPalette.text,
  },
  hero: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.4,
    color: semanticForPalette.text,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    color: semanticForPalette.text,
  },
  subtitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: semanticForPalette.text,
  },
  body: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
    color: semanticForPalette.textSoft,
  },
  bodyTight: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: semanticForPalette.textSoft,
  },
  caption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: semanticForPalette.textMuted,
  },
  micro: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semanticForPalette.textMuted,
  },
  brand: {
    fontFamily: fonts.displayItalic,
    fontSize: 22,
    color: semanticForPalette.primary,
  },
  };
}

export function createTheme({ paletteName = 'hearth', scheme = 'light', mode = 'system' } = {}) {
  const safePaletteName = palettes[paletteName] ? paletteName : 'hearth';
  const safeScheme = scheme === 'dark' ? 'dark' : 'light';
  const palette = palettes[safePaletteName];
  const paletteSlots = palette[safeScheme];
  const nextColors = buildColors(paletteSlots, safeScheme);
  const nextSemantic = buildSemantic(nextColors);

  return {
    paletteName: safePaletteName,
    paletteLabel: palette.label,
    paletteFeel: palette.feel,
    mode: THEME_MODE_NAMES.includes(mode) ? mode : 'system',
    scheme: safeScheme,
    isDark: safeScheme === 'dark',
    colors: nextColors,
    semantic: nextSemantic,
    space,
    radius,
    shadow,
    fonts,
    type: buildType(nextSemantic),
  };
}

const fallbackTheme = createTheme({ paletteName: 'hearth', scheme: 'light', mode: 'system' });

export const colors = fallbackTheme.colors;
export const semantic = fallbackTheme.semantic;
export const type = fallbackTheme.type;

const ThemeContext = createContext({
  ...fallbackTheme,
  preferencesReady: false,
  setMode: async () => {},
  setPaletteName: async () => {},
});

function normalizePreferences(value) {
  const paletteName = palettes[value?.paletteName] ? value.paletteName : 'hearth';
  const mode = THEME_MODE_NAMES.includes(value?.mode) ? value.mode : 'system';
  return { paletteName, mode };
}

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState({ paletteName: 'hearth', mode: 'system' });
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        setPreferences(normalizePreferences(JSON.parse(raw)));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setPreferencesReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(async (next) => {
    const normalized = normalizePreferences(next);
    setPreferences(normalized);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(normalized));
  }, []);

  const setMode = useCallback(
    (mode) => persist({ ...preferences, mode }),
    [persist, preferences],
  );

  const setPaletteName = useCallback(
    (paletteName) => persist({ ...preferences, paletteName }),
    [persist, preferences],
  );

  const scheme = preferences.mode === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : preferences.mode;

  const value = useMemo(
    () => ({
      ...createTheme({ paletteName: preferences.paletteName, scheme, mode: preferences.mode }),
      preferencesReady,
      setMode,
      setPaletteName,
    }),
    [preferences.paletteName, preferences.mode, preferencesReady, scheme, setMode, setPaletteName],
  );

  useEffect(() => {
    Object.assign(colors, value.colors);
    Object.assign(semantic, value.semantic);
    Object.assign(type, value.type);
  }, [value]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

const theme = fallbackTheme;
export default theme;
