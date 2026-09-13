// The JSON view model shared by built-in commands and the extension runtime.
// The QML renderers consume the normalized shape produced here and nothing
// else, so every producer goes through normalizeView().

var viewSerial = 0
var viewSalt = Math.floor(Math.random() * 1e6).toString(36)

function nextId(prefix) {
  viewSerial += 1
  return (prefix || "v") + viewSalt + "-" + viewSerial
}

function str(v) { return v === undefined || v === null ? "" : String(v) }

// Icon spec -> { kind, value }.
//   { kind: "app", value: "<icon-name>" }   app icon via the shell app library
//   { kind: "glyph", value: "󰘳" }           Nerd Font glyph
//   { kind: "emoji", value: "🚀" }
//   { kind: "image", value: "file:///..." }  any Image source
//   "🚀" | "󰘳" | "file:///..." | "https://..." strings are classified.
function iconSpec(icon) {
  if (!icon) return null
  if (typeof icon === "object") {
    if (icon.kind && icon.value !== undefined) return { kind: String(icon.kind), value: String(icon.value), tint: icon.tint || "", mask: icon.mask || "" }
    if (icon.source !== undefined) {
      var inner = iconSpec(icon.source)
      if (!inner) return iconSpec(icon.fallback)
      inner.tint = icon.tint || icon.tintColor || ""
      inner.mask = icon.mask || ""
      return inner
    }
    return null
  }
  var s = String(icon)
  if (!s) return null
  if (s.indexOf("icon://") === 0) return { kind: "raycast-icon", value: s.slice(7), tint: "", mask: "" }
  if (s.indexOf("file-icon://") === 0) return { kind: "glyph", value: "󰈤", tint: "", mask: "" }
  if (/^(file|https?|image|data):/.test(s) || s.charAt(0) === "/") return { kind: "image", value: s, tint: "", mask: "" }
  var cp = s.codePointAt(0)
  // Nerd Font private-use ranges.
  if ((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0x10FFFF)) return { kind: "glyph", value: s, tint: "", mask: "" }
  return { kind: "emoji", value: s, tint: "", mask: "" }
}

// Raycast colour names -> hex; theme roles are resolved by the renderer.
var RAYCAST_COLORS = { "raycast-red": "#e06c75", "raycast-green": "#98c379", "raycast-blue": "#61afef", "raycast-yellow": "#e5c07b", "raycast-magenta": "#e06c9f", "raycast-orange": "#d19a66", "raycast-purple": "#c678dd" }
function colorValue(v, foreground) {
  var s = String(v || "")
  if (!s) return ""
  if (RAYCAST_COLORS[s]) return RAYCAST_COLORS[s]
  if (s === "raycast-primary-text") return foreground || ""
  if (s === "raycast-secondary-text") return ""
  return s
}

function normalizeAction(a, index) {
  if (!a) return null
  return {
    id: str(a.id || ("a" + index)),
    title: str(a.title),
    icon: a.icon || null,
    style: a.style === "destructive" ? "destructive" : "regular",
    shortcut: a.shortcut || null,
    kind: str(a.kind || "callback"),
    payload: a.payload || null,
    callbackId: a.callbackId ? str(a.callbackId) : "",
    autoFocus: a.autoFocus === true,
    run: typeof a.run === "function" ? a.run : null
  }
}

function normalizeActions(panel) {
  if (!panel) return null
  var sections = []
  var raw = panel.sections || (panel.actions ? [{ actions: panel.actions }] : [])
  for (var i = 0; i < raw.length; i++) {
    var acts = []
    var list = raw[i].actions || []
    for (var j = 0; j < list.length; j++) {
      var a = normalizeAction(list[j], sections.length * 100 + j)
      if (a) acts.push(a)
    }
    if (acts.length) sections.push({ title: str(raw[i].title), actions: acts })
  }
  return { title: str(panel.title), sections: sections }
}

function normalizeItem(item, index) {
  return {
    id: str(item.id || ("i" + index)),
    title: str(item.title),
    subtitle: str(item.subtitle),
    icon: item.icon || null,
    content: item.content || null,
    keywords: item.keywords || [],
    accessories: item.accessories || [],
    detail: item.detail || null,
    quickLook: item.quickLook || null,
    actions: normalizeActions(item.actions),
    data: item.data || null
  }
}

function normalizeSections(view) {
  var sections = []
  var raw = view.sections || (view.items ? [{ items: view.items }] : [])
  var n = 0
  for (var i = 0; i < raw.length; i++) {
    var items = []
    var list = raw[i].items || []
    for (var j = 0; j < list.length; j++) {
      items.push(normalizeItem(list[j], n))
      n += 1
    }
    sections.push({ id: str(raw[i].id || ("s" + i)), title: str(raw[i].title), subtitle: str(raw[i].subtitle), items: items })
  }
  return sections
}

function normalizeView(view) {
  if (!view) return null
  var out = {
    id: str(view.id || nextId("view")),
    type: str(view.type || "list"),
    navigationTitle: str(view.navigationTitle),
    isLoading: view.isLoading === true,
    actions: normalizeActions(view.actions)
  }
  if (out.type === "list" || out.type === "grid") {
    out.searchBarPlaceholder = str(view.searchBarPlaceholder || "Search…")
    out.searchText = str(view.searchText)
    out.filtering = view.filtering !== false
    out.throttle = view.throttle === true
    out.isShowingDetail = view.isShowingDetail === true
    out.sections = normalizeSections(view)
    out.emptyView = view.emptyView || null
    out.selectedItemId = str(view.selectedItemId)
    out.searchBarAccessory = view.searchBarAccessory || null
    out.pagination = view.pagination || null
    out.handlers = view.handlers || {}
  }
  if (out.type === "grid") {
    out.columns = Math.max(1, Math.min(12, Number(view.columns) || 5))
    out.aspectRatio = str(view.aspectRatio || "1")
    out.inset = str(view.inset || "small")
    out.fit = str(view.fit || "contain")
  }
  if (out.type === "detail") {
    out.markdown = str(view.markdown)
    out.metadata = view.metadata || []
  }
  if (out.type === "form") {
    out.fields = view.fields || []
    out.enableDrafts = view.enableDrafts === true
  }
  return out
}

// Flatten a list view into renderable rows. Section headers are expressed
// through the `section` field so a ListView section delegate can draw them.
function flattenList(view, filter) {
  var rows = []
  if (!view || !view.sections) return rows
  var q = filter ? String(filter).toLowerCase().trim() : ""
  for (var i = 0; i < view.sections.length; i++) {
    var sec = view.sections[i]
    for (var j = 0; j < sec.items.length; j++) {
      var it = sec.items[j]
      if (q && view.filtering && !itemMatches(it, q)) continue
      var ic = iconSpec(it.icon)
      rows.push({
        itemId: it.id,
        sectionId: sec.id,
        sectionTitle: sec.title,
        title: it.title,
        subtitle: it.subtitle,
        iconKind: ic ? ic.kind : "",
        iconValue: ic ? ic.value : "",
        accessoryText: accessoryText(it.accessories),
        accessoryIcon: accessoryIconValue(it.accessories),
        accessoryColor: accessoryColor(it.accessories),
        hasActions: !!(it.actions && it.actions.sections.length)
      })
    }
  }
  return rows
}

function itemMatches(item, q) {
  var hay = [item.title, item.subtitle].concat(item.keywords || []).join(" ").toLowerCase()
  var terms = q.split(/\s+/)
  for (var i = 0; i < terms.length; i++) if (terms[i] && hay.indexOf(terms[i]) < 0) return false
  return true
}

function accessoryText(list) {
  if (!list || !list.length) return ""
  var parts = []
  for (var i = 0; i < list.length; i++) {
    var a = list[i]
    if (!a) continue
    var v = a.text !== undefined ? a.text : (a.tag !== undefined ? a.tag : a.date)
    if (v && typeof v === "object") v = v.value
    if (v !== undefined && v !== null && String(v).length) parts.push(String(v))
  }
  return parts.join("  ")
}

function accessoryIconValue(list) {
  if (!list || !list.length) return ""
  for (var i = 0; i < list.length; i++) {
    var ic = list[i] && list[i].icon ? iconSpec(list[i].icon) : null
    if (ic) return ic.kind + "|" + ic.value
  }
  return ""
}

function accessoryColor(list) {
  if (!list || !list.length) return ""
  for (var i = 0; i < list.length; i++) {
    var a = list[i]
    if (!a) continue
    var v = a.tag !== undefined ? a.tag : (a.text !== undefined ? a.text : a.date)
    if (v && typeof v === "object" && v.color) return colorValue(v.color, "")
  }
  return ""
}

function findItem(view, itemId) {
  if (!view || !view.sections) return null
  for (var i = 0; i < view.sections.length; i++) {
    var items = view.sections[i].items
    for (var j = 0; j < items.length; j++) if (items[j].id === itemId) return items[j]
  }
  return null
}

if (typeof module !== "undefined") {
  module.exports = { nextId: nextId, iconSpec: iconSpec, colorValue: colorValue, normalizeView: normalizeView, normalizeActions: normalizeActions, flattenList: flattenList, findItem: findItem }
}
