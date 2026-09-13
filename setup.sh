#!/bin/bash
# One-time setup for the Omarchy Launcher plugin. Safe to re-run.
#
#   bash ~/.config/omarchy/plugins/io.github.hominluo.launcher/setup.sh [--hotkey "SUPER + D"] [--no-hotkey]
#
# What it does:
#   1. Creates the config/state directories.
#   2. Adds a Hyprland binding that toggles the launcher (default SUPER + D),
#      inside a marker block in ~/.config/hypr/bindings.lua so re-runs replace
#      rather than duplicate it. A timestamped backup is written first.
#   3. Enables the plugin if it is not enabled yet.
set -euo pipefail

PLUGIN_ID="io.github.hominluo.launcher"
HOTKEY="SUPER + D"
WRITE_HOTKEY=1
BINDINGS="$HOME/.config/hypr/bindings.lua"
BEGIN="-- >>> $PLUGIN_ID managed hotkeys (edit with: bash ~/.config/omarchy/plugins/$PLUGIN_ID/setup.sh --hotkey \"...\") >>>"
END="-- <<< $PLUGIN_ID managed hotkeys <<<"

while (( $# > 0 )); do
  case "$1" in
    --hotkey) HOTKEY="${2:-}"; shift 2 ;;
    --no-hotkey) WRITE_HOTKEY=0; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "setup: unknown option $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$HOME/.config/omarchy-launcher" "$HOME/.local/state/omarchy-launcher" "$HOME/.local/share/omarchy-launcher"

if (( WRITE_HOTKEY )); then
  [[ -f $BINDINGS ]] || { echo "setup: $BINDINGS not found; is this an Omarchy 4 system?" >&2; exit 1; }
  block=$(printf '%s\n%s\n%s' "$BEGIN" "o.bind(\"$HOTKEY\", \"Launcher\", \"omarchy-shell shell toggle $PLUGIN_ID\")" "$END")
  cp "$BINDINGS" "$BINDINGS.bak.$(date +%s)"
  if grep -qF -- "$BEGIN" "$BINDINGS"; then
    # Replace the existing block in place.
    python3 - "$BINDINGS" "$BEGIN" "$END" "$block" <<'PY'
import sys
path, begin, end, block = sys.argv[1:5]
src = open(path).read()
i = src.index(begin); j = src.index(end, i) + len(end)
open(path, "w").write(src[:i] + block + src[j:])
PY
  else
    printf '\n%s\n' "$block" >> "$BINDINGS"
  fi
  hyprctl reload >/dev/null 2>&1 || true
  errors=$(hyprctl configerrors 2>/dev/null || true)
  if [[ -n $errors && $errors != *"No config errors"* ]]; then
    echo "setup: Hyprland reported config errors after adding the binding:" >&2
    echo "$errors" >&2
  fi
  echo "Hotkey: $HOTKEY toggles the launcher (block written to $BINDINGS)"
fi

if omarchy plugin list 2>/dev/null | grep -q "^$PLUGIN_ID .*disabled"; then
  omarchy plugin enable "$PLUGIN_ID" --after omarchy.menu >/dev/null 2>&1 || omarchy plugin enable "$PLUGIN_ID" >/dev/null 2>&1 || true
  echo "Enabled $PLUGIN_ID"
fi

echo "Done. Open with: omarchy-shell shell toggle $PLUGIN_ID"
