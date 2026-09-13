#!/bin/bash
# One-time setup for the Omarchy Launcher plugin. Safe to re-run.
#
#   bash ~/.config/omarchy/plugins/io.github.hominluo.launcher/setup.sh [--hotkey "SUPER + D"] [--no-hotkey]
#
# 1. Creates the config/state directories and a settings.json if missing.
# 2. Records the launcher hotkey (default SUPER + D) in settings.json and
#    writes the managed binding block into ~/.config/hypr/bindings.lua
#    (bin/hotkeys.py; a timestamped backup of the file is written first).
# 3. Enables the plugin if it is not enabled yet.
set -euo pipefail

PLUGIN_ID="io.github.hominluo.launcher"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.config/omarchy-launcher"
SETTINGS="$CONFIG_DIR/settings.json"
HOTKEY=""
WRITE_HOTKEY=1

while (( $# > 0 )); do
  case "$1" in
    --hotkey) HOTKEY="${2:-}"; shift 2 ;;
    --no-hotkey) WRITE_HOTKEY=0; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "setup: unknown option $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$CONFIG_DIR" "$HOME/.local/state/omarchy-launcher" "$HOME/.local/share/omarchy-launcher"
[[ -f $SETTINGS ]] || printf '{\n  "version": 1,\n  "hotkey": "SUPER + D",\n  "commands": {}\n}\n' > "$SETTINGS"

if [[ -n $HOTKEY ]]; then
  python3 - "$SETTINGS" "$HOTKEY" <<'PY'
import json, sys
path, key = sys.argv[1:3]
try:
    data = json.load(open(path))
except Exception:
    data = {}
data["version"] = 1
data["hotkey"] = key
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
fi

if (( WRITE_HOTKEY )); then
  python3 "$PLUGIN_DIR/bin/hotkeys.py" --apply
fi

if omarchy plugin list 2>/dev/null | grep -q "^$PLUGIN_ID .*disabled"; then
  omarchy plugin enable "$PLUGIN_ID" --after omarchy.menu >/dev/null 2>&1 || omarchy plugin enable "$PLUGIN_ID" >/dev/null 2>&1 || true
  echo "Enabled $PLUGIN_ID"
fi

hotkey=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("hotkey","SUPER + D"))' "$SETTINGS" 2>/dev/null || echo "SUPER + D")
echo "Done. Press $hotkey, click the bar button, or run: omarchy-shell shell toggle $PLUGIN_ID"
