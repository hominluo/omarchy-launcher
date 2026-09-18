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

# settings.json is seeded once and only the hotkey is touched afterwards;
# every write goes through a temp file and a rename, never a redirect.
python3 - "$SETTINGS" "$HOTKEY" <<'PY'
import json, os, sys, tempfile
path, key = sys.argv[1:3]
data = None
try:
    with open(path) as handle:
        data = json.load(handle)
except FileNotFoundError:
    data = {"version": 1, "hotkey": "SUPER + D", "commands": {}}
except Exception as error:
    # Someone's aliases, hotkeys and favourites live in here: a file that
    # does not parse is left exactly as it is, never replaced.
    sys.stderr.write("setup: %s is not valid JSON (%s); leaving it alone\n" % (path, error))
    sys.exit(0)
if not isinstance(data, dict):
    sys.stderr.write("setup: %s is not a JSON object; leaving it alone\n" % path)
    sys.exit(0)
data.setdefault("version", 1)
data.setdefault("commands", {})
if key:
    data["hotkey"] = key
else:
    data.setdefault("hotkey", "SUPER + D")
fd, tmp = tempfile.mkstemp(prefix=".settings.json.", dir=os.path.dirname(path))
with os.fdopen(fd, "w") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
os.replace(tmp, path)
PY

if (( WRITE_HOTKEY )); then
  python3 "$PLUGIN_DIR/bin/hotkeys.py" --apply
fi

# Register the launcher as the handler for omarchy-launcher:// links (its
# own deeplinks and OAuth redirects) unless another handler exists. It is
# the only scheme the launcher handles: raycast:// links are not ours, and
# a registration from an older release is removed.
APPS_DIR="$HOME/.local/share/applications"
HANDLER="omarchy-launcher-url-handler.desktop"
mkdir -p "$APPS_DIR"
case "$PLUGIN_DIR" in
  *[\"\`\$\\]*|*$'\n'*) echo "setup: the plugin path contains characters a .desktop Exec= line cannot carry: $PLUGIN_DIR" >&2; exit 1 ;;
esac
desktop_tmp=$(mktemp "$APPS_DIR/.$HANDLER.XXXXXX")
cat > "$desktop_tmp" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Omarchy Launcher URL Handler
Exec="$PLUGIN_DIR/bin/launcher" url %u
NoDisplay=true
Terminal=false
MimeType=x-scheme-handler/omarchy-launcher;
DESKTOP
chmod 644 "$desktop_tmp"
mv -f "$desktop_tmp" "$APPS_DIR/$HANDLER"
if command -v xdg-mime >/dev/null 2>&1; then
  current=$(xdg-mime query default x-scheme-handler/omarchy-launcher 2>/dev/null || true)
  if [[ -z $current || $current == "$HANDLER" ]]; then
    xdg-mime default "$HANDLER" x-scheme-handler/omarchy-launcher 2>/dev/null || true
  fi
fi
# Drop this handler from the raycast schemes an older release registered.
python3 - "$HANDLER" "${XDG_CONFIG_HOME:-$HOME/.config}/mimeapps.list" <<'PY'
import os, re, sys, tempfile
handler, path = sys.argv[1:3]
try:
    with open(path) as fh:
        lines = fh.read().split("\n")
except FileNotFoundError:
    sys.exit(0)
changed = False
out = []
for line in lines:
    m = re.match(r"^(x-scheme-handler/(?:raycast|com\.raycast))=(.*)$", line)
    if m:
        kept = [h for h in m.group(2).split(";") if h and h != handler]
        if len(kept) != len([h for h in m.group(2).split(";") if h]):
            changed = True
            if not kept:
                continue
            line = m.group(1) + "=" + ";".join(kept) + ";"
    out.append(line)
if changed:
    fd, tmp = tempfile.mkstemp(prefix=".mimeapps.list.", dir=os.path.dirname(path) or ".")
    with os.fdopen(fd, "w") as fh:
        fh.write("\n".join(out))
    os.replace(tmp, path)
PY
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" 2>/dev/null || true

if omarchy plugin list 2>/dev/null | grep -q "^$PLUGIN_ID .*disabled"; then
  omarchy plugin enable "$PLUGIN_ID" --after omarchy.menu >/dev/null 2>&1 || omarchy plugin enable "$PLUGIN_ID" >/dev/null 2>&1 || true
  echo "Enabled $PLUGIN_ID"
fi

hotkey=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("hotkey","SUPER + D"))' "$SETTINGS" 2>/dev/null || echo "SUPER + D")
echo "Done. Press $hotkey, click the bar button, or run: omarchy-shell shell toggle $PLUGIN_ID"
