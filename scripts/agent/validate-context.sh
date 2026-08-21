#!/usr/bin/env bash
set -euo pipefail
if ! command -v rg >/dev/null 2>&1; then
  printf 'Context validation requires ripgrep (rg); refusing to skip guidance checks.\n' >&2
  exit 1
fi
root="${1:-.}"; failures=0; files=()
while IFS= read -r file; do files+=("$file"); done < <(find "$root" \( -path '*/node_modules' -o -path '*/vendor' -o -path '*/.git' -o -path '*/build' -o -path '*/dist' \) -prune -o \( -name AGENTS.md -o -name CLAUDE.md \) -type f -print | sort)
if [[ "${#files[@]}" -eq 0 ]]; then printf 'No AGENTS.md or CLAUDE.md files found.\n' >&2; exit 1; fi
volatile='(Expo( SDK)?|React Native|Laravel|Next\.js|TypeScript|React)[[:space:]]+([~^<>=[:space:]]*)?[0-9]+([.][0-9]+)*|Last [Uu]pdated|Snapshot date:|current-product-state\.md|[Cc]urrent branch( is|:)|[Ww]ork from `[^`]+` branch'
if rg -n "$volatile" "${files[@]}"; then printf 'Durable agent guidance contains volatile facts. Discover versions, branches, and current state from source and Git instead.\n' >&2; failures=1; fi
secret_like='(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|sntrys_[0-9A-Za-z_-]{16,})'
if rg -n "$secret_like" "${files[@]}"; then printf 'Agent guidance contains a secret-looking value. Keep only variable/profile/location names.\n' >&2; failures=1; fi
for file in "${files[@]}"; do lines="$(wc -l < "$file" | tr -d ' ')"; [[ "$(basename "$file")" == CLAUDE.md && "$lines" -gt 40 ]] && { printf '%s is %s lines; CLAUDE.md must be a short bridge to AGENTS.md.\n' "$file" "$lines" >&2; failures=1; }; [[ "$(basename "$file")" == AGENTS.md && "$lines" -gt 180 ]] && { printf '%s is %s lines; move focused procedures to runbooks.\n' "$file" "$lines" >&2; failures=1; }; done
[[ "$failures" -eq 0 ]] || exit 1
printf 'Context validation passed for %s file(s).\n' "${#files[@]}"
