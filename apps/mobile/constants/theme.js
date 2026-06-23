/**
 * Shared design system for the modern Our Little World app.
 */

export const palette = {
  // Hero / accents
  rose: '#F2A6B6',
  blush: '#FFD9DF',
  cream: '#FFF5EE',
  sand: '#F7E7D8',
  // Calmer modern complements
  plum: '#5B3A53',
  ink: '#2A1E2A',
  mist: '#FFFFFFE6',
  // Status / interaction
  primary: '#8460CB',
  primarySoft: '#B8A0E5',
  accent: '#FF6F91',
  success: '#7BB58A',
  // Surfaces
  surface: '#FFFFFF',
  surfaceMuted: '#FFF1F4',
  border: '#F0D7DD',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  button: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
};

/**
 * Font helpers — keep the playful display fonts but lean on the system
 * font for body copy so paragraphs feel modern and easy to read.
 */
export const font = {
  display: 'balqis',
  script: 'porcelain',
  serif: 'Reckless',
  bodyItalic: 'dm-sans-boldItalic',
  body: undefined,
};

export const text = {
  hero: {
    fontFamily: font.display,
    fontSize: 44,
    lineHeight: 52,
    color: palette.plum,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 28,
    lineHeight: 34,
    color: palette.plum,
  },
  subtitle: {
    fontFamily: font.script,
    fontSize: 22,
    color: palette.primary,
  },
  body: {
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 22,
    color: palette.ink,
  },
  meta: {
    fontFamily: font.body,
    fontSize: 13,
    color: palette.plum,
    opacity: 0.7,
  },
};

export default {
  palette,
  spacing,
  radii,
  shadow,
  font,
  text,
};
