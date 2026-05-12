#!/usr/bin/env bash
# Save a screenshot from the booted iOS simulator into ./tmp/screenshots/
# so the agent can read it with the Read tool.
#
# Usage:
#   ./scripts/sim-screenshot.sh                  # auto-named, all booted devices
#   ./scripts/sim-screenshot.sh my-bug.png       # custom name (still goes to tmp/screenshots)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/tmp/screenshots"
mkdir -p "$DIR"

NAME="${1:-sim-$(date +%Y%m%d-%H%M%S).png}"
case "$NAME" in /*) OUT="$NAME" ;; *) OUT="$DIR/$NAME" ;; esac

# Get every booted device UDID (you can have more than one running)
UDIDS=$(xcrun simctl list devices booted -j | /usr/bin/python3 -c '
import json, sys
data = json.load(sys.stdin)
for runtime in data.get("devices", {}).values():
    for d in runtime:
        if d.get("state") == "Booted":
            print(d["udid"], d.get("name", ""))
')

if [ -z "$UDIDS" ]; then
  echo "No booted iOS simulator found." >&2
  exit 1
fi

# If multiple are booted and only one screenshot was requested, prefer the
# first one; print the others so you can re-run with --device explicitly.
COUNT=$(echo "$UDIDS" | wc -l | tr -d ' ')
FIRST_UDID=$(echo "$UDIDS" | head -1 | awk '{print $1}')
FIRST_NAME=$(echo "$UDIDS" | head -1 | cut -d' ' -f2-)

xcrun simctl io "$FIRST_UDID" screenshot --type=png "$OUT" >/dev/null
echo "Saved: $OUT  ($FIRST_NAME)"

if [ "$COUNT" -gt 1 ]; then
  echo "Note: $COUNT simulators are booted. Used the first one. Others:"
  echo "$UDIDS" | tail -n +2 | sed 's/^/  /'
fi
