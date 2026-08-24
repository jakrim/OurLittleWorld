export function countLabel(value, singular, plural = `${singular}s`) {
  return Number(value) === 1 ? singular : plural;
}
