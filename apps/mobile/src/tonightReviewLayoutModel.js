export const TONIGHT_MEDIA_COLLAPSE_DISTANCE = 140;

export function tonightMediaHeights(viewportHeight) {
  const height = finitePositive(viewportHeight) || 844;
  return {
    expanded: clamp(Math.round(height * 0.52), 340, 520),
    collapsed: clamp(Math.round(height * 0.22), 170, 240),
  };
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
