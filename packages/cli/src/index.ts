// `launcher` — command line for the Omarchy Launcher plugin.
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { spawnSync } from "node:child_process"
import { search, lookup, StoreMeta } from "./store"
import { build, esbuildVersion, ESBUILD } from "./build"
import { resolveInstallSpec, fetchPinned, checkLockfile, npmCi, resolveRef, storeSpec, InstallSpec } from "./source"
import { readIndex, rebuild, entryFor, writeIndex } from "./registry"
import { readOrigins, setOrigin, deleteOrigin, Origin } from "./origins"
import { EXT_DIR, PLUGIN_ID, CONFIG_DIR, DATA_DIR, STATE_DIR, PREFS_DIR, CACHE_DIR } from "./paths"
import { atomicWrite, assertInsideExtDir, cleanText, safeSegment } from "./fsio"
import { parseLauncherUrl } from "../../../lib/launcher-url.js"

const USAGE = `launcher — Omarchy Launcher command line

  launcher ext search <query>            search the Raycast Store
  launcher ext install <owner/name|url>  install a store extension: built here from its pinned commit in raycast/extensions
  launcher ext install <dir|git-url>     build and install from source; git-url#<40-hex sha> pins a commit
      [--ref <branch|tag>] [--commit <sha>] [--subdir <dir>] [--yes]
  launcher ext update [owner/name]       update one or every extension from its recorded origin
  launcher ext remove <owner/name>       remove an extension
  launcher ext list [--json]             installed extensions and their commands
  launcher ext reindex                   rebuild the extension index from disk
  launcher ext prefs <owner/name>        open the extension's preferences in the launcher
  launcher open [json]                   open the launcher (optional payload)
  launcher run <command-id>              run a launcher command, e.g. cmd:clipboard
  launcher menu [id|alias]               open the Omarchy menu browser (e.g. settings, system, style.font)
  launcher url <omarchy-launcher://…>    handle a launcher link (extension launches and quicklinks are confirmed first)
  launcher write-file --mode 600 -- <path>   write one JSON line from stdin atomically (used by the shell for secrets)
  launcher status                        runtime status

Every install needs git, npm and esbuild (omarchy pkg add esbuild). Extensions run with your
full user privileges once launched; the install prompt lists what each one declares.
`

function shell(method: string, ...args: string[]) {
  const r = spawnSync("omarchy-shell", [PLUGIN_ID, method, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 })
  return (r.stdout || "").trim()
}

function b64(json: any) { return Buffer.from(JSON.stringify(json)).toString("base64") }

const log = (line: string) => process.stdout.write(line + "\n")

interface Flags { args: string[]; yes: boolean; ref?: string; commit?: string; subdir?: string; json: boolean; mode?: string }

function parseFlags(rest: string[]): Flags {
  const out: Flags = { args: [], yes: false, json: false }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === "--") { out.args.push(...rest.slice(i + 1)); break }
    else if (a === "--yes" || a === "-y") out.yes = true
    else if (a === "--json") out.json = true
    else if (a === "--ref") out.ref = rest[++i]
    else if (a === "--commit") out.commit = rest[++i]
    else if (a === "--subdir") out.subdir = rest[++i]
    else if (a === "--mode") out.mode = rest[++i]
    else if (a.startsWith("--ref=")) out.ref = a.slice(6)
    else if (a.startsWith("--commit=")) out.commit = a.slice(9)
    else if (a.startsWith("--subdir=")) out.subdir = a.slice(9)
    else if (a.startsWith("--mode=")) out.mode = a.slice(7)
    else if (a.startsWith("-")) throw new Error(`unknown option ${a}`)
    else out.args.push(a)
  }
  return out
}

function describe(spec: InstallSpec): string {
  if (spec.kind === "local") return spec.dir
  if (spec.kind === "store") return `${spec.url} @ ${spec.commit} (${spec.subdir})`
  return `${spec.url} @ ${spec.commit}${spec.subdir ? " (" + spec.subdir + ")" : ""}${spec.ref ? " [" + spec.ref + "]" : ""}`
}

async function askYes(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer: string = await new Promise((resolve) => rl.question(question, resolve))
    return /^y(es)?$/i.test(answer.trim())
  } finally { rl.close() }
}

// What is about to run as this user, spelled out before anything is built.
async function confirmInstall(spec: InstallSpec, manifest: any, lock: { file: string; packages: number }, esbuild: string, yes: boolean) {
  const title = cleanText(manifest.title || manifest.name, 120)
  log(`\nInstall ${title} (${cleanText(manifest.owner || manifest.author || "local", 64)}/${cleanText(manifest.name, 128)})`)
  log(`  source:   ${describe(spec)}`)
  log(`  deps:     npm ci --ignore-scripts from ${path.basename(lock.file)} (${lock.packages} packages, all from registry.npmjs.org)`)
  log(`  build:    esbuild ${esbuild} (${ESBUILD})`)
  const prefs: any[] = []
  for (const p of Array.isArray(manifest.preferences) ? manifest.preferences : []) prefs.push(p)
  for (const c of Array.isArray(manifest.commands) ? manifest.commands : []) for (const p of Array.isArray(c.preferences) ? c.preferences : []) prefs.push({ ...p, command: c.name })
  if (prefs.length) {
    log("  settings the extension declares:")
    for (const p of prefs) {
      const tags = [String(p.type || "textfield")]
      if (p.required) tags.push("required")
      if (p.type === "password") tags.push("secret")
      log(`    ${cleanText(p.name, 64)}${p.command ? " (" + cleanText(p.command, 64) + ")" : ""}: ${tags.join(", ")}`)
    }
  }
  log("  Extensions run with your full user privileges once launched: they can read and write your files, run programs and use the network.")
  if (yes) return
  if (!process.stdin.isTTY) throw new Error("refusing to install without confirmation; pass --yes")
  if (!(await askYes("Continue? [y/N] "))) throw new Error("install cancelled")
}

function pruneLegacyDownloads() {
  // Zips from releases that installed prebuilt bundles; nothing reads them now.
  fs.rmSync(path.join(CACHE_DIR, "downloads"), { recursive: true, force: true })
  try { for (const n of fs.readdirSync(CACHE_DIR)) if (n.startsWith("stage-")) fs.rmSync(path.join(CACHE_DIR, n), { recursive: true, force: true }) } catch {}
}

async function installSpec(spec: InstallSpec, yes: boolean): Promise<void> {
  pruneLegacyDownloads()
  const src = spec.kind === "local" ? spec.dir : fetchPinned(spec.url, spec.commit, spec.subdir, spec.kind === "git" ? spec.ref : undefined, log).src
  const manifest = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"))
  // The manifest names the install directory; refuse a hostile name before anything else runs.
  safeSegment(manifest.name, "extension name")
  safeSegment(manifest.owner || manifest.author || "local", "extension owner")
  const lock = checkLockfile(src)
  const esbuild = esbuildVersion()
  await confirmInstall(spec, manifest, lock, esbuild, yes)
  npmCi(src, log)
  const built = build(src, { lockfileSha256: lock.sha256, esbuildVersion: esbuild }, log)
  const id = `${built.owner}/${built.name}`
  const record: any = {
    source: spec.kind, owner: built.owner, name: built.name,
    commit: spec.kind === "local" ? "" : spec.commit,
    apiVersion: spec.kind === "store" ? spec.apiVersion : "",
    installedAt: Date.now(),
    url: spec.kind === "local" ? "" : spec.url, subdir: spec.kind === "local" ? "" : (spec.subdir || ""),
    ref: spec.kind === "git" ? (spec.ref || "") : "",
    lockfileSha256: lock.sha256, esbuildVersion: esbuild, nodeVersion: process.version,
  }
  if (spec.kind === "store") record.storeUrl = spec.storeUrl
  if (spec.kind === "git") record.origin = spec.url + (spec.subdir ? "#" + spec.subdir : "")
  if (spec.kind === "local") record.origin = spec.dir
  atomicWrite(path.join(built.dir, "install.json"), JSON.stringify(record, null, 2), 0o644)
  const origin: Origin = spec.kind === "store" ? { kind: "store", owner: spec.owner, name: spec.name, commit: spec.commit }
    : spec.kind === "git" ? { kind: "git", url: spec.url, ref: spec.ref, commit: spec.commit, subdir: spec.subdir }
    : { kind: "local", dir: spec.dir }
  setOrigin(id, origin)
  const idx = readIndex()
  const entry = entryFor(built.dir, built.owner, built.name, record)
  idx.extensions = idx.extensions.filter((e) => e.id !== entry.id).concat([entry]).sort((a, b) => a.id.localeCompare(b.id))
  writeIndex(idx)
  log(`Installed ${entry.title}: ${entry.commands.map((c: any) => c.title).join(", ")}`)
  if (entry.compat.status !== "full") log(`Compatibility: ${entry.compat.status} (${entry.compat.notes.join("; ")})`)
  const required = entry.preferences.filter((p: any) => p.required && p.default === undefined)
  if (required.length) log(`Needs configuration before first run: ${required.map((p: any) => p.title || p.name).join(", ")} — the launcher will ask.`)
  shell("reindex")
}

async function extInstall(specText: string, flags: Flags) {
  const spec = await resolveInstallSpec(specText, { ref: flags.ref, commit: flags.commit, subdir: flags.subdir }, log)
  await installSpec(spec, flags.yes)
}

// Updates come from the recorded origin, never from anything inside the
// extension's directory, and always pin the newly resolved commit.
async function extUpdate(specText: string | undefined, flags: Flags) {
  const idx = readIndex()
  const origins = readOrigins()
  const targets = specText ? idx.extensions.filter((e) => e.id === specText || e.name === specText) : idx.extensions
  if (!targets.length) throw new Error("nothing to update")
  for (const e of targets) {
    const origin = origins[e.id]
    if (!origin) { log(`${e.id}: no recorded origin (installed by an older release); reinstall it once with 'launcher ext install'`); continue }
    if (origin.kind === "store") {
      const meta: StoreMeta = await lookup({ owner: origin.owner, name: origin.name })
      if (meta.commit === origin.commit) { log(`${e.id}: up to date`); continue }
      log(`${e.id}: ${origin.commit.slice(0, 7)} → ${meta.commit.slice(0, 7)}`)
      await installSpec(storeSpec(meta), flags.yes)
    } else if (origin.kind === "git") {
      if (!origin.ref) { log(`${e.id}: pinned to ${origin.commit.slice(0, 12)}; nothing to update`); continue }
      const commit = resolveRef(origin.url, origin.ref)
      if (commit === origin.commit) { log(`${e.id}: up to date`); continue }
      log(`${e.id}: ${origin.commit.slice(0, 7)} → ${commit.slice(0, 7)}`)
      await installSpec({ kind: "git", url: origin.url, ref: origin.ref, commit, subdir: origin.subdir }, flags.yes)
    } else {
      log(`${e.id}: rebuilding from ${origin.dir}`)
      await installSpec({ kind: "local", dir: origin.dir }, flags.yes)
    }
  }
}

function extRemove(spec: string) {
  const idx = readIndex()
  const e = idx.extensions.find((x) => x.id === spec || x.name === spec)
  if (!e) throw new Error(`not installed: ${spec}`)
  const dir = path.join(EXT_DIR, e.owner, e.name)
  assertInsideExtDir(dir)
  fs.rmSync(dir, { recursive: true, force: true })
  idx.extensions = idx.extensions.filter((x) => x.id !== e.id)
  writeIndex(idx)
  deleteOrigin(e.id)
  log(`Removed ${e.id}`)
  shell("reindex")
}

function extList(json: boolean) {
  const idx = readIndex()
  if (json) { process.stdout.write(JSON.stringify(idx, null, 2) + "\n"); return }
  if (!idx.extensions.length) { log("No extensions installed. Try: launcher ext install thomas/hacker-news"); return }
  for (const e of idx.extensions) {
    log(`${e.id}  ${cleanText(e.title, 120)}  [${e.compat.status}]`)
    for (const c of e.commands) log(`    ${c.name.padEnd(28)} ${cleanText(c.title, 120)}  (${c.mode}${c.compat && c.compat.status !== "full" ? ", " + c.compat.status : ""})`)
  }
}

async function extSearch(query: string) {
  const hits = await search(query)
  if (!hits.length) { log("No results."); return }
  for (const h of hits) {
    if (!h || typeof h !== "object") continue
    const owner = cleanText((h.owner && h.owner.handle) || (h.author && h.author.handle) || "?", 64)
    const mac = Array.isArray(h.platforms) && h.platforms.length === 1 && h.platforms[0] === "macOS" ? "  (macOS only)" : ""
    log(`${(owner + "/" + cleanText(h.name, 128)).padEnd(40)} ${cleanText(h.title, 120)}${mac}`)
  }
}

function handleUrl(uri: string) {
  const r = parseLauncherUrl(uri)
  if (r.method === "confetti") { spawnSync("omarchy-notification-send", ["🎉", "Confetti!"]); return }
  if (r.method === "toggle") { process.stdout.write(shell("toggle") + "\n"); return }
  process.stdout.write(shell(r.method, b64(r.payload)) + "\n")
}

// One JSON document from stdin (a single line), written 0600 through
// atomicWrite into a launcher config/state file. The shell uses this for
// extension preferences and provider keys instead of a shell redirect.
function writeFile(flags: Flags) {
  const target = flags.args[0]
  if (!target || !path.isAbsolute(target)) throw new Error("write-file needs an absolute path")
  const mode = flags.mode === undefined ? 0o600 : parseInt(flags.mode, 8)
  if (!(mode === 0o600 || mode === 0o644)) throw new Error("write-file --mode must be 600 or 644")
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(path.basename(target))) throw new Error("write-file only writes plain .json names")
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const parent = fs.realpathSync(path.dirname(target))
  const allowed = [CONFIG_DIR, STATE_DIR].map((d) => { try { return fs.realpathSync(d) } catch { return d } })
  if (!allowed.some((d) => parent === d || parent.startsWith(d + path.sep))) throw new Error(`write-file only writes under ${CONFIG_DIR} or ${STATE_DIR}`)
  const chunks: Buffer[] = []
  let total = 0
  const buf = Buffer.alloc(65536)
  for (;;) {
    let n = 0
    try { n = fs.readSync(0, buf, 0, buf.length, null) } catch (e: any) { if (e.code === "EAGAIN") continue; if (e.code === "EOF") break; throw e }
    if (n === 0) break
    total += n
    if (total > 1024 * 1024) throw new Error("write-file input exceeds 1 MiB")
    chunks.push(Buffer.from(buf.subarray(0, n)))
    if (buf.subarray(0, n).includes(10)) break
  }
  const text = Buffer.concat(chunks).toString("utf8").split("\n")[0]
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error("write-file expects one line of JSON on stdin") }
  if (!data || typeof data !== "object") throw new Error("write-file expects a JSON object")
  atomicWrite(path.join(parent, path.basename(target)), JSON.stringify(data, null, 2) + "\n", mode)
}

async function main(argv: string[]) {
  const [cmd, sub, ...rest] = argv
  for (const d of [CONFIG_DIR, DATA_DIR, STATE_DIR, EXT_DIR]) fs.mkdirSync(d, { recursive: true })
  fs.mkdirSync(PREFS_DIR, { recursive: true, mode: 0o700 })
  switch (cmd) {
    case "ext": {
      if (sub === "install") { const f = parseFlags(rest); if (!f.args.length) throw new Error("ext install needs a spec"); for (const s of f.args) await extInstall(s, f); return }
      if (sub === "update") { const f = parseFlags(rest); await extUpdate(f.args[0], f); return }
      if (sub === "build") { const f = parseFlags(rest); await extInstall(f.args[0] || ".", f); return }
      if (sub === "remove" || sub === "uninstall") { extRemove(rest[0]); return }
      if (sub === "list" || sub === undefined) { extList(rest.includes("--json")); return }
      if (sub === "search") { await extSearch(rest.join(" ")); return }
      if (sub === "reindex") { const idx = rebuild(); log(`${idx.extensions.length} extension(s)`); shell("reindex"); return }
      if (sub === "prefs") { process.stdout.write(shell("open", b64({ command: "cmd:preferences", arguments: { extension: rest[0] } })) + "\n"); return }
      break
    }
    case "open": process.stdout.write(shell("open", b64(sub ? JSON.parse(sub) : {})) + "\n"); return
    case "run": process.stdout.write(shell("run", sub) + "\n"); return
    case "menu": process.stdout.write(shell("menu", sub || "root") + "\n"); return
    case "toggle": process.stdout.write(shell("toggle") + "\n"); return
    case "url": handleUrl(sub); return
    case "write-file": writeFile(parseFlags([sub, ...rest].filter((x) => x !== undefined))); return
    case "status": process.stdout.write(shell("status") + "\n"); return
    case "-h": case "--help": case "help": case undefined: process.stdout.write(USAGE); return
  }
  process.stderr.write(USAGE)
  process.exit(1)
}

main(process.argv.slice(2)).catch((e) => { process.stderr.write("launcher: " + (e && e.message || e) + "\n"); process.exit(1) })
