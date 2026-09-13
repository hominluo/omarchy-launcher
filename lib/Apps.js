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
// first so the first hit per name prefers scalable icons.
function iconIndexScanCommand() {
  return [
    'dirs="$HOME/.icons $HOME/.local/share/icons";',
    'IFS=":"; for d in ${XDG_DATA_DIRS:-/usr/local/share:/usr/share}; do dirs="$dirs $d/icons"; done; unset IFS;',
    'for ext in svg png; do',
    '  for base in $dirs; do',
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
  module.exports = { normalizeDesktopId: normalizeDesktopId, parseIdList: parseIdList, iconIndexScanCommand: iconIndexScanCommand, iconNameFromPath: iconNameFromPath, listToArray: listToArray }
}
