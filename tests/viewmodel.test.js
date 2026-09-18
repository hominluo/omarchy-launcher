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
  assert.equal(rows[1].accessoryText, "x")
  assert.equal(rows[1].tagText, "y")
  assert.equal(rows[1].itemId, "b")
})

test("every row carries every role as a string", () => {
  const v = VM.normalizeView({ type: "list", sections: [
    { id: "favorites", title: "Favorites", accessory: { text: "Edit" }, items: [{ id: "a", title: "A", accessories: [{ tag: "ff" }, { hotkey: "SUPER + F" }, { icon: "✓" }, { text: "Application" }, { icon: "›" }] }] },
    { id: "plain", title: "", items: [{ id: "b", title: "B" }] }
  ] })
  assert.equal(v.sections[0].accessory.text, "Edit")
  const rows = VM.flattenList(v, "")
  for (const row of rows) for (const role of VM.ROW_ROLES) {
    assert.ok(role in row, role + " missing")
    if (role !== "hasActions") assert.equal(typeof row[role], "string", role + " is not a string")
  }
  assert.equal(rows[0].sectionAccessory, "Edit")
  assert.equal(rows[0].tagText, "ff")
  assert.equal(rows[0].hotkeyText, "SUPER + F")
  assert.equal(rows[0].accessoryIcon, "glyph|✓")
  assert.equal(rows[0].chevron, "1")
  assert.equal(rows[0].accessoryText, "Application")
  assert.equal(rows[1].sectionAccessory, "")
  assert.equal(rows[1].chevron, "")
  assert.equal(rows[1].tagText, "")
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

test("remote images are their own kind, never a plain image source", () => {
  assert.equal(VM.iconSpec("https://example.com/a.png").kind, "remote")
  assert.equal(VM.iconSpec("HTTP://example.com/a.png").kind, "remote")
  assert.equal(VM.iconSpec("file:///tmp/a.png").kind, "image")
  assert.equal(VM.iconSpec("/tmp/a.png").kind, "image")
  assert.equal(VM.iconSpec({ source: "https://example.com/a.png", tintColor: "#fff" }).kind, "remote")
})

test("markdown keeps local images and turns remote ones into links", () => {
  const md = "# T\n![alt](https://x/y.png)\n![](https://x/z.png \"t\")\n![local](file:///tmp/a.png)\n![d](data:image/png;base64,AAAA)\n<img src=\"https://x/q.png\">\n![r][ref]\n"
  const out = VM.stripRemoteImages(md)
  assert.ok(out.includes("[alt](https://x/y.png)"))
  assert.ok(out.includes("[https://x/z.png](https://x/z.png)"))
  assert.ok(out.includes("![local](file:///tmp/a.png)"))
  assert.ok(out.includes("[d]"))
  assert.ok(!out.includes("data:image"))
  assert.ok(!out.includes("<img"))
  assert.ok(out.includes("[r][ref]"))
  assert.ok(!out.includes("![alt]"))
})
