export const ARCHIVE_PAGE_SIZE = 500;

export function archivePageRanges(limit, pageSize = ARCHIVE_PAGE_SIZE) {
  const safeLimit = Math.max(0, Math.floor(Number(limit || 0)));
  const safePageSize = Math.max(1, Math.floor(Number(pageSize || ARCHIVE_PAGE_SIZE)));
  const ranges = [];
  for (let offset = 0; offset < safeLimit; offset += safePageSize) {
    const take = Math.min(safePageSize, safeLimit - offset);
    ranges.push({
      offset,
      take,
      from: offset,
      to: offset + take - 1,
    });
  }
  return ranges;
}
