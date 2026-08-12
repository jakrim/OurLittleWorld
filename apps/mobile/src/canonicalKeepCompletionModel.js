/**
 * Runs local post-Keep reconciliation only after canonical publication resolves.
 * A local asset mapping can exist before `save` resolves, so it is never used as
 * the success boundary for candidate or home state.
 */
export async function completeCanonicalKeep({ save, reconcileCandidate, invalidateHome }) {
  if (typeof save !== 'function') throw new Error('A canonical Keep save is required');

  const saved = await save();
  const localTasks = [];
  if (typeof reconcileCandidate === 'function') {
    localTasks.push(Promise.resolve().then(() => reconcileCandidate(saved)));
  }
  if (typeof invalidateHome === 'function') {
    localTasks.push(Promise.resolve().then(() => invalidateHome(saved)));
  }
  await Promise.all(localTasks);
  return saved;
}
