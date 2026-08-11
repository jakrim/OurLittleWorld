export const TONIGHT_MEDIA_COLLAPSE_DISTANCE = 140;

export const TONIGHT_REVIEW_COPY = Object.freeze({
  noteLabel: 'Add a note (optional)',
  collectionCaption: 'Selected collections are added when you Keep.',
  anotherLabel: 'Another',
  retryKeep: 'This memory didn’t finish saving. Retry Keep before moving on.',
});

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
