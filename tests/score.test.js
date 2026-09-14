const test = require("node:test")
const assert = require("node:assert/strict")
const Score = require("../lib/Score.js")

function entry(id, title, extra) {
  return Score.prepare(Object.assign({ id, kind: "app", title, subtitle: "", keywords: [], aliases: [], enabled: true, favorite: false }, extra || {}))
}

test("exact alias beats everything", () => {
  const rows = Score.rank([entry("a", "Alacritty"), entry("b", "Brave", { aliases: ["al"] })], "al", {})
  assert.equal(rows[0].entry.id, "b")
  assert.equal(rows[0].score, 20000)
})

test("prefix on title beats substring", () => {
  const rows = Score.rank([entry("code", "Visual Studio Code"), entry("vs", "VS Code Insiders"), entry("x", "Xcode")], "code", {})
  // word-boundary "code" in "vs code insiders" and "visual studio code" rank above "xcode" substring
  assert.equal(rows[rows.length - 1].entry.id, "x")
})

test("acronym matches short queries only", () => {
  const rows = Score.rank([entry("vsc", "Visual Studio Code")], "vsc", {})
  assert.equal(rows.length, 1)
  assert.equal(Score.rank([entry("vsc", "Visual Studio Code")], "vscxyz", {}).length, 0)
})

test("frecency boosts but cannot cross a tier", () => {
  const prefix = entry("p", "firefox")
  const sub = entry("s", "my firefox thing")
  const rows = Score.rank([prefix, sub], "firefox", { s: 500 })
  assert.equal(rows[0].entry.id, "p")
})

test("disabled entries are skipped; favorites bubble on ties", () => {
  const rows = Score.rank([entry("a", "Term", { enabled: false }), entry("b", "Terminal"), entry("c", "Terminal", { favorite: true })], "term", {})
  assert.deepEqual(rows.map(r => r.entry.id), ["c", "b"])
})

test("empty query returns everything alphabetically", () => {
  const rows = Score.rank([entry("b", "Bravo"), entry("a", "alpha")], "", {})
  assert.deepEqual(rows.map(r => r.entry.id), ["a", "b"])
})

test("limit 0/undefined is uncapped, a positive limit truncates", () => {
  const pool = [entry("a", "Alpha"), entry("b", "Beta"), entry("c", "Charlie")]
  assert.equal(Score.rank(pool, "", {}).length, 3)
  assert.equal(Score.rank(pool, "", {}, 0).length, 3)
  assert.equal(Score.rank(pool, "", {}, 2).length, 2)
})

// ---- kind penalties (omarchy menu rows on the root page)

test("KIND_PENALTY demotes categories less than menu leaves", () => {
  assert.equal(Score.KIND_PENALTY["omarchy-category"], 100)
  assert.equal(Score.KIND_PENALTY.window, 200)
  assert.equal(Score.KIND_PENALTY["omarchy-menu"], 400)
  assert.equal(Score.KIND_PENALTY.file, 600)
})

test("'restart' ranks the Restart Shell command above a category that only has restart as a keyword", () => {
  const cmd = entry("cmd:restart-shell", "Restart Shell", { kind: "command", keywords: ["shell", "reload"] })
  // Mirrors OmarchyMenu.splitAliases: generic aliases ("restart", "refresh") become keywords, not aliases.
  const cat = entry("omenu-cat:update", "Update", { kind: "omarchy-category", keywords: ["restart", "refresh"], aliases: [] })
  const rows = Score.rank([cat, cmd], "restart", {})
  assert.deepEqual(rows.map(r => r.entry.id), ["cmd:restart-shell", "omenu-cat:update"])
  // Even a heavily used, favorited category stays below the title-prefix command.
  const boosted = Score.rank([cat, cmd], "restart", { "omenu-cat:update": 500 })
  assert.equal(boosted[0].entry.id, "cmd:restart-shell")
})

test("exact alias on a category wins the query outright", () => {
  const cat = entry("omenu-cat:setup", "Setup", { kind: "omarchy-category", aliases: ["settings"] })
  const cmd = entry("cmd:settings", "Settings", { kind: "command" })
  const app = entry("app:gnome-settings", "Settings Manager", { kind: "app" })
  const rows = Score.rank([cmd, app, cat], "settings", {})
  assert.equal(rows[0].entry.id, "omenu-cat:setup")
  assert.equal(rows[0].score, 20000 - Score.KIND_PENALTY["omarchy-category"])
})

test("'sys' ranks the System category above the System Lock menu leaf", () => {
  const cat = entry("omenu-cat:system", "System", { kind: "omarchy-category", keywords: ["omarchy menu"] })
  const leaf = entry("omenu:system.lock", "System Lock", { kind: "omarchy-menu", subtitle: "System", keywords: ["omarchy menu", "System"] })
  const rows = Score.rank([leaf, cat], "sys", {})
  assert.deepEqual(rows.map(r => r.entry.id), ["omenu-cat:system", "omenu:system.lock"])
  // The 300-point gap between the two penalties absorbs moderate frecency on the leaf.
  const used = Score.rank([leaf, cat], "sys", { "omenu:system.lock": 20 })
  assert.equal(used[0].entry.id, "omenu-cat:system")
})

// ---- favoriteBias

test("favoriteBias:false removes the favorite boost", () => {
  const pool = [entry("b", "Terminal"), entry("c", "Terminal", { favorite: true })]
  const biased = Score.rank(pool, "term", {}, 0)
  assert.deepEqual(biased.map(r => r.entry.id), ["c", "b"])
  assert.equal(biased[0].score - biased[1].score, Score.FAVORITE_BONUS)

  const flat = Score.rank(pool, "term", {}, 0, { favoriteBias: false })
  assert.deepEqual(flat.map(r => r.entry.id), ["b", "c"])   // pure tie -> id order
  assert.equal(flat[0].score, flat[1].score)

  // Anything other than an explicit false keeps the default boost.
  assert.equal(Score.rank(pool, "term", {}, 0, {})[0].entry.id, "c")
  assert.equal(Score.rank(pool, "term", {}, 0, { favoriteBias: undefined })[0].entry.id, "c")
  assert.equal(Score.rank(pool, "term", {}, 0, null)[0].entry.id, "c")
})
