/**
 * Our Little World — design system.
 *
 * Self-contained from the legacy birthday theme. Every OLW screen pulls
 * colour, type, spacing, radius, and shadow from here so the section
 * has its own visual identity (warm editorial, not scrapbook).
 *
 * Vibe: "soft modern" — pastel cream + warm coral + deep plum, generous
 * whitespace, one elegant serif for headings, system sans for body, a
 * single script accent reserved for the brand mark.
 */

export const colors = {
  // Surfaces
  cream:        '#F8F2EB',  // app background
  parchment:    '#FBF6F0',  // alternative background for variety
  surface:      '#FFFFFF',  // cards
  surfaceMuted: '#F4ECE3',  // input fields, gentle dividers

  // Ink (text)
  ink:          '#2D1F26',
  plum:         '#5C4250',
  muted:        '#9A8A8A',
  whisper:      '#C5B5AC',

  // Accents — warm-forward
  coral:        '#E89177',
  coralSoft:    '#F8C5B3',
  rose:         '#C76E7E',
  roseSoft:     '#EBC3CB',
  gold:         '#D6A45C',
  goldSoft:     '#F0D9B0',

  // Status
  sage:         '#94B89B',
  warning:      '#D49A4A',
  danger:       '#C0392B',

  // Border / hairlines
  border:       '#EFE4D9',
  borderStrong: '#E0D0C2',

  // Overlay
  scrim:        'rgba(45, 31, 38, 0.42)',
  scrimDeep:    'rgba(45, 31, 38, 0.78)',
};

/**
 * Convenience aliases for semantic intent. Prefer these in components when
 * possible — it lets us re-tone the palette later without touching screens.
 */
export const semantic = {
  bg:           colors.cream,
  bgAlt:        colors.parchment,
  card:         colors.surface,
  cardAlt:      colors.surfaceMuted,
  text:         colors.ink,
  textSoft:     colors.plum,
  textMuted:    colors.muted,
  textWhisper:  colors.whisper,
  primary:      colors.coral,
  primarySoft:  colors.coralSoft,
  secondary:    colors.rose,
  border:       colors.border,
  borderStrong: colors.borderStrong,
};

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

/**
 * Type tokens. We use one elegant serif (Reckless) for headings, the system
 * sans for body, and a single script (Porcelain) reserved for the brand
 * mark / watermark moments.
 */
export const fonts = {
  display: 'Reckless',
  script:  'porcelain',
  body:    undefined, // system
};

export const type = {
  display: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -0.5,
    color: semantic.text,
  },
  hero: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.4,
    color: semantic.text,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    color: semantic.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    color: semantic.text,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: semantic.textSoft,
  },
  bodyTight: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: semantic.textSoft,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: semantic.textMuted,
  },
  micro: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: semantic.textMuted,
  },
  brand: {
    fontFamily: fonts.script,
    fontSize: 22,
    color: semantic.primary,
  },
};

const theme = { colors, semantic, space, radius, shadow, fonts, type };
export default theme;
