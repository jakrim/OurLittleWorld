export function shouldCommitRitualHomeRefresh({ startedRevision, currentRevision }) {
  return Number(startedRevision || 0) === Number(currentRevision || 0);
}
