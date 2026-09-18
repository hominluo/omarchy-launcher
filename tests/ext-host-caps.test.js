// What crosses from an extension into the shell is bounded by the sidecar:
// rows, sections, text and markdown by the view model, and any single frame
// by the transport — a hostile bundle that posts a huge frame directly ends
// its session instead of feeding the shell's parser.
const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { startHost, FIXTURES } = require("./ext-host.js")

test("a flood of rows, text and actions is cut to the view model's caps", async () => {
  const host = startHost()
  try {
    await host.load(path.join(FIXTURES, "flood"), "flood")
    const render = await host.waitFor((m) => m.method === "ui.render" && m.params.views.some((v) => v.root.sections && v.root.sections.length > 0), 15000)
    const root = render.params.views[0].root
    const items = root.sections.reduce((n, s) => n + s.items.length, 0)
    assert.ok(root.sections.length <= 100, "sections " + root.sections.length)
    assert.ok(items <= 2000, "items " + items)
    const first = root.sections[0].items[0]
    assert.equal(first.title.length, 512)
    assert.equal(first.keywords.length, 50)
    assert.equal(first.accessories.length, 8)
    assert.ok(first.detail.markdown.length <= 256 * 1024)
    assert.ok(first.actions.sections.reduce((n, s) => n + s.actions.length, 0) <= 100)
    assert.equal(first.icon, "https://example.invalid/icon.png")   // the shell classifies it as remote and asks the sidecar
    const largest = Math.max(...host.frames.map((f) => f.bytes))
    assert.ok(largest <= 8 * 1024 * 1024, "largest frame " + largest)
  } finally { host.stop() }
})

test("a raw oversized frame ends the session with a reason and never reaches the shell", async () => {
  const host = startHost()
  try {
    await host.load(path.join(FIXTURES, "flood"), "oversize")
    const crash = await host.waitFor((m) => m.method === "manager.crash", 15000)
    assert.match(crash.params.reason, /too large/)
    assert.ok(!host.frames.some((f) => f.bytes > 8 * 1024 * 1024), "an oversized frame was written")
    assert.ok(!host.frames.some((f) => f.msg.method === "ui.render" && JSON.stringify(f.msg).includes("XXXXXXXXXX")))
  } finally { host.stop() }
})
