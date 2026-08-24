export function familyOnboardingSurfaceStyle(theme) {
  return { backgroundColor: theme.semantic.bg };
}

export function glassButtonIconColor(theme) {
  return theme.colors.ink;
}

export function referenceDiscoveryPanelStyle(theme) {
  return {
    frame: {
      backgroundColor: theme.semantic.cardAlt,
      borderColor: theme.semantic.border,
    },
    progressColor: theme.semantic.primary,
  };
}

export function welcomeCardStyle(theme) {
  return {
    backgroundColor: theme.semantic.card,
    borderColor: theme.semantic.border,
    titleColor: theme.semantic.text,
    bodyColor: theme.semantic.textSoft,
    captionColor: theme.semantic.textMuted,
  };
}
