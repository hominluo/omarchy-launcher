// Two places hand a path or a typed command to bash: the launcher's own
// scripts under $HOME (which may contain spaces) and the "Run Shell Command"
// builtin (whose text must be parsed exactly as typed). These tests run the
// generated command lines through a real bash.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Shell = require("../lib/Shell.js")
const Apps = require("../lib/Apps.js")

function bash(script, env) {
  return spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, ...env } })
}

test("quote survives spaces, quotes, dollars and globs as one argument", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launcher quote "))
  for (const name of ["plain", "with space", "it's", "$HOME", "a;b", "*", 'say "hi"']) {
    const p = path.join(dir, name)
    const r = bash('printf "%s\\n" ' + Shell.quote(p))
    assert.equal(r.stdout, p + "\n", name)
  }
  // The old splice: one word per space, and a quote could end the argument.
  const spaced = path.join(dir, "with space")
  const unquoted = bash('printf "%s\\n" ' + spaced + " | wc -l")
  assert.equal(unquoted.stdout.trim(), String(spaced.split(" ").length))
})

test("the icon scan finds icons under a home directory with a space", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "launcher home "))
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "launcher data "))
  fs.mkdirSync(path.join(home, ".local", "share", "icons", "hicolor", "48x48", "apps"), { recursive: true })
  fs.writeFileSync(path.join(home, ".local", "share", "icons", "hicolor", "48x48", "apps", "from-home.svg"), "<svg/>")
  fs.mkdirSync(path.join(data, "icons", "hicolor", "apps"), { recursive: true })
  fs.writeFileSync(path.join(data, "icons", "hicolor", "apps", "from-data.png"), "")
  const r = bash(Apps.iconIndexScanCommand(), { HOME: home, XDG_DATA_DIRS: data })
  assert.equal(r.status, 0, r.stderr)
  const found = r.stdout.split("\n")
  assert.ok(found.includes(path.join(home, ".local", "share", "icons", "hicolor", "48x48", "apps", "from-home.svg")), r.stdout)
  assert.ok(found.includes(path.join(data, "icons", "hicolor", "apps", "from-data.png")), r.stdout)
  // SVGs are still listed before PNGs.
  assert.ok(r.stdout.indexOf("from-home.svg") < r.stdout.indexOf("from-data.png"))
})

test("a typed command is run as typed, and its output is capped", () => {
  const run = (cmd) => { const argv = Shell.silentArgs(cmd); return spawnSync(argv[0], argv.slice(1), { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }) }
  // Appending " 2>&1 | head -c 20000" to the text would leave this comment
  // swallowing the pipe, so 30000 bytes came back instead of 20000.
  const big = run("printf 'x%.0s' {1..30000} # a comment")
  assert.equal(big.stdout.length, 20000)
  // stderr is collected with stdout.
  const err = run("echo out; echo oops >&2")
  assert.match(err.stdout, /out/)
  assert.match(err.stdout, /oops/)
  // Quotes, pipes and redirects in the typed text are the user's own.
  const quoted = run('echo "a b" | tr " " "-"')
  assert.equal(quoted.stdout.trim(), "a-b")
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "launcher silent-")), "out.txt")
  const redirect = run("echo hi > " + Shell.quote(file) + " # trailing comment")
  assert.equal(redirect.stdout.trim(), "")
  assert.equal(fs.readFileSync(file, "utf8"), "hi\n")
})

test("empty input is safe", () => {
  assert.equal(Shell.quote(undefined), "''")
  assert.equal(Shell.quote(null), "''")
  const r = spawnSync(Shell.silentArgs(undefined)[0], Shell.silentArgs(undefined).slice(1), { encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, "")
})
