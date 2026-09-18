// omarchy-launcher:// links come from anywhere (a web page can send one), so
// the parser is the first gate: one scheme only, plain segments, bounded
// payloads, and every open-payload tagged origin:"url" for the shell's gate.
const test = require("node:test")
const assert = require("node:assert/strict")
const { parseLauncherUrl } = require("../lib/launcher-url.js")

test("only the launcher's own scheme is accepted", () => {
  for (const bad of ["raycast://extensions/a/b/c", "com.raycast:/oauth?state=x", "https://example.com", "file:///etc/passwd", "not a url"]) {
    assert.throws(() => parseLauncherUrl(bad), /unsupported scheme|not a URL/, bad)
  }
})

test("extension launches carry sanitized arguments and the url origin", () => {
  const r = parseLauncherUrl("omarchy-launcher://extensions/thomas/hacker-news/index?arguments=" + encodeURIComponent(JSON.stringify({ q: "1", n: 2, deep: { a: 1 }, "bad key": "x" })) + "&launchType=background&fallbackText=hi")
  assert.equal(r.method, "open")
  assert.deepEqual(r.payload, { extension: "thomas/hacker-news", command: "index", arguments: { q: "1", n: "2" }, context: undefined, fallbackText: "hi", launchType: "userInitiated", origin: "url" })
  assert.throws(() => parseLauncherUrl("omarchy-launcher://extensions/a/b"), /extensions\//)
  assert.throws(() => parseLauncherUrl("omarchy-launcher://extensions/a%20b/c/d"), /bad owner/)
  assert.throws(() => parseLauncherUrl("omarchy-launcher://extensions/a/b/-c"), /bad command/)
})

test("oversized arguments are dropped rather than passed through", () => {
  const big = "x".repeat(20000)
  const r = parseLauncherUrl("omarchy-launcher://extensions/a/b/c?arguments=" + encodeURIComponent(JSON.stringify({ q: big })))
  assert.deepEqual(r.payload.arguments, {})
  const r2 = parseLauncherUrl("omarchy-launcher://extensions/a/b/c?arguments=" + encodeURIComponent(JSON.stringify({ q: "y".repeat(5000) })))
  assert.equal(r2.payload.arguments.q.length, 4096)
})

test("oauth needs a state; other routes keep their shapes", () => {
  assert.throws(() => parseLauncherUrl("omarchy-launcher://oauth?code=abc"), /without state/)
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://oauth?state=s1&code=abc"), { method: "oauth", payload: { state: "s1", code: "abc", error: undefined } })
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://open?view=lock"), { method: "open", payload: { command: "cmd:lock", query: "", origin: "url" } })
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://open?view=ext:a/b/c&query=hi"), { method: "open", payload: { command: "ext:a/b/c", query: "hi", origin: "url" } })
  assert.throws(() => parseLauncherUrl("omarchy-launcher://open?view=" + encodeURIComponent("x; rm -rf")), /bad view/)
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://quicklink/github?query=x"), { method: "open", payload: { command: "ql:github", arguments: { query: "x" }, origin: "url" } })
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://script-commands/hello%20world"), { method: "open", payload: { query: "hello world", origin: "url" } })
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://toggle"), { method: "toggle" })
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://"), { method: "toggle" })
  assert.deepEqual(parseLauncherUrl("omarchy-launcher://confetti"), { method: "confetti" })
  assert.throws(() => parseLauncherUrl("omarchy-launcher://install/x"), /unsupported link/)
})
