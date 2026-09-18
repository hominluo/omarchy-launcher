// Bundle an extension checkout into the layout the extension host loads,
// with the system's esbuild — a tool this machine installed from its package
// repository, never a binary that arrived with the source being built.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { EXT_DIR } from "./paths"
import { safeSegment, plainName, assertInsideExtDir, copyTreeNoSymlinks } from "./fsio"

export const ESBUILD = process.env.OMARCHY_LAUNCHER_ESBUILD || "/usr/bin/esbuild"

export interface Provenance { lockfileSha256: string; esbuildVersion: string }

function run(cmd: string, args: string[], cwd: string, timeoutMs = 5 * 60 * 1000) {
  const r = spawnSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs })
  if (r.error) throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(" ")} failed: ${r.error.message}`)
  if (r.status !== 0) {
    const out = String(r.stderr || r.stdout || "")
    throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(" ")} failed:\n${out.trim().slice(-1500)}`)
  }
  return r.stdout
}

export function esbuildVersion(): string {
  let out = ""
  try { out = run(ESBUILD, ["--version"], process.cwd(), 30_000) } catch (e: any) {
    if (/ENOENT|failed: spawnSync/.test(String(e.message)) || !fs.existsSync(ESBUILD)) throw new Error(`esbuild is not installed at ${ESBUILD}; run: omarchy pkg add esbuild`)
    throw e
  }
  const v = out.trim()
  if (!/^\d+\.\d+\.\d+/.test(v)) throw new Error(`${ESBUILD} did not report a version`)
  return v
}

function findEntry(src: string, name: string, tools = false): string | null {
  const base = tools ? path.join(src, "src", "tools") : path.join(src, "src")
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    const p = path.join(base, name + ext)
    if (fs.existsSync(p)) return p
  }
  return null
}

// Dependencies are already installed (source.npmCi) and the lockfile
// checked; this only turns the checkout into bundles under EXT_DIR.
export function build(src: string, provenance: Provenance, log: (s: string) => void): { dir: string; manifest: any; owner: string; name: string } {
  const manifest = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"))
  if (!manifest.name) throw new Error("package.json has no name")
  // The manifest is untrusted input that names the install directory; refuse
  // anything but a plain path component before esbuild runs.
  const name = safeSegment(manifest.name, "extension name")
  const owner = safeSegment(manifest.owner || manifest.author || "local", "extension owner")
  const dest = path.join(EXT_DIR, owner, name)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  assertInsideExtDir(dest)
  const staging = fs.mkdtempSync(dest + ".building-")
  try {
    bundle(src, manifest, staging, log)
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw e
  }
  assertInsideExtDir(dest)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(staging, dest)
  log(`  built with esbuild ${provenance.esbuildVersion}, lockfile ${provenance.lockfileSha256.slice(0, 12)}`)
  return { dir: dest, manifest, owner, name }
}

function bundle(src: string, manifest: any, staging: string, log: (s: string) => void) {
  const common = ["--bundle", "--platform=node", "--target=node22", "--format=cjs", "--jsx=automatic", "--minify", "--sourcemap=linked", "--log-level=warning",
    "--external:@raycast/api", "--external:react", "--external:react/jsx-runtime", "--external:react/jsx-dev-runtime",
    "--external:swift:*", "--external:rust:*",   // Raycast's native-module imports (macOS only); the compat scan flags them
    // No loader for .node: a native addon would be code the host runs without
    // ever having been reviewed as JavaScript; the build fails instead.
    "--loader:.swift=empty", "--loader:.ps1=text", "--loader:.md=text", "--define:process.env.NODE_ENV=\"production\""]
  for (const cmd of manifest.commands || []) {
    if (!plainName(cmd.name)) { log(`  skipping command ${JSON.stringify(cmd.name)}: not a plain name`); continue }
    const entry = findEntry(src, cmd.name)
    if (!entry) { log(`  skipping ${cmd.name}: no src/${cmd.name}.{tsx,ts,jsx,js}`); continue }
    log(`  bundling ${cmd.name}`)
    run(ESBUILD, [entry, `--outfile=${path.join(staging, cmd.name + ".js")}`, ...common], src)
  }
  if (Array.isArray(manifest.tools) && manifest.tools.length) {
    fs.mkdirSync(path.join(staging, "tools"), { recursive: true })
    for (const tool of manifest.tools) {
      if (!plainName(tool.name)) { log(`  skipping tool ${JSON.stringify(tool.name)}: not a plain name`); continue }
      const entry = findEntry(src, tool.name, true)
      if (!entry) continue
      log(`  bundling tool ${tool.name}`)
      run(ESBUILD, [entry, `--outfile=${path.join(staging, "tools", tool.name + ".js")}`, ...common], src)
    }
  }
  fs.copyFileSync(path.join(src, "package.json"), path.join(staging, "package.json"))
  const assets = path.join(src, "assets")
  if (fs.existsSync(assets)) {
    if (!fs.lstatSync(assets).isDirectory()) throw new Error("assets is not a directory")
    copyTreeNoSymlinks(assets, path.join(staging, "assets"))
  }
  for (const dir of [staging, path.join(staging, "tools")]) {
    let names: string[] = []
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const f of names) if (f.endsWith(".js.map")) fs.rmSync(path.join(dir, f))
  }
}
