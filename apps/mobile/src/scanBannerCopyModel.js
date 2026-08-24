export function scanReviewTitle({ waiting = 0, babyName = null } = {}) {
  const child = babyName || 'your little one';
  const count = Number(waiting || 0);
  return `${count.toLocaleString()} likely ${count === 1 ? 'photo is' : 'photos are'} worth a look for ${child}.`;
}

export function scanReviewCaption({ waiting = 0, babyName = null } = {}) {
  const child = babyName || 'your little one';
  return Number(waiting || 0) > 0
    ? 'Review starts with likely matches. Remove anything that does not belong; after trust is earned, clear future matches can save automatically.'
    : `Looking for likely photos of ${child}. First review builds trust before clear matches can save automatically.`;
}
