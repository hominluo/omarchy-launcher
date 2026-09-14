const test = require("node:test")
const assert = require("node:assert/strict")
const Score = require("../lib/Score.js")
const R = require("../lib/RootPage.js")

// ---- fixtures: plain Entry objects (see CONTRACT "Entry"), prepared with Score.prepare

const ACCESSORY = { app: "Application", command: "Command", extension: "Ext", quicklink: "Quicklink", snippet: "Snippet",
  script: "Script", window: "Window", "omarchy-menu": "Menu", "omarchy-category": "Omarchy" }

function entry(id, kind, title, extra) {
  return Score.prepare(Object.assign({
    id, kind, title, subtitle: "", keywords: [], aliases: [], baseAliases: [], icon: "",
    accessoryText: ACCESSORY[kind] || "", accessoryIcon: kind === "omarchy-category" ? "›" : "",
    enabled: true, favorite: false, hotkey: "", primaryTitle: kind === "app" ? "Open" : "Run",
    raw: undefined, dedupeKey: "", run() { return false }
  }, extra || {}))
}

function app(id, title, extra) { return entry("app:" + id, "app", title, extra) }
function cmd(id, title, extra) { return entry("cmd:" + id, "command", title, extra) }
function cat(id, title, extra) { return entry("omenu-cat:" + id, "omarchy-category", title, extra) }
function leaf(id, title, extra) { return entry("omenu:" + id, "omarchy-menu", title, extra) }
function win(id, title, extra) { return entry("win:" + id, "window", title, extra) }

// Mirrors Service.entryRow closely enough for these tests: data.entryId and a
// marker of the compact flag so we can assert which opts each section used.
function row(e, opts) {
  const compact = !!(opts && opts.compact)
  return { id: e.id, title: e.title, subtitle: e.subtitle, icon: e.icon, keywords: e.keywords,
    accessories: compact ? [] : [{ text: e.accessoryText }], data: { entryId: e.id, compact } }
}

function defaultSettings() {
  return { suggestionsCap: 5, omarchySection: { show: true, apps: true }, commandsSection: { show: true, apps: true },
    favoritesSection: { show: true }, suggestionsSection: { show: true } }
}

// A small but realistic index: 4 apps, 4 commands, 3 categories, 1 menu leaf, 1 window.
function index() {
  return [
    app("firefox", "Firefox"),
    app("alacritty", "Alacritty"),
    app("zed", "Zed"),
    app("music", "Music"),
    cmd("clipboard", "Clipboard History"),
    cmd("lock", "Lock Screen", { dedupeKey: "omarchy-system-lock", raw: { exec: "omarchy-system-lock" } }),
    cmd("restart-shell", "Restart Shell"),
    cmd("preferences", "Preferences"),
    cat("apps", "Apps"),
    cat("setup", "Setup", { aliases: ["settings"] }),
    cat("system", "System"),
    leaf("system.lock", "System Lock", { dedupeKey: "omarchy-system-lock", raw: { action: "omarchy-system-lock" } }),
    win("0x1", "Firefox — GitHub")
  ]
}

function ctx(overrides) {
  return Object.assign({
    entries: index(), favoritesOrder: [], frecencyTop: [],
    guardOk() { return true }, isChecked() { return false },
    settings: defaultSettings(), aiAvailable: true, extensionsCount: 2, scriptsCount: 1, row
  }, overrides || {})
}

function section(result, id) {
  return result.sections.find(s => s.id === id) || null
}
function ids(result, id) {
  const s = section(result, id)
  return s ? s.items.map(it => it.id) : null
}
function order(result) {
  return result.sections.map(s => s.id)
}

// ---- suggestionCap

test("suggestionCap: cap as-is without favorites, fold budget with them", () => {
  assert.equal(R.suggestionCap(5, 0), 5)
  assert.equal(R.suggestionCap(8, 0), 8)
  assert.equal(R.suggestionCap(5, 1), 5)      // 7 − 1 = 6, capped at 5
  assert.equal(R.suggestionCap(5, 2), 5)      // 7 − 2 = 5
  assert.equal(R.suggestionCap(5, 3), 4)
  assert.equal(R.suggestionCap(5, 4), 3)
  assert.equal(R.suggestionCap(5, 5), 2)
  assert.equal(R.suggestionCap(8, 5), 2)      // floor of 2 even with a big cap
  assert.equal(R.suggestionCap(8, 6), 2)
  assert.equal(R.suggestionCap(3, 1), 3)
})

test("suggestionCap: the user's cap is the upper bound; 0 means none, missing means 5", () => {
  assert.equal(R.suggestionCap(0, 0), 0)
  assert.equal(R.suggestionCap(0, 5), 0)      // never resurrect suggestions the user turned off
  assert.equal(R.suggestionCap(1, 5), 1)
  assert.equal(R.suggestionCap(undefined, 0), R.DEFAULT_SUGGESTIONS_CAP)
  assert.equal(R.suggestionCap(undefined, 2), 5)
  assert.equal(R.suggestionCap(null, 0), 5)
  assert.equal(R.suggestionCap("nope", 0), 5)
  assert.equal(R.suggestionCap("4", 0), 4)
  assert.equal(R.suggestionCap(-3, 0), 0)
  assert.equal(R.suggestionCap(5, undefined), 5)
  assert.equal(R.suggestionCap(5, -1), 5)
})

// ---- buildRoot: first run

test("first run: only Omarchy + Commands, both placeholders at the end of Commands", () => {
  const r = R.buildRoot(ctx({ aiAvailable: false, extensionsCount: 0, scriptsCount: 0 }))
  assert.deepEqual(order(r), ["omarchy", "commands"])
  assert.deepEqual(ids(r, "omarchy"), ["omenu-cat:apps", "omenu-cat:setup", "omenu-cat:system"])
  const commands = ids(r, "commands")
  // A–Z by title, windows/menu leaves/categories excluded, placeholders last.
  assert.deepEqual(commands, [
    "app:alacritty", "cmd:clipboard", "app:firefox", "cmd:lock", "app:music", "cmd:preferences", "cmd:restart-shell", "app:zed",
    "placeholder:extensions", "placeholder:ai"
  ])
  const items = section(r, "commands").items
  const ext = items[items.length - 2], ai = items[items.length - 1]
  assert.deepEqual(ext, { id: "placeholder:extensions", title: "Install Extensions…", subtitle: "Run Raycast Store extensions", icon: "󰐕",
    accessories: [{ text: "Setup" }], data: { placeholder: "extensions" } })
  assert.deepEqual(ai, { id: "placeholder:ai", title: "Set Up AI…", subtitle: "Anthropic, OpenAI-compatible, or Ollama", icon: "󰚩",
    accessories: [{ text: "Setup" }], data: { placeholder: "ai" } })
  // seen covers every placed entry and nothing else (placeholders are not entries).
  assert.deepEqual(Object.keys(r.seen).sort(), [
    "app:alacritty", "app:firefox", "app:music", "app:zed",
    "cmd:clipboard", "cmd:lock", "cmd:preferences", "cmd:restart-shell",
    "omenu-cat:apps", "omenu-cat:setup", "omenu-cat:system"
  ])
  assert.equal(r.seen["placeholder:ai"], undefined)
  assert.equal(r.seen["omenu:system.lock"], undefined)   // deduped against cmd:lock
  assert.equal(r.seen["win:0x1"], undefined)
})

test("section shapes: Favorites carries the Edit accessory, others do not; Omarchy rows are compact", () => {
  const r = R.buildRoot(ctx({ favoritesOrder: ["app:firefox"], frecencyTop: ["cmd:clipboard"] }))
  assert.deepEqual(order(r), ["favorites", "suggestions", "omarchy", "commands"])
  const fav = section(r, "favorites")
  assert.equal(fav.title, "Favorites")
  assert.deepEqual(fav.accessory, { text: "Edit" })
  assert.equal(section(r, "suggestions").title, "Suggestions")
  assert.equal(section(r, "suggestions").accessory, undefined)
  assert.equal(section(r, "omarchy").title, "Omarchy")
  assert.equal(section(r, "commands").title, "Commands")
  for (const it of section(r, "omarchy").items) assert.equal(it.data.compact, true)
  for (const id of ["favorites", "suggestions", "commands"]) for (const it of section(r, id).items) assert.equal(it.data.compact, false)
  // Every row built from an entry carries data.entryId.
  for (const s of r.sections) for (const it of s.items) assert.equal(it.data.entryId, it.id)
})

// ---- returning user

test("returning user: 2 favorites + 5 suggestions = 7 personal rows, none repeated in Commands", () => {
  const r = R.buildRoot(ctx({
    favoritesOrder: ["app:firefox", "cmd:clipboard"],
    frecencyTop: ["app:zed", "cmd:restart-shell", "app:firefox", "app:alacritty", "cmd:preferences", "app:music", "cmd:lock"]
  }))
  assert.deepEqual(order(r), ["favorites", "suggestions", "omarchy", "commands"])
  assert.deepEqual(ids(r, "favorites"), ["app:firefox", "cmd:clipboard"])
  // frecency order kept; the favorite is skipped; cap 5 stops before cmd:lock
  assert.deepEqual(ids(r, "suggestions"), ["app:zed", "cmd:restart-shell", "app:alacritty", "cmd:preferences", "app:music"])
  assert.equal(section(r, "favorites").items.length + section(r, "suggestions").items.length, 7)
  assert.deepEqual(ids(r, "commands"), ["cmd:lock"])
  const all = r.sections.flatMap(s => s.items.map(it => it.id))
  assert.equal(new Set(all).size, all.length)
})

test("5 favorites → 2 suggestions; favorites are capped at 5 and the overflow lands in Commands", () => {
  const r = R.buildRoot(ctx({
    favoritesOrder: ["app:firefox", "cmd:clipboard", "app:zed", "cmd:restart-shell", "app:alacritty", "cmd:preferences"],
    frecencyTop: ["app:music", "cmd:lock", "cmd:preferences", "omenu:system.lock"]
  }))
  assert.deepEqual(ids(r, "favorites"), ["app:firefox", "cmd:clipboard", "app:zed", "cmd:restart-shell", "app:alacritty"])
  assert.equal(section(r, "favorites").items.length, R.FAVORITES_VISIBLE)
  assert.deepEqual(ids(r, "suggestions"), ["app:music", "cmd:lock"])
  // The 6th favorite is not on the personal rows (still a favoritesOrder id → never a suggestion) but stays reachable in Commands.
  assert.deepEqual(ids(r, "commands"), ["cmd:preferences"])
})

test("favorites: missing, disabled, guard-hidden, window and duplicate ids are skipped in order", () => {
  const entries = index()
  entries.find(e => e.id === "app:zed").enabled = false
  const r = R.buildRoot(ctx({
    entries,
    favoritesOrder: ["app:gone", "app:zed", "cmd:lock", "win:0x1", "app:firefox", "app:firefox", "cmd:clipboard"],
    guardOk: e => e.id !== "cmd:lock"
  }))
  assert.deepEqual(ids(r, "favorites"), ["app:firefox", "cmd:clipboard"])
  assert.equal(ids(r, "commands").indexOf("app:zed"), -1)
  assert.equal(ids(r, "commands").indexOf("cmd:lock"), -1)
  assert.equal(r.seen["app:zed"], undefined)
})

test("favorites can hold menu leaves, and a leaf placed there dedupes its command twin out of Commands", () => {
  const r = R.buildRoot(ctx({ favoritesOrder: ["omenu:system.lock"] }))
  assert.deepEqual(ids(r, "favorites"), ["omenu:system.lock"])
  assert.equal(ids(r, "commands").indexOf("cmd:lock"), -1)
  assert.equal(r.seen["cmd:lock"], undefined)
})

// ---- suggestions filters

test("a category with frecency never appears in Suggestions; windows neither", () => {
  const r = R.buildRoot(ctx({ frecencyTop: ["omenu-cat:system", "win:0x1", "omenu-cat:apps", "app:firefox"] }))
  assert.deepEqual(ids(r, "suggestions"), ["app:firefox"])
  // The category still shows in its own strip.
  assert.deepEqual(ids(r, "omarchy"), ["omenu-cat:apps", "omenu-cat:setup", "omenu-cat:system"])
})

test("suggestions skip disabled, guard-hidden, unknown ids and anything in favoritesOrder", () => {
  const entries = index()
  entries.find(e => e.id === "app:music").enabled = false
  const r = R.buildRoot(ctx({
    entries,
    favoritesOrder: ["app:firefox"],
    frecencyTop: ["app:music", "cmd:restart-shell", "app:nope", "app:firefox", "app:zed"],
    guardOk: e => e.id !== "cmd:restart-shell"
  }))
  assert.deepEqual(ids(r, "suggestions"), ["app:zed"])
})

test("a suggestion whose dedupeKey was already placed is dropped, and it hides its twin from Commands", () => {
  // omenu:system.lock and cmd:lock share the key: the leaf is used most, the command is a favorite.
  let r = R.buildRoot(ctx({ favoritesOrder: ["cmd:lock"], frecencyTop: ["omenu:system.lock", "app:zed"] }))
  assert.deepEqual(ids(r, "favorites"), ["cmd:lock"])
  assert.deepEqual(ids(r, "suggestions"), ["app:zed"])
  // Nothing in favorites: the leaf is suggested and the command twin vanishes from Commands.
  r = R.buildRoot(ctx({ frecencyTop: ["omenu:system.lock"] }))
  assert.deepEqual(ids(r, "suggestions"), ["omenu:system.lock"])
  assert.equal(ids(r, "commands").indexOf("cmd:lock"), -1)
  assert.equal(r.seen["omenu:system.lock"], true)
})

test("suggestions cap follows settings.suggestionsCap", () => {
  const top = ["app:zed", "cmd:restart-shell", "app:alacritty", "cmd:preferences", "app:music", "cmd:lock", "app:firefox"]
  const s8 = defaultSettings(); s8.suggestionsCap = 8
  assert.equal(ids(R.buildRoot(ctx({ frecencyTop: top, settings: s8 })), "suggestions").length, 7)
  const s3 = defaultSettings(); s3.suggestionsCap = 3
  assert.deepEqual(ids(R.buildRoot(ctx({ frecencyTop: top, settings: s3 })), "suggestions"), ["app:zed", "cmd:restart-shell", "app:alacritty"])
  const s0 = defaultSettings(); s0.suggestionsCap = 0
  assert.equal(section(R.buildRoot(ctx({ frecencyTop: top, settings: s0 })), "suggestions"), null)
  const s1 = defaultSettings(); s1.suggestionsCap = 1
  assert.deepEqual(ids(R.buildRoot(ctx({ frecencyTop: top, settings: s1, favoritesOrder: ["cmd:clipboard"] })), "suggestions"), ["app:zed"])
})

// ---- omarchy strip

test("guard-hidden category is dropped; disabled category too", () => {
  const entries = index()
  entries.find(e => e.id === "omenu-cat:setup").enabled = false
  const r = R.buildRoot(ctx({ entries, guardOk: e => e.id !== "omenu-cat:system" }))
  assert.deepEqual(ids(r, "omarchy"), ["omenu-cat:apps"])
  assert.equal(r.seen["omenu-cat:system"], undefined)
  assert.equal(r.seen["omenu-cat:setup"], undefined)
})

test("categories never leak into Commands; menu leaves neither", () => {
  const r = R.buildRoot(ctx())
  const commands = ids(r, "commands")
  for (const id of commands) assert.ok(!/^omenu/.test(id), id)
  assert.equal(commands.indexOf("win:0x1"), -1)
})

test("a favorited category still shows in the Omarchy strip", () => {
  const r = R.buildRoot(ctx({ favoritesOrder: ["omenu-cat:system"] }))
  assert.deepEqual(ids(r, "favorites"), ["omenu-cat:system"])
  assert.deepEqual(ids(r, "omarchy"), ["omenu-cat:apps", "omenu-cat:setup", "omenu-cat:system"])
})

// ---- commands dedupe / ordering

test("two entries sharing a dedupeKey → one row in Commands (the A–Z first)", () => {
  const entries = index().concat([
    cmd("suspend", "Suspend", { dedupeKey: "systemctl suspend" }),
    cmd("sleep", "Sleep", { dedupeKey: "systemctl suspend" })
  ])
  const r = R.buildRoot(ctx({ entries }))
  const commands = ids(r, "commands")
  assert.ok(commands.indexOf("cmd:sleep") >= 0)
  assert.equal(commands.indexOf("cmd:suspend"), -1)
  assert.equal(r.seen["cmd:sleep"], true)
  assert.equal(r.seen["cmd:suspend"], undefined)
  // Empty keys never collide with each other.
  assert.ok(commands.indexOf("cmd:clipboard") >= 0 && commands.indexOf("cmd:preferences") >= 0)
})

test("commands are sorted A–Z by _name with title as fallback and id as tie-break", () => {
  const entries = [
    cmd("b", "beta"),
    cmd("a", "Alpha"),
    entry("cmd:c", "command", "alpha", { }),
    cmd("d", "Ångström")
  ]
  delete entries[2]._name   // exercise the fallback
  const r = R.buildRoot(ctx({ entries }))
  assert.deepEqual(ids(r, "commands"), ["cmd:a", "cmd:c", "cmd:b", "cmd:d"])
})

// ---- toggles

test("apps toggle: omarchySection.apps hides omenu-cat:apps, commandsSection.apps hides apps in Commands", () => {
  const s = defaultSettings()
  s.omarchySection.apps = false
  s.commandsSection.apps = false
  const r = R.buildRoot(ctx({ settings: s }))
  assert.deepEqual(ids(r, "omarchy"), ["omenu-cat:setup", "omenu-cat:system"])
  assert.deepEqual(ids(r, "commands"), ["cmd:clipboard", "cmd:lock", "cmd:preferences", "cmd:restart-shell"])
  assert.equal(r.seen["app:firefox"], undefined)
  // Apps still show as favorites and suggestions.
  const r2 = R.buildRoot(ctx({ settings: s, favoritesOrder: ["app:firefox"], frecencyTop: ["app:zed"] }))
  assert.deepEqual(ids(r2, "favorites"), ["app:firefox"])
  assert.deepEqual(ids(r2, "suggestions"), ["app:zed"])
})

test("show flags omit each section", () => {
  const base = { favoritesOrder: ["app:firefox", "cmd:clipboard"], frecencyTop: ["app:zed", "cmd:restart-shell"] }
  let s = defaultSettings(); s.favoritesSection.show = false
  let r = R.buildRoot(ctx(Object.assign({ settings: s }, base)))
  assert.deepEqual(order(r), ["suggestions", "omarchy", "commands"])
  // With no favorites visible the suggestion cap is the full setting, and the
  // hidden favorites fall through to Commands.
  assert.deepEqual(ids(r, "suggestions"), ["app:zed", "cmd:restart-shell"])
  assert.ok(ids(r, "commands").indexOf("app:firefox") >= 0)

  s = defaultSettings(); s.suggestionsSection.show = false
  r = R.buildRoot(ctx(Object.assign({ settings: s }, base)))
  assert.deepEqual(order(r), ["favorites", "omarchy", "commands"])
  assert.ok(ids(r, "commands").indexOf("app:zed") >= 0)

  s = defaultSettings(); s.omarchySection.show = false
  r = R.buildRoot(ctx(Object.assign({ settings: s }, base)))
  assert.deepEqual(order(r), ["favorites", "suggestions", "commands"])
  assert.equal(r.seen["omenu-cat:system"], undefined)

  s = defaultSettings(); s.commandsSection.show = false
  r = R.buildRoot(ctx(Object.assign({ settings: s, aiAvailable: false, extensionsCount: 0, scriptsCount: 0 }, base)))
  assert.deepEqual(order(r), ["favorites", "suggestions", "omarchy"])   // placeholders live in Commands and go with it

  s = { favoritesSection: { show: false }, suggestionsSection: { show: false }, omarchySection: { show: false }, commandsSection: { show: false } }
  r = R.buildRoot(ctx(Object.assign({ settings: s }, base)))
  assert.deepEqual(r.sections, [])
  assert.deepEqual(r.seen, {})
})

test("show/apps flags default to on when settings are sparse or missing", () => {
  const r = R.buildRoot(ctx({ settings: {}, favoritesOrder: ["app:firefox"], frecencyTop: ["app:zed"] }))
  assert.deepEqual(order(r), ["favorites", "suggestions", "omarchy", "commands"])
  assert.ok(ids(r, "omarchy").indexOf("omenu-cat:apps") >= 0)
  assert.ok(ids(r, "commands").indexOf("app:alacritty") >= 0)
  const r2 = R.buildRoot(ctx({ settings: undefined, frecencyTop: ["app:zed"] }))
  assert.deepEqual(ids(r2, "suggestions"), ["app:zed"])
  const r3 = R.buildRoot(ctx({ settings: { omarchySection: { show: 0 }, commandsSection: { apps: "no" } } }))
  assert.ok(section(r3, "omarchy"))   // only an explicit false switches a flag off
  assert.ok(ids(r3, "commands").indexOf("app:firefox") >= 0)
})

// ---- placeholders

test("placeholders vanish when configured", () => {
  let r = R.buildRoot(ctx({ aiAvailable: true, extensionsCount: 1, scriptsCount: 0 }))
  let commands = ids(r, "commands")
  assert.equal(commands.indexOf("placeholder:extensions"), -1)
  assert.equal(commands.indexOf("placeholder:ai"), -1)

  // Scripts alone count as "extensions set up".
  r = R.buildRoot(ctx({ aiAvailable: false, extensionsCount: 0, scriptsCount: 3 }))
  commands = ids(r, "commands")
  assert.equal(commands.indexOf("placeholder:extensions"), -1)
  assert.equal(commands[commands.length - 1], "placeholder:ai")

  r = R.buildRoot(ctx({ aiAvailable: true, extensionsCount: 0, scriptsCount: 0 }))
  commands = ids(r, "commands")
  assert.equal(commands[commands.length - 1], "placeholder:extensions")
  assert.equal(commands.indexOf("placeholder:ai"), -1)
})

test("placeholders alone keep the Commands section alive, and each call yields fresh objects", () => {
  const r = R.buildRoot(ctx({ entries: [], aiAvailable: false, extensionsCount: 0, scriptsCount: 0 }))
  assert.deepEqual(order(r), ["commands"])
  assert.deepEqual(ids(r, "commands"), ["placeholder:extensions", "placeholder:ai"])
  assert.deepEqual(r.seen, {})
  const a = R.placeholderRow("ai"), b = R.placeholderRow("ai")
  assert.notEqual(a, b)
  assert.notEqual(a.accessories, b.accessories)
  assert.deepEqual(a, b)
  assert.equal(R.placeholderRow("bogus"), null)
})

// ---- robustness

test("buildRoot tolerates a missing ctx, missing lists and a missing row mapper", () => {
  assert.deepEqual(R.buildRoot(undefined).sections.map(s => s.id), ["commands"])   // just the two placeholders
  const r = R.buildRoot({ entries: index() })
  assert.deepEqual(order(r), ["omarchy", "commands"])
  const first = section(r, "commands").items[0]
  assert.equal(first.id, "app:alacritty")
  assert.deepEqual(first.data, { entryId: "app:alacritty" })
  assert.deepEqual(first.accessories, [{ text: "Application" }])
})

test("buildRoot never mutates the entries it is handed", () => {
  const entries = index()
  const before = JSON.stringify(entries)
  R.buildRoot(ctx({ entries, favoritesOrder: ["app:firefox"], frecencyTop: ["app:zed", "omenu:system.lock"] }))
  assert.equal(JSON.stringify(entries), before)
})

// ---- migrateFavorites

test("migrateFavorites seeds favoritesOrder once, alphabetically by id, without mutating the input", () => {
  const legacy = { version: 1, commands: {
    "cmd:clipboard": { favorite: true, alias: "cb" },
    "app:zed": { favorite: true },
    "app:firefox": { favorite: true },
    "app:music": { favorite: false },
    "cmd:lock": { enabled: false },
    "cmd:weird": null
  } }
  const snapshot = JSON.stringify(legacy)
  const first = R.migrateFavorites(legacy)
  assert.equal(first.migrated, true)
  assert.notEqual(first.settings, legacy)
  assert.deepEqual(first.settings.favoritesOrder, ["app:firefox", "app:zed", "cmd:clipboard"])
  assert.equal(first.settings.commands, legacy.commands)      // shallow copy keeps the rest by reference
  assert.equal(first.settings.version, 1)
  assert.equal(JSON.stringify(legacy), snapshot)
  assert.equal(legacy.favoritesOrder, undefined)

  // Second pass: the array exists, so nothing is re-seeded even after the user reordered or emptied it.
  const reordered = Object.assign({}, first.settings, { favoritesOrder: ["cmd:clipboard", "app:zed"] })
  const second = R.migrateFavorites(reordered)
  assert.equal(second.migrated, false)
  assert.deepEqual(second.settings.favoritesOrder, ["cmd:clipboard", "app:zed"])
  const emptied = Object.assign({}, first.settings, { favoritesOrder: [] })
  const third = R.migrateFavorites(emptied)
  assert.equal(third.migrated, false)
  assert.deepEqual(third.settings.favoritesOrder, [])
})

test("migrateFavorites: no legacy favorites still yields an (empty) array and migrated:true; junk is tolerated", () => {
  const r = R.migrateFavorites({ version: 1, commands: {} })
  assert.equal(r.migrated, true)
  assert.deepEqual(r.settings.favoritesOrder, [])
  assert.deepEqual(R.migrateFavorites({ version: 1 }).settings.favoritesOrder, [])
  assert.deepEqual(R.migrateFavorites({ favoritesOrder: "app:firefox", commands: { "app:firefox": { favorite: true } } }).settings.favoritesOrder, ["app:firefox"])
  assert.deepEqual(R.migrateFavorites(null), { settings: { favoritesOrder: [] }, migrated: true })
  assert.deepEqual(R.migrateFavorites(undefined), { settings: { favoritesOrder: [] }, migrated: true })
  assert.deepEqual(R.migrateFavorites({ commands: "nope" }).settings.favoritesOrder, [])
})
