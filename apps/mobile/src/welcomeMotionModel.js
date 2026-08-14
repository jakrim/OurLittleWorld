// Keep the welcome illustration meaningful at rest. Progress zero makes every
// streamed detail transparent, which reads as a broken blank card and leaves
// Reduce Motion users with no illustration at all.
export const WELCOME_ART_CYCLE_START = 0.24;
export const WELCOME_ART_REDUCED_MOTION_PROGRESS = 1;

export function welcomeArtRestingProgress({ reducedMotion = false } = {}) {
  return reducedMotion
    ? WELCOME_ART_REDUCED_MOTION_PROGRESS
    : WELCOME_ART_CYCLE_START;
}
