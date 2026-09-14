#!/bin/bash
# wm.sh <action> [arg]
# Window-management actions on the focused Hyprland window. Placement actions
# float the window and size it against the focused monitor's work area (the
# area left after the bar and other reserved layers), inset by the outer gap
# so a placed window sits where a tiled one would.
set -euo pipefail

action="${1:-}"
arg="${2:-}"
[[ -n $action ]] || { echo "usage: wm.sh <action> [arg]" >&2; exit 1; }

d() { hyprctl dispatch "$@" >/dev/null; }

# Geometry of the focused window before a placement, so "Restore Previous
# Size" can put it back (one slot per window address, in the runtime dir).
state_dir="${XDG_RUNTIME_DIR:-/tmp}/omarchy-launcher/wm"
save_geometry() {
  local win
  win=$(hyprctl -j activewindow 2>/dev/null) || return 0
  local addr
  addr=$(jq -r '.address // empty' <<<"$win")
  [[ -n $addr ]] || return 0
  mkdir -p "$state_dir"
  jq -c '{floating: .floating, at: .at, size: .size}' <<<"$win" >"$state_dir/${addr#0x}.json"
}
restore_geometry() {
  local addr
  addr=$(hyprctl -j activewindow 2>/dev/null | jq -r '.address // empty')
  [[ -n $addr && -f "$state_dir/${addr#0x}.json" ]] || { echo "wm.sh: nothing to restore" >&2; exit 1; }
  local floating x y w h
  read -r floating x y w h < <(jq -r '[.floating, .at[0], .at[1], .size[0], .size[1]] | @sh' "$state_dir/${addr#0x}.json" | tr -d "'")
  if [[ $floating == "true" ]]; then
    hyprctl --batch "dispatch setfloating; dispatch resizeactive exact $w $h; dispatch moveactive exact $x $y" >/dev/null
  else
    d settiled
  fi
  rm -f "$state_dir/${addr#0x}.json"
}

case "$action" in
  fullscreen)        d fullscreen 0; exit ;;
  maximize-tiled)    d fullscreen 1; exit ;;
  tile)              d settiled; exit ;;
  toggle-float)      d togglefloating; exit ;;
  pin)               d pin; exit ;;
  next-display)      d movewindow mon:+1; d focusmonitor +1; exit ;;
  prev-display)      d movewindow mon:-1; d focusmonitor -1; exit ;;
  workspace)         d movetoworkspace "$arg"; exit ;;
  workspace-silent)  d movetoworkspacesilent "$arg"; exit ;;
  workspace-next)    d movetoworkspace r+1; exit ;;
  workspace-prev)    d movetoworkspace r-1; exit ;;
  switch-next)       d workspace r+1; exit ;;
  switch-prev)       d workspace r-1; exit ;;
  move-up)           save_geometry; d setfloating; d moveactive 0 -50; exit ;;
  move-down)         save_geometry; d setfloating; d moveactive 0 50; exit ;;
  move-left)         save_geometry; d setfloating; d moveactive -50 0; exit ;;
  move-right)        save_geometry; d setfloating; d moveactive 50 0; exit ;;
  restore)           restore_geometry; exit ;;
  scratchpad)        d movetoworkspacesilent special:scratchpad; exit ;;
  close)             d killactive; exit ;;
  close-others)
    active=$(hyprctl -j activewindow | jq -r '.address // empty')
    hyprctl -j clients | jq -r --arg a "$active" '.[] | select(.address != $a and .mapped == true) | .address' |
      while read -r addr; do hyprctl dispatch closewindow "address:$addr" >/dev/null; done
    exit ;;
esac

mon=$(hyprctl -j monitors | jq -c '.[] | select(.focused == true)')
[[ -n $mon ]] || mon=$(hyprctl -j monitors | jq -c '.[0]')
read -r mx my mw mh scale r0 r1 r2 r3 < <(jq -r '[.x, .y, .width, .height, .scale, .reserved[0], .reserved[1], .reserved[2], .reserved[3]] | @sh' <<<"$mon" | tr -d "'")
gap=$(hyprctl -j getoption general:gaps_out | jq -r '(.css // .custom // "10") | tostring | split(" ")[0]')
gap=${gap%.*}

# Work area in logical pixels (moveactive/resizeactive exact take logical coords).
ax=$(awk -v x="$mx" -v r="$r0" -v g="$gap" 'BEGIN{printf "%d", x + r + g}')
ay=$(awk -v y="$my" -v r="$r1" -v g="$gap" 'BEGIN{printf "%d", y + r + g}')
aw=$(awk -v w="$mw" -v s="$scale" -v l="$r0" -v r="$r2" -v g="$gap" 'BEGIN{printf "%d", w/s - l - r - 2*g}')
ah=$(awk -v h="$mh" -v s="$scale" -v t="$r1" -v b="$r3" -v g="$gap" 'BEGIN{printf "%d", h/s - t - b - 2*g}')

place() { # x y w h  (fractions of the work area)
  local fx=$1 fy=$2 fw=$3 fh=$4
  local x y w h
  save_geometry
  x=$(awk -v a="$ax" -v w="$aw" -v f="$fx" -v g="$gap" 'BEGIN{printf "%d", a + w*f + (f>0 ? g/2 : 0)}')
  y=$(awk -v a="$ay" -v h="$ah" -v f="$fy" -v g="$gap" 'BEGIN{printf "%d", a + h*f + (f>0 ? g/2 : 0)}')
  w=$(awk -v w="$aw" -v f="$fw" -v g="$gap" 'BEGIN{printf "%d", w*f - (f<1 ? g/2 : 0)}')
  h=$(awk -v h="$ah" -v f="$fh" -v g="$gap" 'BEGIN{printf "%d", h*f - (f<1 ? g/2 : 0)}')
  hyprctl --batch "dispatch setfloating; dispatch resizeactive exact $w $h; dispatch moveactive exact $x $y" >/dev/null
}

place_abs() { # w h (logical), centered
  local w=$1 h=$2
  save_geometry
  (( w > aw )) && w=$aw
  (( h > ah )) && h=$ah
  local x y
  x=$(( ax + (aw - w) / 2 ))
  y=$(( ay + (ah - h) / 2 ))
  hyprctl --batch "dispatch setfloating; dispatch resizeactive exact $w $h; dispatch moveactive exact $x $y" >/dev/null
}

case "$action" in
  left-half)        place 0 0 0.5 1 ;;
  right-half)       place 0.5 0 0.5 1 ;;
  top-half)         place 0 0 1 0.5 ;;
  bottom-half)      place 0 0.5 1 0.5 ;;
  top-left)         place 0 0 0.5 0.5 ;;
  top-right)        place 0.5 0 0.5 0.5 ;;
  bottom-left)      place 0 0.5 0.5 0.5 ;;
  bottom-right)     place 0.5 0.5 0.5 0.5 ;;
  first-third)      place 0 0 0.3333 1 ;;
  center-third)     place 0.3333 0 0.3333 1 ;;
  last-third)       place 0.6667 0 0.3333 1 ;;
  first-two-thirds) place 0 0 0.6667 1 ;;
  last-two-thirds)  place 0.3333 0 0.6667 1 ;;
  maximize)         place 0 0 1 1 ;;
  almost-maximize)  place 0.05 0.05 0.9 0.9 ;;
  center-half)      place 0.25 0.25 0.5 0.5 ;;
  center-two-thirds) place 0.1667 0.1667 0.6667 0.6667 ;;
  reasonable-size)  place_abs 1200 800 ;;
  center)
    # keep the current size, move to the middle of the work area
    save_geometry
    read -r cw ch < <(hyprctl -j activewindow | jq -r '.size | @sh' | tr -d "'")
    x=$(( ax + (aw - cw) / 2 )); y=$(( ay + (ah - ch) / 2 ))
    hyprctl --batch "dispatch setfloating; dispatch moveactive exact $x $y" >/dev/null ;;
  maximize-height)
    # keep x and width, span the work area vertically
    save_geometry
    read -r cx cy cw ch < <(hyprctl -j activewindow | jq -r '[.at[0], .at[1], .size[0], .size[1]] | @sh' | tr -d "'")
    hyprctl --batch "dispatch setfloating; dispatch resizeactive exact $cw $ah; dispatch moveactive exact $cx $ay" >/dev/null ;;
  maximize-width)
    save_geometry
    read -r cx cy cw ch < <(hyprctl -j activewindow | jq -r '[.at[0], .at[1], .size[0], .size[1]] | @sh' | tr -d "'")
    hyprctl --batch "dispatch setfloating; dispatch resizeactive exact $aw $ch; dispatch moveactive exact $ax $cy" >/dev/null ;;
  *) echo "wm.sh: unknown action $action" >&2; exit 1 ;;
esac
