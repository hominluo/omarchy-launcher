// The default (empty-query) root page: Favorites → Suggestions → Omarchy →
// Commands. Pure functions; runs under both the QML engine and `node --test`.
// Service.rootView() assembles the ctx (index, settings, frecency order, the
// guard checks and the entry → row mapper) and hands the sections to the pane.
//
// Placement runs top to bottom and every rule only sees what the rules above
// it already placed ("placed" = on the page, tracked by id and by dedupeKey):
//   Favorites    settings.favoritesOrder resolved through the index, at most
//                FAVORITES_VISIBLE rows; carries an "Edit" section accessory.
//   Suggestions  frecency ids minus windows, categories, anything listed in
//                favoritesOrder and anything whose dedupeKey is already placed.
//                Capped by suggestionCap() so favorites + suggestions stay
//                within the fold budget.
//   Omarchy      every "omarchy-category" entry in index order, compact rows.
//                Categories are a fixed navigation strip, so one that is also
//                a favorite still shows here.
//   Commands     everything else that is not placed yet, A–Z by title, then
//                the setup placeholders (extensions, AI) when applicable.
// Disabled and guard-hidden entries never show anywhere. A section whose item
// list ends up empty is omitted.

var FAVORITES_VISIBLE = 5
var PERSONAL_BUDGET = 7          // favorites + suggestions rows above the fold
var SUGGESTIONS_MIN = 2          // never squeeze suggestions below this when favorites show
var DEFAULT_SUGGESTIONS_CAP = 5

var hasOwn = Object.prototype.hasOwnProperty

function isList(value) {
  return !!value && typeof value === "object" && typeof value.length === "number"
}

// A section's show/apps flags: only an explicit `false` turns them off.
function flag(section, key) {
  return !(section && typeof section === "object" && section[key] === false)
}

function dedupeKeyOf(entry) {
  return entry && entry.dedupeKey ? String(entry.dedupeKey) : ""
}

function nameOf(entry) {
  if (typeof entry._name === "string") return entry._name
  return String(entry.title || "").toLowerCase().trim()
}

// A–Z by cached lowercase title, id as the tie-break so the order is total.
function byName(a, b) {
  var an = nameOf(a), bn = nameOf(b)
  if (an < bn) return -1
  if (an > bn) return 1
  var ai = String(a.id), bi = String(b.id)
  if (ai < bi) return -1
  if (ai > bi) return 1
  return 0
}

// Minimal entry → item mapper used when ctx.row is missing (tests, tooling).
function defaultRow(entry) {
  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    icon: entry.icon,
    keywords: entry.keywords || [],
    accessories: entry.accessoryText ? [{ text: entry.accessoryText }] : [],
    data: { entryId: entry.id }
  }
}

// Setup rows appended to the end of Commands. Fresh objects every call so the
// view layer can normalize or annotate them freely.
function placeholderRow(which) {
  if (which === "extensions") {
    return { id: "placeholder:extensions", title: "Install Extensions…", subtitle: "Run Raycast Store extensions", icon: "󰐕",
      accessories: [{ text: "Setup" }], data: { placeholder: "extensions" } }
  }
  if (which === "ai") {
    return { id: "placeholder:ai", title: "Set Up AI…", subtitle: "Anthropic, OpenAI-compatible, or Ollama", icon: "󰚩",
      accessories: [{ text: "Setup" }], data: { placeholder: "ai" } }
  }
  return null
}

// How many suggestion rows fit next to `visibleFavorites` favorite rows.
//   cap                  settings.suggestionsCap (missing → 5; 0 → none)
//   no favorites shown   the cap as-is
//   favorites shown      min(cap, max(SUGGESTIONS_MIN, PERSONAL_BUDGET − favorites))
// The user's cap is always the upper bound, so a cap of 0 or 1 is honoured
// even when favorites are on screen.
function suggestionCap(cap, visibleFavorites) {
  var c = (cap === undefined || cap === null || cap === "") ? DEFAULT_SUGGESTIONS_CAP : Number(cap)
  if (isNaN(c)) c = DEFAULT_SUGGESTIONS_CAP
  c = Math.floor(c)
  if (c <= 0) return 0
  var favs = Math.floor(Number(visibleFavorites) || 0)
  if (favs <= 0) return c
  return Math.min(c, Math.max(SUGGESTIONS_MIN, PERSONAL_BUDGET - favs))
}

// Build the root sections. See the header comment for the rules.
//   ctx = { entries, favoritesOrder, frecencyTop, guardOk(entry), isChecked(entry),
//           settings, aiAvailable, extensionsCount, scriptsCount, row(entry, opts) }
// Returns { sections, seen } where seen maps every placed entry id → true
// (placeholder rows are not entries and are not in seen).
function buildRoot(ctx) {
  ctx = ctx || {}
  var entries = isList(ctx.entries) ? ctx.entries : []
  var favoritesOrder = isList(ctx.favoritesOrder) ? ctx.favoritesOrder : []
  var frecencyTop = isList(ctx.frecencyTop) ? ctx.frecencyTop : []
  var settings = ctx.settings && typeof ctx.settings === "object" ? ctx.settings : {}
  var guardOk = typeof ctx.guardOk === "function" ? ctx.guardOk : function() { return true }
  var row = typeof ctx.row === "function" ? ctx.row : defaultRow
  var extensionsCount = Number(ctx.extensionsCount) || 0
  var scriptsCount = Number(ctx.scriptsCount) || 0
  var aiAvailable = ctx.aiAvailable === true

  var byId = {}
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i]
    if (e && e.id !== undefined && e.id !== null && !hasOwn.call(byId, String(e.id))) byId[String(e.id)] = e
  }

  var seen = {}       // entry id → true
  var seenKeys = {}   // dedupeKey → true
  var sections = []

  function usable(entry) {
    return !!entry && entry.enabled !== false && !!guardOk(entry)
  }
  function placed(entry) {
    var key = dedupeKeyOf(entry)
    return hasOwn.call(seen, entry.id) || (!!key && hasOwn.call(seenKeys, key))
  }
  function place(entry) {
    seen[entry.id] = true
    var key = dedupeKeyOf(entry)
    if (key) seenKeys[key] = true
  }

  var inFavorites = {}
  for (var f = 0; f < favoritesOrder.length; f++) inFavorites[String(favoritesOrder[f])] = true

  // 1. Favorites — the user's list, in their order.
  var favItems = []
  if (flag(settings.favoritesSection, "show")) {
    for (var a = 0; a < favoritesOrder.length && favItems.length < FAVORITES_VISIBLE; a++) {
      var fe = byId[String(favoritesOrder[a])]
      if (!usable(fe) || fe.kind === "window" || placed(fe)) continue
      place(fe)
      favItems.push(row(fe, { compact: false }))
    }
    if (favItems.length) sections.push({ id: "favorites", title: "Favorites", accessory: { text: "Edit" }, items: favItems })
  }

  // 2. Suggestions — frecency order, best first.
  if (flag(settings.suggestionsSection, "show")) {
    var cap = suggestionCap(settings.suggestionsCap, favItems.length)
    var sugItems = []
    for (var b = 0; b < frecencyTop.length && sugItems.length < cap; b++) {
      var se = byId[String(frecencyTop[b])]
      if (!usable(se)) continue
      if (se.kind === "window" || se.kind === "omarchy-category") continue
      if (hasOwn.call(inFavorites, String(se.id)) || placed(se)) continue
      place(se)
      sugItems.push(row(se, { compact: false }))
    }
    if (sugItems.length) sections.push({ id: "suggestions", title: "Suggestions", items: sugItems })
  }

  // 3. Omarchy — the category strip, index order.
  if (flag(settings.omarchySection, "show")) {
    var showApps = flag(settings.omarchySection, "apps")
    var catItems = []
    for (var c = 0; c < entries.length; c++) {
      var ce = entries[c]
      if (!usable(ce) || ce.kind !== "omarchy-category") continue
      if (!showApps && ce.id === "omenu-cat:apps") continue
      place(ce)
      catItems.push(row(ce, { compact: true }))
    }
    if (catItems.length) sections.push({ id: "omarchy", title: "Omarchy", items: catItems })
  }

  // 4. Commands — whatever is left, alphabetical, then the setup placeholders.
  if (flag(settings.commandsSection, "show")) {
    var withApps = flag(settings.commandsSection, "apps")
    var pool = []
    for (var d = 0; d < entries.length; d++) {
      var de = entries[d]
      if (!usable(de)) continue
      if (de.kind === "window" || de.kind === "omarchy-menu" || de.kind === "omarchy-category") continue
      if (!withApps && de.kind === "app") continue
      pool.push(de)
    }
    pool.sort(byName)
    var cmdItems = []
    for (var g = 0; g < pool.length; g++) {
      var ge = pool[g]
      if (placed(ge)) continue     // placed above, or a same-key twin earlier in A–Z order
      place(ge)
      cmdItems.push(row(ge, { compact: false }))
    }
    if (extensionsCount === 0 && scriptsCount === 0) cmdItems.push(placeholderRow("extensions"))
    if (!aiAvailable) cmdItems.push(placeholderRow("ai"))
    if (cmdItems.length) sections.push({ id: "commands", title: "Commands", items: cmdItems })
  }

  return { sections: sections, seen: seen }
}

// One-time seed of settings.favoritesOrder from the legacy per-command
// `favorite: true` flags, alphabetical by id. Returns a NEW settings object
// (shallow copy; the input is never mutated) and whether anything changed.
// An existing favoritesOrder array — even an empty one — is never re-seeded.
function migrateFavorites(settings) {
  var src = settings && typeof settings === "object" ? settings : {}
  var out = {}
  for (var k in src) if (hasOwn.call(src, k)) out[k] = src[k]
  if (Array.isArray(out.favoritesOrder)) return { settings: out, migrated: false }
  var ids = []
  var commands = src.commands && typeof src.commands === "object" ? src.commands : {}
  for (var id in commands) {
    if (!hasOwn.call(commands, id)) continue
    var o = commands[id]
    if (o && typeof o === "object" && o.favorite === true) ids.push(id)
  }
  ids.sort(function(a, b) { return a < b ? -1 : (a > b ? 1 : 0) })
  out.favoritesOrder = ids
  return { settings: out, migrated: true }
}

if (typeof module !== "undefined") {
  module.exports = {
    buildRoot: buildRoot,
    suggestionCap: suggestionCap,
    migrateFavorites: migrateFavorites,
    placeholderRow: placeholderRow,
    FAVORITES_VISIBLE: FAVORITES_VISIBLE,
    PERSONAL_BUDGET: PERSONAL_BUDGET,
    SUGGESTIONS_MIN: SUGGESTIONS_MIN,
    DEFAULT_SUGGESTIONS_CAP: DEFAULT_SUGGESTIONS_CAP
  }
}
