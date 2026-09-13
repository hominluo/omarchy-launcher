const test = require("node:test")
const assert = require("node:assert/strict")
const VM = require("../lib/ViewModel.js")

test("normalizes a flat item list into one section and flattens rows", () => {
  const v = VM.normalizeView({ type: "list", items: [{ title: "A", icon: "🚀" }, { id: "b", title: "B", icon: "󰘳", accessories: [{ text: "x" }, { tag: { value: "y" } }] }] })
  assert.equal(v.sections.length, 1)
  const rows = VM.flattenList(v, "")
  assert.equal(rows.length, 2)
  assert.equal(rows[0].iconKind, "emoji")
  assert.equal(rows[1].iconKind, "glyph")
  assert.equal(rows[1].accessoryText, "x  y")
  assert.equal(rows[1].itemId, "b")
})

test("host filtering respects the filtering flag", () => {
  const v = VM.normalizeView({ type: "list", filtering: true, items: [{ title: "Alpha" }, { title: "Beta", keywords: ["alp"] }] })
  assert.equal(VM.flattenList(v, "alp").length, 2)
  assert.equal(VM.flattenList(v, "beta").length, 1)
  const u = VM.normalizeView({ type: "list", filtering: false, items: [{ title: "Alpha" }] })
  assert.equal(VM.flattenList(u, "zzz").length, 1)
})

test("icon classification", () => {
  assert.equal(VM.iconSpec("file:///x.png").kind, "image")
  assert.equal(VM.iconSpec("/usr/share/x.svg").kind, "image")
  assert.equal(VM.iconSpec({ kind: "app", value: "firefox" }).kind, "app")
  assert.equal(VM.iconSpec(""), null)
})

test("actions normalize with defaults", () => {
  const p = VM.normalizeActions({ actions: [{ title: "Open" }, { id: "del", title: "Delete", style: "destructive" }] })
  assert.equal(p.sections.length, 1)
  assert.equal(p.sections[0].actions[0].kind, "callback")
  assert.equal(p.sections[0].actions[1].style, "destructive")
})
