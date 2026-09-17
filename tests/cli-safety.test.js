// The CLI takes directory names from a store response or an extension's
// package.json and later deletes those directories. These tests run the built
// runtime/cli.js against a scratch $HOME and check that a hostile name is
// refused before anything is created or removed, and that the index write
// never follows a planted symlink.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const CLI = path.join(__dirname, "..", "runtime", "cli.js")

function scratch() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-safety-"))
  const bin = path.join(home, "bin")
  fs.mkdirSync(bin)
  // An empty PATH keeps the CLI from reaching the real omarchy-shell.
  const env = { ...process.env, HOME: home, PATH: bin, XDG_CONFIG_HOME: "", XDG_DATA_HOME: "" }
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" })
  return { home, run, extDir: path.join(home, ".local", "share", "omarchy-launcher", "extensions") }
}

function fixture(home, manifest) {
  const dir = path.join(home, "src-ext")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest))
  return dir
}

test("a manifest whose name escapes the extensions directory is refused before npm runs", () => {
  const { home, run } = scratch()
  const dir = fixture(home, { name: "../evil", author: "someone", commands: [] })
  const r = run("ext", "build", dir)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /extension name "\.\.\/evil" is not a safe directory name/)
  assert.ok(!fs.existsSync(path.join(dir, "node_modules")), "npm must not have run")
  assert.ok(!fs.existsSync(path.join(home, ".local", "share", "evil")))
})

test("a manifest whose owner escapes the extensions directory is refused", () => {
  const { home, run } = scratch()
  const dir = fixture(home, { name: "fine", author: "../../..", commands: [] })
  const r = run("ext", "build", dir)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /extension owner "\.\.\/\.\.\/\.\." is not a safe directory name/)
})

test("remove refuses an index entry whose directory is outside the extensions directory", () => {
  const { home, run, extDir } = scratch()
  const victim = path.join(home, "victim")
  fs.mkdirSync(victim)
  fs.writeFileSync(path.join(victim, "keep"), "x")
  fs.mkdirSync(extDir, { recursive: true })
  fs.writeFileSync(path.join(extDir, "index.json"), JSON.stringify({ version: 1, extensions: [{ id: "a/b", owner: "a", name: "b", dir: victim, commands: [], compat: { status: "full", notes: [] }, preferences: [], tools: [] }] }))
  const r = run("ext", "remove", "a/b")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /refusing to remove/)
  assert.equal(fs.readFileSync(path.join(victim, "keep"), "utf8"), "x")
})

test("the index write replaces a planted symlink instead of following it", () => {
  const { home, run, extDir } = scratch()
  fs.mkdirSync(extDir, { recursive: true })
  const victim = path.join(home, "victim.txt")
  fs.writeFileSync(victim, "untouched")
  fs.symlinkSync(victim, path.join(extDir, "index.json"))
  const r = run("ext", "reindex")
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!fs.lstatSync(path.join(extDir, "index.json")).isSymbolicLink())
  assert.equal(fs.readFileSync(victim, "utf8"), "untouched")
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extDir, "index.json"), "utf8")).extensions, [])
  assert.deepEqual(fs.readdirSync(extDir).filter((f) => f.endsWith(".tmp")), [])
})
