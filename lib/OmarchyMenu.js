// Parse the Omarchy menu JSONC tree (default + user extension) into flat
// entries with breadcrumb paths, so every stock menu action is searchable
// from the launcher root and the tree can be browsed as nested lists.

function stripJsonc(raw) {
  return String(raw || "")
    .replace(/^\s*\/\/[^\n]*(\n|$)/gm, "")
    .replace(/,(\s*[}\]])/g, "$1")
}

function normalizeItem(id, raw) {
  var value = raw || {}
  var aliases = Array.isArray(value.aliases) ? value.aliases.filter(function(v) { return v }) : (typeof value.aliases === "string" && value.aliases ? [value.aliases] : [])
  var parent = value.parent
  if (parent === undefined) parent = id.indexOf(".") >= 0 ? id.split(".").slice(0, -1).join(".") : "root"
  if (id === "root") parent = ""
  var kind = value.action ? "action" : (value.target ? "link" : "menu")
  return {
    id: id, parent: parent, kind: kind,
    icon: value.icon || "", iconFont: value.iconFont || "",
    label: value.label || id, title: value.title || "",
    target: value.target || "", description: value.description || "",
    action: value.action || "", provider: value.provider || "",
    aliases: aliases, when: value.when || "", checked: value.checked || "",
    _keys: Object.keys(value)
  }
}

function parse(raw) {
  var stripped = stripJsonc(raw)
  if (!stripped.trim()) return []
  var parsed
  try { parsed = JSON.parse(stripped) } catch (e) { return [] }
  if (typeof parsed !== "object" || parsed === null) return []
  var source = (parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)) ? parsed.items : parsed
  var out = []
  for (var id in source) {
    var entry = source[id]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    out.push(normalizeItem(id, entry))
  }
  return out
}

// Merge user items over defaults (same id -> fields overridden, order kept).
function merge(defaults, user) {
  var items = {}
  var order = []
  var sources = [defaults || [], user || []]
  for (var s = 0; s < sources.length; s++) {
    for (var i = 0; i < sources[s].length; i++) {
      var e = sources[s][i]
      if (!e || !e.id) continue
      if (!items[e.id]) order.push(e.id)
      var prior = items[e.id]
      if (!prior) { items[e.id] = e; continue }
      // Override only the fields the later source actually wrote, so a user
      // entry that just changes `action` keeps the stock label and icon.
      var merged = {}
      for (var k in prior) merged[k] = prior[k]
      var keys = e._keys || Object.keys(e)
      for (var j = 0; j < keys.length; j++) if (e[keys[j]] !== undefined) merged[keys[j]] = e[keys[j]]
      merged.kind = merged.action ? "action" : (merged.target ? "link" : "menu")
      merged.id = e.id
      items[e.id] = merged
    }
  }
  return { items: items, order: order }
}

function pathFor(items, id) {
  var parts = []
  var cur = items[id]
  var guard = 0
  while (cur && cur.parent && cur.parent !== "root" && guard++ < 20) {
    var p = items[cur.parent]
    if (!p) break
    parts.unshift(p.label)
    cur = p
  }
  return parts
}

function children(items, order, parentId) {
  var out = []
  for (var i = 0; i < order.length; i++) {
    var e = items[order[i]]
    if (e && e.parent === parentId) out.push(e)
  }
  return out
}

// Every action row, with its breadcrumb, for root search.
function actions(items, order) {
  var out = []
  for (var i = 0; i < order.length; i++) {
    var e = items[order[i]]
    if (!e || e.kind !== "action") continue
    out.push({ entry: e, path: pathFor(items, e.id) })
  }
  return out
}

// ------------------------------------------------------------- visibility

function rootChildren(items, order) {
  return children(items || {}, Array.isArray(order) ? order : [], "root")
}

// `whenResults` is id -> boolean (the answer of the row's `when:` guard).
// The `{ when: bool }` records the hosts keep in guardResults are accepted
// too, so either map can be passed straight through. A missing answer means
// "not evaluated yet", which reads as visible so a row never vanishes before
// its guard has run.
function whenFailed(whenResults, id) {
  if (!whenResults) return false
  var v = whenResults[id]
  if (v === false) return true
  return !!(v && typeof v === "object" && v.when === false)
}

// Port of the stock rule (shell/plugins/menu/MenuModel.js isVisible): a row
// whose `when:` failed is hidden; actions and provider-backed menus are always
// visible; a static menu (or a link to one) shows only while some child does.
function isVisible(items, order, whenResults, entry, depth) {
  if (!entry) return false
  if (entry.when && whenFailed(whenResults, entry.id)) return false
  if (entry.kind !== "menu" && entry.kind !== "link") return true
  if (entry.provider) return true

  var guard = depth || 0
  if (guard >= 32) return false

  var target = entry.kind === "link" ? entry.target : entry.id
  var list = Array.isArray(order) ? order : []
  for (var i = 0; i < list.length; i++) {
    var child = items && items[list[i]]
    if (child && child.parent === target && isVisible(items, order, whenResults, child, guard + 1)) return true
  }
  return false
}

function visibleChildren(items, order, parentId, whenResults) {
  var kids = children(items || {}, Array.isArray(order) ? order : [], parentId)
  var out = []
  for (var i = 0; i < kids.length; i++) if (isVisible(items, order, whenResults, kids[i], 0)) out.push(kids[i])
  return out
}

// The id a menu-or-link entry lists its children under.
function childrenParentId(items, id) {
  var e = items && items[id]
  return e && e.kind === "link" && e.target ? e.target : id
}

// Labels of the first n visible children of `id` (a link contributes its own
// label, not its target's). n omitted = every visible child.
function previewLabels(items, order, id, whenResults, n) {
  var kids = visibleChildren(items, order, childrenParentId(items, id), whenResults)
  var cap = (n === undefined || n === null) ? kids.length : Math.max(0, n | 0)
  var out = []
  for (var i = 0; i < kids.length && out.length < cap; i++) out.push(kids[i].label)
  return out
}

// Subtitle for a category row: its own description when the jsonc gives one,
// else the first n child labels ("Keybindings, Omarchy, Hyprland…"), "" when
// nothing under it is visible.
function categorySubtitle(items, order, entry, whenResults, n) {
  if (!entry) return ""
  if (entry.description) return entry.description
  var cap = (n === undefined || n === null) ? 3 : Math.max(0, n | 0)
  var kids = visibleChildren(items, order, entry.kind === "link" && entry.target ? entry.target : entry.id, whenResults)
  var labels = []
  for (var i = 0; i < kids.length && i < cap; i++) labels.push(kids[i].label)
  if (!labels.length) return ""
  return labels.join(", ") + (kids.length > cap ? "…" : "")
}

// Search tokens hidden in an id: the last dot segment plus its "-" words.
// "setup.power-menu" -> ["power-menu", "power", "menu"]; "about" -> ["about"].
function idTokens(id) {
  var s = String(id || "")
  var leaf = s.indexOf(".") >= 0 ? s.slice(s.lastIndexOf(".") + 1) : s
  var out = []
  var seen = {}
  var parts = [leaf]
  var words = leaf.split("-")
  if (words.length > 1) parts = parts.concat(words)
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i] || seen[parts[i]]) continue
    seen[parts[i]] = true
    out.push(parts[i])
  }
  return out
}

// Aliases the stock menu declares for routing that are too generic to show
// as a pill on a row: they still help search, so they become keywords.
var GENERIC_ALIASES = ["app", "applications", "restart", "refresh"]

function isGenericAlias(name) {
  var n = String(name || "").toLowerCase()
  for (var i = 0; i < GENERIC_ALIASES.length; i++) if (GENERIC_ALIASES[i] === n) return true
  return false
}

function splitAliases(entry) {
  var out = { aliases: [], keywords: [] }
  var list = entry && Array.isArray(entry.aliases) ? entry.aliases : []
  for (var i = 0; i < list.length; i++) {
    if (!list[i]) continue
    if (isGenericAlias(list[i])) out.keywords.push(list[i]); else out.aliases.push(list[i])
  }
  return out
}

// `{ menu: "settings" }` deeplinks and `open(win, { menu })` take an id or an
// alias. An exact id wins; then the first entry in file order whose aliases
// carry the name (case-insensitive); "" when nothing matches.
function resolveAlias(items, order, name) {
  var raw = String(name || "").trim()
  if (!raw || !items) return ""
  if (items[raw]) return raw
  var lower = raw.toLowerCase()
  if (items[lower]) return lower
  var list = Array.isArray(order) ? order : []
  for (var i = 0; i < list.length; i++) {
    var e = items[list[i]]
    if (!e || !Array.isArray(e.aliases)) continue
    for (var j = 0; j < e.aliases.length; j++)
      if (String(e.aliases[j] || "").toLowerCase() === lower) return e.id
  }
  return ""
}

// Every visible action under `id`, depth first in file order, for the
// "Inside <Label>" search section. `path` holds the labels of the menus
// between `id` and the action (so a direct child has []); a link is followed
// into its target once and contributes its own label.
function descendants(items, order, id, whenResults) {
  var out = []
  var list = Array.isArray(order) ? order : []
  var visited = {}
  var walk = function(parentId, path, depth) {
    if (depth >= 32 || visited[parentId]) return
    visited[parentId] = true
    for (var i = 0; i < list.length; i++) {
      var e = items[list[i]]
      if (!e || e.parent !== parentId) continue
      if (!isVisible(items, order, whenResults, e, 0)) continue
      if (e.kind === "action") { out.push({ entry: e, path: path }); continue }
      if (e.kind === "menu") walk(e.id, path.concat([e.label]), depth + 1)
      else if (e.kind === "link" && e.target) walk(e.target, path.concat([e.label]), depth + 1)
    }
  }
  if (items) walk(childrenParentId(items, id), [], 0)
  return out
}

// Rows that run the same command are the same thing to the root page.
function dedupeKey(entry) {
  return entry && entry.kind === "action" ? String(entry.action || "") : ""
}

// ------------------------------------------------------------- guard batch
//
// Port of the stock batch (shell/plugins/menu/MenuModel.js guardScript): one
// bash script answers every `when:` and `checked:` at once, and the helpers
// below are what make it fast (~0.9 s for the shipped menu against ~3.5 s
// asking pacman per row). Only the reported line changed: `W <id> 1` /
// `C <id> 1`, the format the launcher's guard parsers already read.

// Commands a `checked:` expression reads a value out of. Every sibling row
// asks the same one -- Defaults > Browser has seven rows all comparing
// against `omarchy-default-browser` -- so the batch runs it once and the rows
// read the captured answer.
//
// The capture has to be eager. These are read inside `$(...)`, and a value
// cached while one expression runs lives in that subshell only, so a lazy
// memo never survives to the expression after it.
var GUARD_READERS = [
  "omarchy-channel-current",
  "omarchy-default-agent",
  "omarchy-default-browser",
  "omarchy-default-editor",
  "omarchy-default-terminal",
  "omarchy-dns"
]

// Package and command presence account for most of what the guards ask, and
// asked one at a time they are almost all fork: the shipped menu spends over
// a second on them. Answer them inside the guard process instead. These
// shadow the real commands for the batch only, so they have to agree with
// them everywhere, including for no arguments at all (present is true of
// nothing, missing is not).
//
// `pacman -Q` resolves a name through what installed packages provide, not
// just what they are called -- with gvim installed it reports `vim` as
// present -- so the set has to carry provides too, or `install.editor.vim`
// comes back and offers to install what is already there. A version
// constraint (`bash>=1`) is not a name any set can answer, so it goes to
// pacman itself; no shipped guard writes one.
//
// `pacman -Qi` wraps a long list across continuation lines whenever COLUMNS
// is set in the environment, which a login shell may well have done, so the
// parser follows the indented lines rather than reading the first one and
// dropping half of what is installed.
function guardHelpers() {
  return 'declare -A __omarchy_pkgs=()\n'
    + 'mapfile -t __omarchy_pkg_names < <({ pacman -Qq; LC_ALL=C pacman -Qi'
    + " | awk '/^[A-Za-z]/ { provides = ($0 ~ /^Provides/); sub(/^[^:]*: /, \"\") }"
    + ' provides && $0 != "None" { n = split($0, p, " ");'
    + ' for (i = 1; i <= n; i++) { sub(/[<>=].*/, "", p[i]); print p[i] } }\'; } 2>/dev/null)\n'
    + 'for __omarchy_pkg in "${__omarchy_pkg_names[@]}"; do __omarchy_pkgs[$__omarchy_pkg]=1; done\n'
    + '__omarchy_pkg_has() { [[ -n ${__omarchy_pkgs[$1]-} ]] && return 0; '
    + '[[ $1 == *[\\<\\>=]* ]] && { pacman -Q "$1" &>/dev/null; return; }; return 1; }\n'
    + 'omarchy-pkg-present() { local p; for p in "$@"; do __omarchy_pkg_has "$p" || return 1; done; return 0; }\n'
    + 'omarchy-pkg-missing() { local p; for p in "$@"; do __omarchy_pkg_has "$p" || return 0; done; return 1; }\n'
    + 'omarchy-cmd-present() { local c; for c in "$@"; do command -v "$c" &>/dev/null || return 1; done; return 0; }\n'
    + 'omarchy-cmd-missing() { local c; for c in "$@"; do command -v "$c" &>/dev/null || return 0; done; return 1; }\n'
}

function guardReaderSlot(index) {
  return "${__omarchy_read_" + index + "}"
}

// Substitute the captured answer into the expression rather than shadowing
// the reader with a function. `$(reader)` and the variable holding what it
// printed are interchangeable -- both strip trailing newlines, both split the
// same way unquoted -- while a function would also catch `command -v reader`,
// `VAR=x reader`, and every other form, and answer those wrong. Anything but
// the plain substitution is left alone to run the real command.
function guardPrelude(guards) {
  var prelude = guardHelpers()
  var text = String(guards || "")
  for (var i = 0; i < GUARD_READERS.length; i++) {
    // The guards arrive already substituted, so what marks a reader as wanted
    // is the slot standing in for it, not the call it replaced.
    if (text.indexOf(guardReaderSlot(i)) < 0) continue
    // `|| :` so a reader that exits nonzero cannot take the batch down with
    // it under a login shell that turned on errexit.
    prelude += "__omarchy_read_" + i + "=$(" + GUARD_READERS[i] + " 2>/dev/null) || :\n"
  }
  return prelude
}

function substituteGuardReaders(expression) {
  var out = String(expression || "")
  for (var i = 0; i < GUARD_READERS.length; i++)
    out = out.split("$(" + GUARD_READERS[i] + ")").join(guardReaderSlot(i))
  return out
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

// One line of the batch. `tag` is "W" for a `when:` guard, "C" for `checked:`;
// the row reports `W <id> 1` or `W <id> 0`, matching /^([WC]) (\S+) ([01])$/.
function guardLine(id, tag, expression) {
  var t = String(tag || "W").toUpperCase()
  return "if { " + substituteGuardReaders(expression) + "; } >/dev/null 2>&1; then echo "
    + shellQuote(t + " " + id + " 1") + "; else echo " + shellQuote(t + " " + id + " 0") + "; fi\n"
}

// The whole batch for `list` = [{ id, when?, checked? }] (an id -> entry map
// works too): prelude + one line per guard, or "" when nothing is guarded so
// the caller can skip spawning bash at all.
function guardScript(list) {
  var rows = []
  if (Array.isArray(list)) rows = list
  else if (list && typeof list === "object") for (var k in list) rows.push(list[k])

  var guards = ""
  for (var i = 0; i < rows.length; i++) {
    var g = rows[i]
    if (!g || !g.id) continue
    if (g.when) guards += guardLine(g.id, "W", g.when)
    if (g.checked) guards += guardLine(g.id, "C", g.checked)
  }
  return guards ? guardPrelude(guards) + guards : ""
}

if (typeof module !== "undefined") {
  module.exports = {
    stripJsonc: stripJsonc, parse: parse, merge: merge, pathFor: pathFor, children: children, actions: actions,
    rootChildren: rootChildren, isVisible: isVisible, visibleChildren: visibleChildren,
    previewLabels: previewLabels, categorySubtitle: categorySubtitle,
    idTokens: idTokens, GENERIC_ALIASES: GENERIC_ALIASES, splitAliases: splitAliases,
    resolveAlias: resolveAlias, descendants: descendants, dedupeKey: dedupeKey,
    GUARD_READERS: GUARD_READERS, guardHelpers: guardHelpers, guardPrelude: guardPrelude,
    guardReaderSlot: guardReaderSlot, substituteGuardReaders: substituteGuardReaders,
    guardLine: guardLine, guardScript: guardScript
  }
}
