// Application index helpers shared by Service.qml. Mirrors what the shell's
// own launcher does with DesktopEntries so apps rank and look the same here.

function normalizeDesktopId(id) {
  var value = String(id || "").trim()
  if (value.slice(-8) === ".desktop") value = value.slice(0, -8)
  return value
}

// Parse a newline-separated list of desktop ids into a lookup map.
function parseIdList(rawText) {
  var out = {}
  var lines = String(rawText || "").split(/\n/)
  for (var i = 0; i < lines.length; i++) {
    var id = normalizeDesktopId(lines[i])
    if (id.length > 0) out[id] = true
  }
  return out
}

// Shell command that lists app/device icon files across XDG icon dirs, SVGs
// first so the first hit per name prefers scalable icons. Paths live in bash
// arrays: "$HOME" may contain spaces, and word-splitting a joined string
// would split one directory into several.
function iconIndexScanCommand() {
  return [
    'dirs=("$HOME/.icons" "$HOME/.local/share/icons");',
    'IFS=":" read -r -a xdg <<< "${XDG_DATA_DIRS:-/usr/local/share:/usr/share}";',
    'for d in "${xdg[@]}"; do [[ -n $d ]] && dirs+=("$d/icons"); done;',
    'for ext in svg png; do',
    '  for base in "${dirs[@]}"; do',
    '    [[ -d $base ]] && find "$base" \\( -path "*/apps/*" -o -path "*/devices/*" \\) -name "*.$ext" 2>/dev/null;',
    '  done;',
    '  find /usr/share/pixmaps -maxdepth 1 -name "*.$ext" 2>/dev/null;',
    'done'
  ].join(' ')
}

function iconNameFromPath(path) {
  var value = String(path || "").trim()
  if (!value) return ""
  var slash = value.lastIndexOf("/")
  var file = slash >= 0 ? value.slice(slash + 1) : value
  var dot = file.lastIndexOf(".")
  return dot > 0 ? file.slice(0, dot) : file
}

// Rank icon files that share a name so the index keeps the sharpest one
// (Steam's 16x16 PNG otherwise wins over its 256x256 copy and looks blurry
// when a launcher draws it at 22px). Scalable icons beat every raster; among
// rasters the largest size declared in the path wins, HiDPI variants
// included (".../256x256/apps/x.png", ".../24x24@2x/apps/x.png"). A
// size-less path scores 0, so the first hit still wins between those.
function iconRank(path) {
  var value = String(path || "").trim().toLowerCase()
  if (!value) return 0
  if (value.slice(-4) === ".svg") return 1e12
  var best = 0
  var re = /(?:^|\/)(\d+)x(\d+)(?:@(\d+(?:\.\d+)?)x?)?(?=\/|$)/g
  var match
  while ((match = re.exec(value)) !== null) {
    var scale = match[3] ? parseFloat(match[3]) : 1
    var area = parseInt(match[1], 10) * parseInt(match[2], 10) * scale * scale
    if (area > best) best = area
  }
  return best
}

function listToArray(list) {
  var out = []
  if (!list) return out
  try {
    var n = list.length
    for (var i = 0; i < n; i++) out.push(String(list[i]))
  } catch (e) {}
  return out
}

if (typeof module !== "undefined") {
  module.exports = { normalizeDesktopId: normalizeDesktopId, parseIdList: parseIdList, iconIndexScanCommand: iconIndexScanCommand, iconNameFromPath: iconNameFromPath, iconRank: iconRank, listToArray: listToArray }
}
