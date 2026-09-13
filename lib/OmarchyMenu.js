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

if (typeof module !== "undefined") {
  module.exports = { stripJsonc: stripJsonc, parse: parse, merge: merge, pathFor: pathFor, children: children, actions: actions }
}
