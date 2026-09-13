const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const M = require("../lib/OmarchyMenu.js")

test("parses the shipped default menu and finds actions with breadcrumbs", () => {
  const path = "/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc"
  if (!fs.existsSync(path)) return
  const items = M.parse(fs.readFileSync(path, "utf8"))
  assert.ok(items.length > 100)
  const merged = M.merge(items, [])
  const lock = merged.items["system.lock"]
  assert.equal(lock.kind, "action")
  assert.deepEqual(M.pathFor(merged.items, "system.lock"), ["System"])
  const acts = M.actions(merged.items, merged.order)
  assert.ok(acts.length > 50)
  assert.ok(M.children(merged.items, merged.order, "root").length > 5)
})

test("user overrides merge over defaults", () => {
  const d = M.parse('{"about": {"label": "About", "action": "a"}, "x": {"label": "X"}}')
  const u = M.parse('{\n // comment\n "about": {"action": "b",}, "x.y": {"label": "Y", "action": "c"}, }')
  const m = M.merge(d, u)
  assert.equal(m.items.about.action, "b")
  assert.equal(m.items.about.label, "About")
  assert.deepEqual(M.pathFor(m.items, "x.y"), ["X"])
})
