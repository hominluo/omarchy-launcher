// The committed runtime bundles must be exactly what the sources produce.
// Needs the packages' devDependencies (esbuild); skipped when absent.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

for (const pkg of ["cli", "ext-host"]) {
  test(`runtime bundles match packages/${pkg}`, (t) => {
    const dir = path.join(__dirname, "..", "packages", pkg)
    if (!fs.existsSync(path.join(dir, "node_modules", "esbuild"))) { t.skip("devDependencies not installed"); return }
    const r = spawnSync(process.execPath, [path.join(dir, "build.mjs"), "--check"], { encoding: "utf8" })
    assert.equal(r.status, 0, r.stdout + r.stderr)
  })
}
