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
