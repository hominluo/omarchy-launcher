// The QML side cannot be instantiated here, so these check that the places
// which build paths and command lines use the tested helpers (lib/Shell.js,
// lib/Prefs.js), and that a launch waiting for the sidecar is forgotten when
// its window closes.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8")

// The body of a top-level QML function, up to its closing brace.
function body(source, signature) {
  const at = source.indexOf(signature)
  assert.ok(at >= 0, `${signature} is missing`)
  const end = source.indexOf("\n  }", at)
  assert.ok(end > at, `${signature} has no closing brace`)
  return source.slice(at, end)
}

test("closing the window forgets a launch that was still starting", () => {
  const host = read("ext/ExtensionHost.qml")
  const closed = body(host, "function onWindowClosed()")
  assert.match(closed, /host\.pendingLaunch = null/)
  const launch = body(host, "function doLaunch(l)")
  assert.match(launch, /win\.opened === false/, "a closed window is not launched into")
})

test("extension preference files are named and packed by lib/Prefs.js", () => {
  const service = read("Service.qml")
  const save = body(service, "function saveExtensionPrefs(extId, data)")
  assert.match(save, /Prefs\.fileName\(extId\)/)
  assert.match(save, /Prefs\.pack\(extId, data\)/)
  assert.match(body(read("Service.qml"), "id: prefsLoader"), /Prefs\.idFor\(/)
  assert.doesNotMatch(service, /String\(extId\)\.replace\("\/", "\."\)/, "the old one-way name mapping is gone")
})

test("paths handed to bash are quoted", () => {
  const service = read("Service.qml")
  assert.match(service, /Shell\.quote\(root\.pluginDir \+ "\/bin\/wm\.sh"\)/)
  assert.match(service, /Shell\.quote\(root\.hiddenScript\)/)
  assert.match(service, /command: \["bash", "-c", .*Shell\.quote\(root\.configDir \+ "\/prefs"\)/)
  assert.match(service, /import "lib\/Shell\.js" as Shell/)
  assert.match(service, /import "lib\/Prefs\.js" as Prefs/)
})

test("the shell builtin runs the typed command through lib/Shell.js", () => {
  const cmd = read("builtins/ShellCommand.qml")
  assert.match(cmd, /import "\.\.\/lib\/Shell\.js" as Shell/)
  assert.match(body(cmd, "function runSilent(cmd)"), /runner\.command = Shell\.silentArgs\(cmd\)/)
  assert.doesNotMatch(cmd, /2>&1 \| head -c 20000"/, "the command text is no longer spliced")
})
