#!/usr/bin/env bash
set -euo pipefail

# Read-only inventory for a repository or a directory containing repositories.
# It never prunes, switches branches, stages files, or changes a worktree.

inspect_repo() {
  local candidate="$1"
  local root
  if ! root="$(git -C "$candidate" rev-parse --show-toplevel 2>/dev/null)"; then return 1; fi
  printf '\nRepository: %s\n' "$root"
  git -C "$root" status --short --branch
  printf 'Remotes:\n'; git -C "$root" remote -v | awk '!seen[$0]++'
  printf 'Worktrees:\n'; git -C "$root" worktree list --porcelain
  while IFS= read -r worktree; do
    if [[ -d "$worktree" ]]; then printf 'Worktree status: %s\n' "$worktree"; git -C "$worktree" status --short --branch
    else printf 'Missing worktree path: %s (eligible only for git worktree prune metadata cleanup)\n' "$worktree"; fi
  done < <(git -C "$root" worktree list --porcelain | sed -n 's/^worktree //p')
}

targets=("${@:-.}"); found=0
for target in "${targets[@]}"; do
  if inspect_repo "$target"; then found=1; continue; fi
  while IFS= read -r git_dir; do inspect_repo "$(dirname "$git_dir")"; found=1; done < <(find "$target" -mindepth 2 -maxdepth 3 -name .git -print 2>/dev/null | sort)
done
if [[ "$found" -eq 0 ]]; then printf 'No Git repository found under the supplied path(s).\n' >&2; exit 1; fi
