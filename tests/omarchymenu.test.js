const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const M = require("../lib/OmarchyMenu.js")

const SHIPPED = "/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc"

function shipped() {
  if (!fs.existsSync(SHIPPED)) return null
  return M.merge(M.parse(fs.readFileSync(SHIPPED, "utf8")), [])
}

// Small tree with a link and guards, for the rules the shipped menu does not exercise.
function fixture() {
  const items = M.parse(JSON.stringify({
    "a": { label: "A" },
    "a.one": { label: "One", action: "one" },
    "a.two": { label: "Two", action: "two", when: "false" },
    "a.deep": { label: "Deep" },
    "a.deep.three": { label: "Three", action: "three" },
    "b": { label: "B" },
    "b.hidden": { label: "Hidden", action: "h", when: "false" },
    "c": { label: "C", target: "a" },
    "d": { label: "D", when: "false" },
    "d.x": { label: "X", action: "x" },
    "p": { label: "P", provider: "things" },
    "e": { label: "E", description: "Says so", aliases: ["Ee", "restart"] },
    "e.one": { label: "E One", action: "eone", checked: "true" }
  }))
  return M.merge(items, [])
}

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

test("rootChildren lists the 10 shipped root entries in file order", () => {
  const m = shipped()
  if (!m) return
  const ids = M.rootChildren(m.items, m.order).map((e) => e.id)
  assert.equal(ids.length, 10)
  assert.equal(ids[0], "apps")
  assert.equal(ids[ids.length - 1], "system")
  assert.ok(ids.includes("learn") && ids.includes("about"))
})

test("categorySubtitle previews the first children with an ellipsis", () => {
  const m = shipped()
  if (!m) return
  const sub = M.categorySubtitle(m.items, m.order, m.items.learn, {})
  assert.ok(sub.startsWith("Keybindings"), sub)
  assert.equal(sub.split(", ").length, 3)
  assert.ok(sub.endsWith("…"))
  assert.deepEqual(M.previewLabels(m.items, m.order, "learn", {}, 2), ["Keybindings", "Omarchy"])
})

test("categorySubtitle prefers the description and is empty with nothing visible", () => {
  const m = fixture()
  assert.equal(M.categorySubtitle(m.items, m.order, m.items.e, {}), "Says so")
  // Two visible under a (One, Deep); Two is hidden.
  assert.equal(M.categorySubtitle(m.items, m.order, m.items.a, { "a.two": false }), "One, Deep")
  assert.equal(M.categorySubtitle(m.items, m.order, m.items.a, { "a.two": false }, 1), "One…")
  // A link previews its target's children.
  assert.equal(M.categorySubtitle(m.items, m.order, m.items.c, {}), "One, Two, Deep")
  assert.equal(M.categorySubtitle(m.items, m.order, m.items.b, { "b.hidden": false }), "")
  assert.equal(M.categorySubtitle(m.items, m.order, null, {}), "")
})

test("idTokens splits the leaf segment on dashes", () => {
  assert.deepEqual(M.idTokens("setup.power-menu"), ["power-menu", "power", "menu"])
  assert.deepEqual(M.idTokens("about"), ["about"])
  assert.deepEqual(M.idTokens("a.b.c-c"), ["c-c", "c"])
  assert.deepEqual(M.idTokens(""), [])
})

test("splitAliases sorts generic aliases into keywords", () => {
  const m = shipped()
  if (!m) return
  assert.deepEqual(M.splitAliases(m.items.update), { aliases: [], keywords: ["restart", "refresh"] })
  assert.deepEqual(M.splitAliases(m.items.system), { aliases: ["power-menu"], keywords: [] })
  assert.deepEqual(M.splitAliases(m.items.apps), { aliases: [], keywords: ["app", "applications"] })
  assert.deepEqual(M.splitAliases({ aliases: ["Restart", "Custom"] }), { aliases: ["Custom"], keywords: ["Restart"] })
  assert.deepEqual(M.splitAliases({}), { aliases: [], keywords: [] })
  assert.deepEqual(M.GENERIC_ALIASES, ["app", "applications", "restart", "refresh"])
})

test("resolveAlias prefers ids, then aliases case-insensitively", () => {
  const m = shipped()
  if (!m) return
  assert.equal(M.resolveAlias(m.items, m.order, "settings"), "setup")
  assert.equal(M.resolveAlias(m.items, m.order, "Settings"), "setup")
  assert.equal(M.resolveAlias(m.items, m.order, "setup"), "setup")
  assert.equal(M.resolveAlias(m.items, m.order, "system.lock"), "system.lock")
  assert.equal(M.resolveAlias(m.items, m.order, "power-menu"), "system")
  assert.equal(M.resolveAlias(m.items, m.order, "no-such-thing"), "")
  assert.equal(M.resolveAlias(m.items, m.order, ""), "")
  const f = fixture()
  assert.equal(M.resolveAlias(f.items, f.order, "ee"), "e")
})

test("isVisible hides a menu whose only child is guarded off", () => {
  const m = fixture()
  const on = {}
  const off = { "b.hidden": false }
  assert.equal(M.isVisible(m.items, m.order, on, m.items.b, 0), true)
  assert.equal(M.isVisible(m.items, m.order, off, m.items.b, 0), false)
  assert.equal(M.isVisible(m.items, m.order, off, m.items["b.hidden"], 0), false)
  // A menu's own failed guard hides it regardless of children.
  assert.equal(M.isVisible(m.items, m.order, { d: false }, m.items.d, 0), false)
  assert.equal(M.isVisible(m.items, m.order, {}, m.items.d, 0), true)
  // Links look through to their target; providers are always visible.
  assert.equal(M.isVisible(m.items, m.order, {}, m.items.c, 0), true)
  assert.equal(M.isVisible(m.items, m.order, {}, m.items.p, 0), true)
  assert.equal(M.isVisible(m.items, m.order, {}, null, 0), false)
  // The host's { when, checked } records are read the same way.
  assert.equal(M.isVisible(m.items, m.order, { "b.hidden": { when: false } }, m.items.b, 0), false)
  assert.equal(M.isVisible(m.items, m.order, { "b.hidden": { checked: true } }, m.items.b, 0), true)
  assert.deepEqual(M.visibleChildren(m.items, m.order, "a", { "a.two": false }).map((e) => e.id), ["a.one", "a.deep"])
})

test("isVisible survives a link cycle", () => {
  const m = M.merge(M.parse('{"x": {"label": "X", "target": "y"}, "y": {"label": "Y"}, "y.z": {"label": "Z", "target": "x"}}'), [])
  assert.equal(M.isVisible(m.items, m.order, {}, m.items.x, 0), false)
})

test("descendants flattens visible actions with the path below the id", () => {
  const m = shipped()
  if (!m) return
  const rows = M.descendants(m.items, m.order, "system", {})
  const lock = rows.find((r) => r.entry.id === "system.lock")
  assert.ok(lock)
  // Direct children carry no path: the section title already names "System".
  assert.deepEqual(lock.path, [])
  assert.ok(rows.every((r) => r.entry.kind === "action"))
  // Nested menus contribute their labels: setup.default.browser.* sits two down.
  const setup = M.descendants(m.items, m.order, "setup", {})
  const nested = setup.find((r) => r.entry.parent === "setup.default.browser")
  assert.ok(nested, "setup has nested submenus with actions")
  assert.deepEqual(nested.path, [m.items["setup.default"].label, m.items["setup.default.browser"].label])
  assert.ok(setup.every((r) => r.entry.id.startsWith("setup.")))
  // Guarded rows and everything under a guarded menu disappear.
  const all = M.descendants(m.items, m.order, "root", {})
  assert.ok(all.some((r) => r.entry.id === "system.suspend"))
  const fewer = M.descendants(m.items, m.order, "root", { "system.suspend": false })
  assert.ok(!fewer.some((r) => r.entry.id === "system.suspend"))
  assert.equal(all.length - fewer.length, 1)
})

test("descendants follows links once and honours menu guards", () => {
  const m = fixture()
  const ids = (rows) => rows.map((r) => r.entry.id)
  assert.deepEqual(ids(M.descendants(m.items, m.order, "a", { "a.two": false })), ["a.one", "a.deep.three"])
  assert.deepEqual(M.descendants(m.items, m.order, "a", {}).map((r) => r.path), [[], [], ["Deep"]])
  // A link id resolves to its target; a hidden menu hides its subtree.
  assert.deepEqual(ids(M.descendants(m.items, m.order, "c", {})), ["a.one", "a.two", "a.deep.three"])
  const root = M.descendants(m.items, m.order, "root", { d: false })
  assert.ok(!ids(root).includes("d.x"))
  // The link at the root points at a menu already walked, so it adds nothing.
  assert.deepEqual(ids(root.filter((r) => r.path[0] === "C")), [])
  assert.deepEqual(ids(root).filter((id) => id.startsWith("a.")), ["a.one", "a.two", "a.deep.three"])
  // Walking from the link itself contributes its own label on the way down.
  const linkFirst = M.merge(M.parse('{"l": {"label": "L", "target": "t"}, "t": {"label": "T"}, "t.go": {"label": "Go", "action": "go"}}'), [])
  assert.deepEqual(M.descendants(linkFirst.items, linkFirst.order, "root", {}), [{ entry: linkFirst.items["t.go"], path: ["L"] }])
  const cyc = M.merge(M.parse('{"x": {"label": "X"}, "x.l": {"label": "L", "target": "x"}, "x.act": {"label": "Act", "action": "go"}}'), [])
  assert.deepEqual(ids(M.descendants(cyc.items, cyc.order, "x", {})), ["x.act"])
})

test("dedupeKey is the action string", () => {
  const m = shipped()
  if (!m) return
  assert.equal(M.dedupeKey(m.items["system.lock"]), "omarchy-system-lock")
  assert.equal(M.dedupeKey(m.items.system), "")
  assert.equal(M.dedupeKey(null), "")
})

test("guardLine reports W/C lines and substitutes reader slots", () => {
  const line = M.guardLine("system.lock", "W", "true")
  assert.ok(line.includes("W system.lock 1"), line)
  assert.ok(line.includes("W system.lock 0"), line)
  assert.ok(line.startsWith("if { true; } >/dev/null 2>&1; then echo "))
  assert.ok(M.guardLine("x", "c", "true").includes("'C x 1'"))
  const subst = M.substituteGuardReaders('[[ "$(omarchy-default-browser)" == "zen" ]] && $(omarchy-dns)')
  assert.equal(subst, '[[ "${__omarchy_read_2}" == "zen" ]] && ${__omarchy_read_5}')
  assert.equal(M.substituteGuardReaders("command -v omarchy-dns"), "command -v omarchy-dns")
  assert.deepEqual(M.GUARD_READERS, [
    "omarchy-channel-current", "omarchy-default-agent", "omarchy-default-browser",
    "omarchy-default-editor", "omarchy-default-terminal", "omarchy-dns"
  ])
})

test("guardScript emits the prelude only when a guard exists", () => {
  assert.equal(M.guardScript([]), "")
  assert.equal(M.guardScript([{ id: "a" }, { id: "b", when: "" }]), "")
  const script = M.guardScript([{ id: "system.lock", when: "true" }, { id: "x", checked: '[[ "$(omarchy-dns)" == "DHCP" ]]' }])
  assert.ok(script.startsWith(M.guardHelpers()))
  assert.ok(script.includes("omarchy-pkg-present() {"))
  assert.ok(script.includes("__omarchy_read_5=$(omarchy-dns 2>/dev/null) || :\n"))
  assert.ok(!script.includes("__omarchy_read_2="))
  assert.ok(/echo 'W system\.lock 1'/.test(script))
  assert.ok(/echo 'C x 1'/.test(script))
  assert.ok(script.includes('[[ "${__omarchy_read_5}" == "DHCP" ]]'))
  assert.equal(M.guardPrelude("nothing here"), M.guardHelpers())
})

test("guardScript over the shipped menu covers every guard", () => {
  const m = shipped()
  if (!m) return
  const list = m.order.map((id) => m.items[id])
  const script = M.guardScript(list)
  let want = 0
  for (const e of list) {
    if (e.when) { want++; assert.ok(script.includes("'W " + e.id + " 1'"), e.id) }
    if (e.checked) { want++; assert.ok(script.includes("'C " + e.id + " 1'"), e.id) }
  }
  assert.ok(want > 100)
  assert.equal((script.match(/^if \{ /gm) || []).length, want)
  // Readers are captured once each, up front, and never called inline.
  assert.ok(script.includes("__omarchy_read_2=$(omarchy-default-browser 2>/dev/null) || :"))
  assert.ok(!script.includes("$(omarchy-default-browser)"))
  // The same script is produced from the id -> entry map.
  assert.equal(M.guardScript(m.items), script)
})
