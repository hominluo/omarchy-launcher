#!/bin/bash
# paste.sh [--type] <text>
# Put <text> on the clipboard and paste it into the focused window. Default
# is Shift+Insert (what Omarchy's own clipboard/emoji paste does; keeps the
# text on the clipboard afterwards). --type sends the text as key events for
# apps that ignore Shift+Insert. A short delay lets the launcher overlay
# close and focus return to the app underneath.
mode=insert
if [[ ${1:-} == --type ]]; then mode=type; shift; fi
text="${1-}"
[[ -n $text ]] || exit 0
sleep 0.15
if [[ $mode == type ]]; then
  wtype -- "$text" 2>/dev/null || true
else
  printf '%s' "$text" | wl-copy
  sleep 0.05
  wtype -M shift -k Insert -m shift 2>/dev/null || true
fi
