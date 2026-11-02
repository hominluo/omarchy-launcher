// Extension preferences live one file per extension in
// ~/.config/omarchy-launcher/prefs. The file is named after the extension id
// and must be attributable again: the old "<owner>.<name>.json" mapping read
// the first dot back as the owner separator, so a dotted owner's settings
// were filed under a different id and two extensions could share one file.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Prefs = require("../lib/Prefs.js")

const CLI = path.join(__dirname, "..", "runtime", "cli.js")
const IDS = [
  "thomas/hacker-news",
  "acme.corp/my-ext",
  "a.b/c",
  "a/b.c",
  "a_b/c",
  "a/b_c",
  "io.github.hominluo.launcher/menu",
  "owner/name.with.dots",
]

test("distinct extension ids get distinct file names the CLI is willing to write", () => {
  const seen = new Map()
  for (const id of IDS) {
    const name = Prefs.fileName(id)
    assert.match(name, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/, `${id} -> ${name}`)
    if (seen.has(name)) assert.fail(`${id} and ${seen.get(name)} both map to ${name}`)
    seen.set(name, id)
  }
})

test("the document carries the id, and pack/unpack keep the values", () => {
  const values = { "": { theme: "dark" }, "cmd:run": { size: "large" } }
  const doc = Prefs.pack("acme.corp/my-ext", values)
  assert.deepEqual(Prefs.unpack(doc), values)
  assert.equal(Prefs.idFor("whatever", doc), "acme.corp/my-ext")
  // Through JSON, exactly as it is written and read back.
  assert.deepEqual(Prefs.unpack(JSON.parse(JSON.stringify(doc))), values)
  assert.equal(Prefs.idFor("whatever", JSON.parse(JSON.stringify(doc))), "acme.corp/my-ext")
})

test("a file from an older release still maps to its extension", () => {
  // Files written before the id was stored: <owner>.<name>.json, first dot
  // is the separator — the behaviour that used to be applied to every file.
  assert.equal(Prefs.idFor("thomas.hacker-news", { "": { a: 1 } }), "thomas/hacker-news")
  assert.equal(Prefs.idFor("acme.corp.my-ext", {}), "acme/corp.my-ext")
  assert.deepEqual(Prefs.unpack({ "": { a: 1 } }), { "": { a: 1 } })
})

test("the CLI writes a packed preference file under the name Prefs gives it", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-prefs-"))
  const prefs = path.join(home, ".config", "omarchy-launcher", "prefs")
  const id = "acme.corp/my-ext"
  const file = path.join(prefs, Prefs.fileName(id))
  const doc = Prefs.pack(id, { "": { token: "t" } })
  const r = spawnSync(process.execPath, [CLI, "write-file", "--mode", "600", "--", file], {
    env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", input: JSON.stringify(doc) + "\n"
  })
  assert.equal(r.status, 0, r.stderr)
  const stored = JSON.parse(fs.readFileSync(file, "utf8"))
  assert.equal(Prefs.idFor(Prefs.fileName(id).replace(/\.json$/, ""), stored), id)
  assert.deepEqual(Prefs.unpack(stored), { "": { token: "t" } })
})
