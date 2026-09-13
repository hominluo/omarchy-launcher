const test = require("node:test")
const assert = require("node:assert/strict")
const S = require("../lib/Scripts.js")

test("parses a bash script header with arguments", () => {
  const h = S.parseHeader(`#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Show IP
# @raycast.mode inline
# @raycast.refreshTime 1m
# @raycast.packageName Network
# @raycast.icon 🌐
# @raycast.argument1 {"type":"text","placeholder":"iface","optional":true}
# @raycast.needsConfirmation true

curl -s ifconfig.me`)
  assert.equal(h.title, "Show IP")
  assert.equal(h.mode, "inline")
  assert.equal(h.refreshTime, 60)
  assert.equal(h.packageName, "Network")
  assert.equal(h.arguments.length, 1)
  assert.equal(h.arguments[0].optional, true)
  assert.equal(h.needsConfirmation, true)
})

test("other comment styles and invalid headers", () => {
  const js = S.parseHeader("#!/usr/bin/env node\n// @raycast.schemaVersion 1\n// @raycast.title Hi\n// @raycast.mode silent\nconsole.log(1)")
  assert.equal(js.title, "Hi")
  assert.equal(S.parseHeader("#!/bin/bash\necho no header"), null)
  assert.equal(S.parseHeader("# @raycast.schemaVersion 2\n# @raycast.title X"), null)
  assert.equal(S.parseHeader("# @raycast.schemaVersion 1\n# @raycast.title X\n# @raycast.mode bogus").mode, "fullOutput")
})

test("durations, interpreters, mac detection, ansi", () => {
  assert.equal(S.parseDuration("5s"), 10)
  assert.equal(S.parseDuration("2h"), 7200)
  assert.equal(S.interpreterFor("x.py", ""), "python3")
  assert.equal(S.interpreterFor("x.sh", "#!/bin/zsh"), null)
  assert.equal(S.isMacOnly("a.applescript", ""), true)
  assert.equal(S.isMacOnly("a.sh", "osascript -e 'tell app'"), true)
  assert.equal(S.ansiToHtml("a\x1b[31mred\x1b[0m <b>"), 'a<span style="color:#cd3131">red</span> &lt;b&gt;')
})
