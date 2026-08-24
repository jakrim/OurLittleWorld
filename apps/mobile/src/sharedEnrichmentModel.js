export const SHARED_ANNOTATION_EXPORT_LIMIT = 5000;
export const SHARED_ANNOTATION_EXPORT_PAGE_SIZE = 500;

export function sharedAnnotationExportRanges({
  limit = SHARED_ANNOTATION_EXPORT_LIMIT,
  pageSize = SHARED_ANNOTATION_EXPORT_PAGE_SIZE,
} = {}) {
  const safeLimit = Math.min(
    SHARED_ANNOTATION_EXPORT_LIMIT,
    Math.max(0, Math.floor(Number(limit) || 0)),
  );
  const safePageSize = Math.min(
    SHARED_ANNOTATION_EXPORT_PAGE_SIZE,
    Math.max(1, Math.floor(Number(pageSize) || SHARED_ANNOTATION_EXPORT_PAGE_SIZE)),
  );
  const ranges = [];
  for (let offset = 0; offset < safeLimit; offset += safePageSize) {
    ranges.push({
      from: offset,
      to: Math.min(safeLimit, offset + safePageSize) - 1,
      take: Math.min(safePageSize, safeLimit - offset),
    });
  }
  return ranges;
}
