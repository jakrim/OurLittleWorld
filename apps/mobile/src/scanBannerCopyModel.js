export function scanReviewTitle({ waiting = 0, babyName = null } = {}) {
  const child = babyName || 'your little one';
  const count = Number(waiting || 0);
  return `${count.toLocaleString()} new ${count === 1 ? 'photo looks' : 'photos look'} like ${child} — take a look.`;
}

export function scanReviewCaption({ waiting = 0, babyName = null } = {}) {
  const child = babyName || 'your little one';
  return Number(waiting || 0) > 0
    ? "They'll wait for your okay before joining the vault."
    : `Looking for photos that look like ${child}.`;
}
