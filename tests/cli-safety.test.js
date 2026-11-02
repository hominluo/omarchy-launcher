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
  return { home, run, env, extDir: path.join(home, ".local", "share", "omarchy-launcher", "extensions") }
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
  assert.match(r.stderr, /refusing to (remove|touch)/)
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

// ---------------------------------------------------------------- round 2: provenance

// A scratch HOME whose PATH holds a fake omarchy-shell (logging its argv),
// git, npm and node, and — when one is around — an esbuild the CLI may use.
function scratch2() {
  const s = scratch()
  const bin = path.join(s.home, "bin")
  fs.writeFileSync(path.join(bin, "omarchy-shell"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$HOME/ipc.log\"\necho ok\n", { mode: 0o755 })
  // git, npm and node come from wherever they really live (a version
  // manager's shim must stay next to its own install), after our fake shell.
  const toolDirs = []
  for (const tool of ["git", "npm", "node"]) {
    const found = (spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout || "").trim()
    if (found && !toolDirs.includes(path.dirname(found))) toolDirs.push(path.dirname(found))
  }
  const local = path.join(__dirname, "..", "packages", "cli", "node_modules", "esbuild", "bin", "esbuild")
  const esbuild = process.env.OMARCHY_LAUNCHER_ESBUILD || (fs.existsSync(local) ? local : (fs.existsSync("/usr/bin/esbuild") ? "/usr/bin/esbuild" : ""))
  const env = { ...process.env, HOME: s.home, PATH: [bin, ...toolDirs, "/usr/bin", "/bin"].join(":"), XDG_CONFIG_HOME: "", XDG_DATA_HOME: "", OMARCHY_LAUNCHER_ESBUILD: esbuild }
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8", input: "" })
  const ipc = () => { try { return fs.readFileSync(path.join(s.home, "ipc.log"), "utf8") } catch { return "" } }
  return { ...s, run, esbuild, ipc, env, dataDir: path.join(s.home, ".local", "share", "omarchy-launcher") }
}

// A lockfile v3 with no dependencies at all: the smallest thing npm ci accepts.
const EMPTY_LOCK = (name) => JSON.stringify({ name, version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name, version: "1.0.0" } } })

function sourceExt(home, opts = {}) {
  const dir = path.join(home, opts.dir || "src-ext")
  fs.mkdirSync(path.join(dir, "src"), { recursive: true })
  const manifest = { name: "hello", title: "Hello", author: "tester", version: "1.0.0", commands: [{ name: "hello", title: "Hello", mode: "view" }], ...(opts.manifest || {}) }
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, "src", "hello.ts"), "export default function Command() { return null }\n")
  if (opts.lock !== null) fs.writeFileSync(path.join(dir, "package-lock.json"), opts.lock || EMPTY_LOCK("hello"))
  return dir
}

test("a source tree without a lockfile is refused before npm runs", () => {
  const { home, run } = scratch2()
  const dir = sourceExt(home, { lock: null })
  const r = run("ext", "install", dir, "--yes")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no package-lock\.json/)
  assert.ok(!fs.existsSync(path.join(dir, "node_modules")))
})

test("a lockfile that resolves a package outside registry.npmjs.org is refused", () => {
  const { home, run } = scratch2()
  const lock = JSON.parse(EMPTY_LOCK("hello"))
  lock.packages["node_modules/evil"] = { version: "1.0.0", resolved: "https://evil.example/evil-1.0.0.tgz", integrity: "sha512-AAAA" }
  const dir = sourceExt(home, { lock: JSON.stringify(lock) })
  const r = run("ext", "install", dir, "--yes")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /node_modules\/evil.*evil\.example/)
})

test("a lockfile entry without an integrity hash, a link entry, or a v1 lockfile is refused", () => {
  const { home, run } = scratch2()
  const noHash = JSON.parse(EMPTY_LOCK("hello"))
  noHash.packages["node_modules/x"] = { version: "1.0.0", resolved: "https://registry.npmjs.org/x/-/x-1.0.0.tgz" }
  assert.match(run("ext", "install", sourceExt(home, { dir: "a", lock: JSON.stringify(noHash) }), "--yes").stderr, /no integrity hash/)
  const link = JSON.parse(EMPTY_LOCK("hello"))
  link.packages["node_modules/y"] = { resolved: "../y", link: true }
  assert.match(run("ext", "install", sourceExt(home, { dir: "b", lock: JSON.stringify(link) }), "--yes").stderr, /workspace or link/)
  assert.match(run("ext", "install", sourceExt(home, { dir: "c", lock: JSON.stringify({ lockfileVersion: 1, dependencies: {} }) }), "--yes").stderr, /lockfileVersion 1/)
})

test("install specs are validated before git is touched", () => {
  const { home, run } = scratch2()
  let r = run("ext", "install", "https://example.com/x.git", "--subdir", "../..")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /not a safe directory name/)
  r = run("ext", "install", "https://example.com/x.git", "--commit", "abc")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /full 40-hex SHA/)
  r = run("ext", "install", "ftp://example.com/x.git")
  assert.equal(r.status, 1)
  assert.ok(!fs.existsSync(path.join(home, ".cache", "omarchy-launcher", "src")))
})

test("without --yes and without a terminal, nothing is installed", () => {
  const { home, run, esbuild } = scratch2()
  if (!esbuild) return
  const dir = sourceExt(home)
  const r = run("ext", "install", dir)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /refusing to install without confirmation/)
  assert.ok(!fs.existsSync(path.join(home, ".local", "share", "omarchy-launcher", "extensions", "tester")))
})

function bareRepo(home, name, files) {
  const work = path.join(home, name + "-work")
  fs.mkdirSync(path.join(work, "src"), { recursive: true })
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(work, f), text)
  const git = (...a) => { const r = spawnSync("git", a, { cwd: work, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim() }
  git("init", "-q", "--initial-branch=main")
  git("add", "-A")
  git("commit", "-q", "-m", "one")
  const commit = git("rev-parse", "HEAD")
  const bare = path.join(home, name + ".git")
  const clone = spawnSync("git", ["clone", "-q", "--bare", work, bare], { encoding: "utf8" })
  if (clone.status !== 0) throw new Error(clone.stderr)
  return { url: "file://" + bare, commit, work, git }
}

test("a git install pins the commit, records provenance outside the extension, and reuses its cache", (t) => {
  const { home, run, esbuild, dataDir } = scratch2()
  if (!esbuild) { t.skip("no esbuild available"); return }
  const repo = bareRepo(home, "hello", {
    "package.json": JSON.stringify({ name: "hello", title: "Hello", author: "tester", version: "1.0.0", commands: [{ name: "hello", title: "Hello", mode: "view" }] }),
    "package-lock.json": EMPTY_LOCK("hello"),
    "src/hello.ts": "export default function Command() { return null }\n",
  })
  let r = run("ext", "install", repo.url + "#" + repo.commit, "--yes")
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const extDir = path.join(dataDir, "extensions", "tester", "hello")
  assert.ok(fs.existsSync(path.join(extDir, "hello.js")))
  const install = JSON.parse(fs.readFileSync(path.join(extDir, "install.json"), "utf8"))
  assert.equal(install.commit, repo.commit)
  assert.equal(install.url, repo.url)
  assert.equal(install.esbuildVersion.split(".").length, 3)
  assert.match(install.lockfileSha256, /^[0-9a-f]{64}$/)
  const origins = JSON.parse(fs.readFileSync(path.join(dataDir, "origins.json"), "utf8"))
  assert.deepEqual(origins.origins["tester/hello"], { kind: "git", url: repo.url, commit: repo.commit })
  assert.equal(fs.statSync(path.join(dataDir, "origins.json")).mode & 0o777, 0o600)
  // Pinned: an update has nothing to do, whatever the branch does next.
  fs.writeFileSync(path.join(repo.work, "src", "hello.ts"), "export default function Command() { return 1 }\n")
  repo.git("commit", "-qam", "two")
  spawnSync("git", ["push", "-q", "file://" + path.join(home, "hello.git"), "main"], { cwd: repo.work })
  r = run("ext", "update", "--yes")
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /pinned to .*nothing to update/)
  // A branch install resolves to a commit, prints it, and updates when it moves.
  r = run("ext", "install", repo.url, "--ref", "main", "--yes")
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /pinned to [0-9a-f]{40}/)
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, "origins.json"), "utf8")).origins["tester/hello"]
  assert.notEqual(after.commit, repo.commit)
  assert.equal(after.ref, "main")
})

test("ext update ignores an origin the extension wrote into its own install.json", (t) => {
  const { home, run, esbuild, dataDir } = scratch2()
  if (!esbuild) { t.skip("no esbuild available"); return }
  const dir = sourceExt(home)
  let r = run("ext", "install", dir, "--yes")
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const extDir = path.join(dataDir, "extensions", "tester", "hello")
  const planted = "file://" + path.join(home, "does-not-exist.git")
  const install = JSON.parse(fs.readFileSync(path.join(extDir, "install.json"), "utf8"))
  install.origin = planted; install.url = planted; install.source = "git"
  fs.writeFileSync(path.join(extDir, "install.json"), JSON.stringify(install))
  r = run("ext", "update", "--yes")
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /rebuilding from/)
  assert.ok(!r.stdout.includes("does-not-exist") && !r.stderr.includes("does-not-exist"))
})

test("a symlinked owner directory under extensions is neither removed through nor indexed", () => {
  const { home, run, extDir } = scratch2()
  const victim = path.join(home, "victim")
  fs.mkdirSync(path.join(victim, "b"), { recursive: true })
  fs.writeFileSync(path.join(victim, "b", "keep"), "x")
  fs.writeFileSync(path.join(victim, "b", "package.json"), JSON.stringify({ name: "b", commands: [{ name: "../x", title: "bad" }, { name: "ok", title: "ok" }] }))
  fs.mkdirSync(extDir, { recursive: true })
  fs.symlinkSync(victim, path.join(extDir, "a"))
  fs.writeFileSync(path.join(extDir, "index.json"), JSON.stringify({ version: 1, extensions: [{ id: "a/b", owner: "a", name: "b", dir: path.join(extDir, "a", "b"), commands: [], compat: { status: "full", notes: [] }, preferences: [], tools: [] }] }))
  let r = run("ext", "remove", "a/b")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /refusing to touch/)
  assert.equal(fs.readFileSync(path.join(victim, "b", "keep"), "utf8"), "x")
  r = run("ext", "reindex")
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extDir, "index.json"), "utf8")).extensions, [])
})

test("only omarchy-launcher links reach the shell, tagged with their origin", () => {
  const { run, ipc } = scratch2()
  let r = run("url", "raycast://extensions/a/b/c")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /only omarchy-launcher/)
  assert.equal(ipc(), "")
  r = run("url", "omarchy-launcher://extensions/a/b/c?arguments=" + encodeURIComponent('{"q":"1"}'))
  assert.equal(r.status, 0, r.stderr)
  const line = ipc().trim().split("\n").pop()
  const [pluginId, method, b64] = line.split(" ")
  assert.equal(pluginId, "io.github.hominluo.launcher")
  assert.equal(method, "open")
  assert.deepEqual(JSON.parse(Buffer.from(b64, "base64").toString()), { extension: "a/b", command: "c", arguments: { q: "1" }, launchType: "userInitiated", origin: "url" })
  r = run("url", "omarchy-launcher://open?view=lock")
  const payload = JSON.parse(Buffer.from(ipc().trim().split("\n").pop().split(" ")[2], "base64").toString())
  assert.deepEqual(payload, { command: "cmd:lock", query: "", origin: "url" })
})

test("write-file writes only plain JSON files under the launcher's own directories, 0600, never through a link", () => {
  const { home, run } = scratch2()
  const prefs = path.join(home, ".config", "omarchy-launcher", "prefs")
  fs.mkdirSync(prefs, { recursive: true })
  const victim = path.join(home, "victim.json")
  fs.writeFileSync(victim, "untouched")
  fs.symlinkSync(victim, path.join(prefs, "a.b.json"))
  const runIn = (input, ...args) => spawnSync(process.execPath, [CLI, "write-file", ...args], { env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", input })
  let r = runIn('{"token":"secret"}\n', "--mode", "600", "--", path.join(prefs, "a.b.json"))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!fs.lstatSync(path.join(prefs, "a.b.json")).isSymbolicLink())
  assert.equal(fs.readFileSync(victim, "utf8"), "untouched")
  assert.equal(fs.statSync(path.join(prefs, "a.b.json")).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(prefs, "a.b.json"), "utf8")), { token: "secret" })
  r = runIn('{"x":1}\n', "--", path.join(home, "elsewhere.json"))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /only writes under/)
  r = runIn("not json\n", "--", path.join(prefs, "c.json"))
  assert.equal(r.status, 1)
  r = runIn('{"x":1}\n', "--", path.join(prefs, "-evil.json"))
  assert.equal(r.status, 1)
  r = runIn('{"x":1}\n', "--", path.join(prefs, "not-json.txt"))
  assert.equal(r.status, 1)
})

// ------------------------------------------------- round 3: interrupted builds, locks, write order

function ghost(dir, name) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, title: name, commands: [] }))
  return dir
}

test("a staging directory an interrupted build left behind is not indexed", () => {
  const { run, extDir } = scratch2()
  ghost(path.join(extDir, "acme", "foo"), "foo")
  ghost(path.join(extDir, "acme", "foo.building-ab12cd"), "foo.building-ab12cd")
  const r = run("ext", "reindex")
  assert.equal(r.status, 0, r.stderr)
  const ids = JSON.parse(fs.readFileSync(path.join(extDir, "index.json"), "utf8")).extensions.map((e) => e.id)
  assert.deepEqual(ids, ["acme/foo"])
})

test("a build clears the staging directory an interrupted build left behind", (t) => {
  const { home, run, esbuild, dataDir } = scratch2()
  if (!esbuild) { t.skip("no esbuild available"); return }
  const dir = sourceExt(home)
  const ownerDir = path.join(dataDir, "extensions", "tester")
  const stale = ghost(path.join(ownerDir, "hello.building-0ld0ne"), "hello")
  const old = Date.now() / 1000 - 60 * 60
  fs.utimesSync(stale, old, old)
  // A directory touched just now may belong to a build that is running.
  const fresh = ghost(path.join(ownerDir, "hello.building-fresh1"), "hello")
  const r = run("ext", "install", dir, "--yes")
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(!fs.existsSync(stale), "the stale staging directory is gone")
  assert.ok(fs.existsSync(fresh), "a recent one is left alone")
  assert.deepEqual(fs.readdirSync(ownerDir).sort(), ["hello", "hello.building-fresh1"])
})

test("a shell that never answers is given up on instead of hanging the CLI", () => {
  const s = scratch2()
  fs.writeFileSync(path.join(s.home, "bin", "omarchy-shell"), "#!/bin/sh\nsleep 30\n", { mode: 0o755 })
  const started = Date.now()
  const r = spawnSync(process.execPath, [CLI, "status"], { env: { ...s.env, OMARCHY_LAUNCHER_SHELL_TIMEOUT_MS: "200" }, encoding: "utf8" })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /omarchy-shell did not answer "status" within/)
  assert.ok(Date.now() - started < 10_000, "the wait is bounded")
  // A shell that does answer is unaffected.
  fs.writeFileSync(path.join(s.home, "bin", "omarchy-shell"), "#!/bin/sh\necho ok\n", { mode: 0o755 })
  const ok = s.run("status")
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.stdout.trim(), "ok")
})

test("write-file refuses a path outside the launcher before creating anything", () => {
  const { home, run } = scratch2()
  const runIn = (input, ...args) => spawnSync(process.execPath, [CLI, "write-file", ...args], { env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", input })
  const outside = path.join(home, "outside", "deeper", "x.json")
  const r = runIn('{"x":1}\n', "--", outside)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /only writes under/)
  assert.ok(!fs.existsSync(path.join(home, "outside")), "no directory was left behind")
  // A nested path under a launcher directory is still created and written.
  const inside = path.join(home, ".config", "omarchy-launcher", "prefs", "sub", "y.json")
  const ok = runIn('{"x":1}\n', "--", inside)
  assert.equal(ok.status, 0, ok.stderr)
  assert.deepEqual(JSON.parse(fs.readFileSync(inside, "utf8")), { x: 1 })
})

test("the index is edited under a lock: a stale one is broken, a live one is waited for", () => {
  const { home, run, env, extDir } = scratch2()
  ghost(path.join(extDir, "acme", "foo"), "foo")
  const index = path.join(extDir, "index.json")
  const lock = index + ".lock"
  const before = JSON.stringify({ version: 1, extensions: [{ id: "acme/foo", owner: "acme", name: "foo", dir: path.join(extDir, "acme", "foo"), commands: [], compat: { status: "full", notes: [] }, preferences: [], tools: [] }] })
  fs.writeFileSync(index, before)
  // A lock left by a launcher that died is broken instead of blocking forever.
  fs.writeFileSync(lock, "")
  const old = Date.now() / 1000 - 10 * 60
  fs.utimesSync(lock, old, old)
  let r = run("ext", "reindex")
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!fs.existsSync(lock), "the lock is released")
  // A lock held right now is respected: the write waits, then reports, and
  // the document is left as it was.
  fs.writeFileSync(index, before)
  fs.writeFileSync(lock, "")
  const started = Date.now()
  r = spawnSync(process.execPath, [CLI, "ext", "reindex"], { env: { ...env, OMARCHY_LAUNCHER_LOCK_WAIT_MS: "200" }, encoding: "utf8" })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /timed out waiting for .*index\.json\.lock/)
  assert.ok(Date.now() - started >= 150, "it waited for the lock")
  assert.equal(fs.readFileSync(index, "utf8"), before, "nothing was written over another launcher's edit")
  assert.ok(fs.existsSync(lock), "someone else's lock is not removed")
  assert.deepEqual(fs.readdirSync(extDir).filter((n) => n.endsWith(".tmp")), [])
})

test("remove edits the index and the origins under their locks and leaves no lock behind", () => {
  const { run, extDir, dataDir } = scratch2()
  const dir = ghost(path.join(extDir, "acme", "foo"), "foo")
  const index = path.join(extDir, "index.json")
  fs.writeFileSync(index, JSON.stringify({ version: 1, extensions: [{ id: "acme/foo", owner: "acme", name: "foo", dir, commands: [], compat: { status: "full", notes: [] }, preferences: [], tools: [] }] }))
  const origins = path.join(dataDir, "origins.json")
  fs.writeFileSync(origins, JSON.stringify({ version: 1, origins: { "acme/foo": { kind: "local", dir: "/tmp/src" } } }))
  const r = run("ext", "remove", "acme/foo")
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(!fs.existsSync(dir))
  assert.deepEqual(JSON.parse(fs.readFileSync(index, "utf8")).extensions, [])
  assert.deepEqual(JSON.parse(fs.readFileSync(origins, "utf8")).origins, {})
  assert.deepEqual(fs.readdirSync(dataDir).filter((n) => n.endsWith(".lock")), [])
})
