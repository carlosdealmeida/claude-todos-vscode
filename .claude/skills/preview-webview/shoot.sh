#!/usr/bin/env bash
# Screenshot a URL with headless Chrome/Edge. Assumes the Vite dev server is
# already running (start it separately with the Bash tool + run_in_background,
# then stop it with TaskStop — that survives across turns and cleans up).
#
# Usage: shoot.sh <url> <output.png> [window-size]
#   shoot.sh http://localhost:5174/preview.html c:/tmp/preview.png 400,1080
set -euo pipefail

URL="${1:?usage: shoot.sh <url> <output.png> [window-size]}"
OUT="${2:?usage: shoot.sh <url> <output.png> [window-size]}"
WIN="${3:-400,1080}"

CHROME=""
for c in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "$LOCALAPPDATA/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; do
  [ -x "$c" ] && CHROME="$c" && break
done
[ -z "$CHROME" ] && { echo "No Chrome/Edge found — install one or edit shoot.sh"; exit 1; }

mkdir -p "$(dirname "$OUT")"

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size="$WIN" \
  --virtual-time-budget=4000 --screenshot="$OUT" "$URL" 2>&1 | tail -1
echo "wrote $OUT"
