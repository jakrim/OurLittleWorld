export const TONIGHT_MEDIA_COLLAPSE_DISTANCE = 140;

export function tonightMediaHeights(viewportHeight) {
  const height = finitePositive(viewportHeight) || 844;
  return {
    expanded: clamp(Math.round(height * 0.4), 270, 410),
    collapsed: clamp(Math.round(height * 0.21), 160, 210),
  };
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
