#!/usr/bin/env python3
"""Write the launcher's Hyprland bindings into ~/.config/hypr/bindings.lua.

Reads ~/.config/omarchy-launcher/settings.json:
  {
    "hotkey": "SUPER + D",                       # toggles the launcher
    "commands": { "cmd:clipboard": { "hotkey": "SUPER + CTRL + V", "hotkeyTitle": "Clipboard History" } }
  }
and maintains one marker-delimited block in bindings.lua (replaced on every
run, so it never duplicates). Number-row keys are rewritten to Hyprland
keycodes (code:10..19) because Omarchy registers those by keycode.

  hotkeys.py            print the block (dry run)
  hotkeys.py --apply    write it (backup first) and reload Hyprland
  hotkeys.py --remove   drop the block
"""
import json, os, re, shutil, subprocess, sys, time

PLUGIN_ID = "io.github.hominluo.launcher"
HOME = os.path.expanduser("~")
SETTINGS = os.path.join(HOME, ".config/omarchy-launcher/settings.json")
BINDINGS = os.path.join(HOME, ".config/hypr/bindings.lua")
BEGIN = f"-- >>> {PLUGIN_ID} managed hotkeys (edit with: bash ~/.config/omarchy/plugins/{PLUGIN_ID}/setup.sh --hotkey \"...\") >>>"
END = f"-- <<< {PLUGIN_ID} managed hotkeys <<<"
KEYCODES = {"1": 10, "2": 11, "3": 12, "4": 13, "5": 14, "6": 15, "7": 16, "8": 17, "9": 18, "0": 19}


def load_settings():
    try:
        with open(SETTINGS) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def normalize_key(key):
    parts = [p.strip() for p in str(key).split("+")]
    parts = [p for p in parts if p]
    if not parts:
        return ""
    last = parts[-1]
    if last in KEYCODES:
        parts[-1] = f"code:{KEYCODES[last]}"
    elif len(last) == 1 and last.isalpha():
        parts[-1] = last.upper()
    mods = [p.upper() for p in parts[:-1]]
    return " + ".join(mods + [parts[-1]])


def lua_str(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_block(settings):
    lines = [BEGIN]
    hotkey = normalize_key(settings.get("hotkey") or "SUPER + D")
    if hotkey:
        lines.append(f"hl.unbind({lua_str(hotkey)})")
        lines.append(f"o.bind({lua_str(hotkey)}, \"Launcher\", {lua_str(f'omarchy-shell shell toggle {PLUGIN_ID}')})")
    commands = settings.get("commands") or {}
    for entry_id, cfg in sorted(commands.items()):
        if not isinstance(cfg, dict) or not cfg.get("hotkey"):
            continue
        key = normalize_key(cfg["hotkey"])
        if not key:
            continue
        title = cfg.get("hotkeyTitle") or entry_id.split(":", 1)[-1].replace("-", " ").title()
        run = f"omarchy-shell {PLUGIN_ID} run {entry_id}"
        lines.append(f"hl.unbind({lua_str(key)})")
        lines.append(f"o.bind({lua_str(key)}, {lua_str(title)}, {lua_str(run)})")
    lines.append(END)
    return "\n".join(lines)


def splice(src, block):
    if BEGIN in src and END in src:
        i = src.index(BEGIN)
        j = src.index(END, i) + len(END)
        return src[:i] + block + src[j:] if block else (src[:i].rstrip("\n") + "\n" + src[j:].lstrip("\n"))
    if not block:
        return src
    return src.rstrip("\n") + "\n\n" + block + "\n"


def main(argv):
    mode = "print"
    if "--apply" in argv:
        mode = "apply"
    elif "--remove" in argv:
        mode = "remove"
    settings = load_settings()
    block = "" if mode == "remove" else build_block(settings)
    if mode == "print":
        print(block)
        return 0
    if not os.path.exists(BINDINGS):
        print(f"hotkeys: {BINDINGS} not found", file=sys.stderr)
        return 1
    with open(BINDINGS) as f:
        src = f.read()
    out = splice(src, block)
    if out == src:
        print("hotkeys: bindings.lua already up to date")
        return 0
    shutil.copy2(BINDINGS, f"{BINDINGS}.bak.{int(time.time())}")
    with open(BINDINGS, "w") as f:
        f.write(out)
    subprocess.run(["hyprctl", "reload"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = subprocess.run(["hyprctl", "configerrors"], capture_output=True, text=True).stdout.strip()
    if errors and "No config errors" not in errors:
        print("hotkeys: Hyprland reported config errors:\n" + errors, file=sys.stderr)
        return 2
    print("hotkeys: wrote " + ("nothing" if not block else str(block.count("o.bind(")) + " binding(s)") + f" to {BINDINGS}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
