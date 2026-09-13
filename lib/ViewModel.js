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
    if (icon.kind && icon.value !== undefined) return { kind: String(icon.kind), value: String(icon.value), tint: icon.tint || "" }
    if (icon.source) return iconSpec(icon.source)
    return null
  }
  var s = String(icon)
  if (!s) return null
  if (/^(file|https?|image|data):/.test(s) || s.charAt(0) === "/") return { kind: "image", value: s, tint: "" }
  var cp = s.codePointAt(0)
  // Nerd Font private-use ranges.
  if ((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0x10FFFF)) return { kind: "glyph", value: s, tint: "" }
  return { kind: "emoji", value: s, tint: "" }
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
    keywords: item.keywords || [],
    accessories: item.accessories || [],
    detail: item.detail || null,
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

function findItem(view, itemId) {
  if (!view || !view.sections) return null
  for (var i = 0; i < view.sections.length; i++) {
    var items = view.sections[i].items
    for (var j = 0; j < items.length; j++) if (items[j].id === itemId) return items[j]
  }
  return null
}

if (typeof module !== "undefined") {
  module.exports = { nextId: nextId, iconSpec: iconSpec, normalizeView: normalizeView, normalizeActions: normalizeActions, flattenList: flattenList, findItem: findItem }
}
