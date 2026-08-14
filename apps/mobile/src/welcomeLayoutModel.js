export const WELCOME_ACCESSIBLE_FONT_SCALE = 1.1;

export function shouldUseAccessibleWelcomeLayout({ fontScale = 1 } = {}) {
  return Number.isFinite(fontScale) && fontScale >= WELCOME_ACCESSIBLE_FONT_SCALE;
}

export function welcomeSlideAccessibilityLabel({ slide, index, total } = {}) {
  if (!slide || !Number.isInteger(index) || !Number.isInteger(total) || total < 1) return '';
  const title = String(slide.title || '').replace(/\s*\n\s*/g, ' ').trim();
  return [
    `Slide ${index + 1} of ${total}.`,
    String(slide.eyebrow || '').trim(),
    title,
    String(slide.body || '').trim(),
  ].filter(Boolean).join(' ');
}
