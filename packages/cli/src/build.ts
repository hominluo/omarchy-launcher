// Build an extension from source (a local checkout or a git URL) using the
// esbuild that @raycast/api pulls in as a dependency of the extension itself.
import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { CACHE_DIR, EXT_DIR } from "./paths"

export interface SourceSpec { kind: "local" | "git"; dir?: string; url?: string; subdir?: string; ref?: string }

export function parseSource(spec: string): SourceSpec | null {
  const s = spec.trim()
  if (fs.existsSync(s) && fs.existsSync(path.join(s, "package.json"))) return { kind: "local", dir: path.resolve(s) }
  let m = s.match(/^https?:\/\/github\.com\/raycast\/extensions\/(?:tree|blob)\/([^/]+)\/extensions\/([^/?#]+)/)
  if (m) return { kind: "git", url: "https://github.com/raycast/extensions.git", ref: m[1], subdir: "extensions/" + m[2] }
  m = s.match(/^(git@[^#]+|https?:\/\/[^#]+?\.git|https?:\/\/github\.com\/[^/]+\/[^/#]+)(?:#(.+))?$/)
  if (m) return { kind: "git", url: m[1].endsWith(".git") || m[1].startsWith("git@") ? m[1] : m[1] + ".git", subdir: m[2] }
  return null
}

function run(cmd: string, args: string[], cwd: string) {
  const r = spawnSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" })
  if (r.status !== 0) {
    const out = String(r.stderr || r.stdout || "")
    // esbuild prints its diagnostics before node's stack trace; keep the diagnostics.
    const cut = out.indexOf("node:child_process")
    throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(" ")} failed:\n${(cut > 0 ? out.slice(0, cut) : out).trim().slice(-1500)}`)
  }
  return r.stdout
}

export function fetchSource(spec: SourceSpec, log: (s: string) => void): string {
  if (spec.kind === "local") return spec.dir!
  const key = createHash("sha1").update(spec.url! + "#" + (spec.subdir || "")).digest("hex").slice(0, 16)
  const dir = path.join(CACHE_DIR, "src", key)
  if (fs.existsSync(path.join(dir, ".git"))) {
    log(`Updating ${spec.url}…`)
    run("git", ["pull", "--ff-only", "--quiet"], dir)
  } else {
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    log(`Cloning ${spec.url}${spec.subdir ? " (" + spec.subdir + ")" : ""}…`)
    if (spec.subdir) {
      run("git", ["clone", "--filter=blob:none", "--sparse", "--depth", "1", ...(spec.ref ? ["--branch", spec.ref] : []), spec.url!, dir], CACHE_DIR)
      run("git", ["sparse-checkout", "set", spec.subdir], dir)
    } else {
      run("git", ["clone", "--depth", "1", ...(spec.ref ? ["--branch", spec.ref] : []), spec.url!, dir], CACHE_DIR)
    }
  }
  const src = spec.subdir ? path.join(dir, spec.subdir) : dir
  if (!fs.existsSync(path.join(src, "package.json"))) throw new Error("no package.json in " + src)
  return src
}

function findEntry(src: string, name: string, tools = false): string | null {
  const base = tools ? path.join(src, "src", "tools") : path.join(src, "src")
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    const p = path.join(base, name + ext)
    if (fs.existsSync(p)) return p
  }
  return null
}

export function build(src: string, log: (s: string) => void): { dir: string; manifest: any; commit: string } {
  const manifest = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"))
  if (!manifest.name) throw new Error("package.json has no name")
  const owner = manifest.owner || manifest.author || "local"
  log("Installing dependencies (npm, scripts disabled)…")
  const hasLock = fs.existsSync(path.join(src, "package-lock.json"))
  run("npm", [hasLock ? "ci" : "install", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], src)
  const esbuild = path.join(src, "node_modules", "esbuild", "bin", "esbuild")
  if (!fs.existsSync(esbuild)) throw new Error("esbuild not found in the extension's node_modules (is @raycast/api a dependency?)")
  const dest = path.join(EXT_DIR, owner, manifest.name)
  const staging = dest + ".building"
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  const common = ["--bundle", "--platform=node", "--target=node22", "--format=cjs", "--jsx=automatic", "--minify", "--sourcemap=linked", "--log-level=warning",
    "--external:@raycast/api", "--external:react", "--external:react/jsx-runtime", "--external:react/jsx-dev-runtime",
    "--external:swift:*", "--external:rust:*",   // Raycast's native-module imports (macOS only); the compat scan flags them
    "--loader:.node=file", "--loader:.swift=empty", "--loader:.ps1=text", "--loader:.md=text", "--define:process.env.NODE_ENV=\"production\""]
  for (const cmd of manifest.commands || []) {
    const entry = findEntry(src, cmd.name)
    if (!entry) { log(`  skipping ${cmd.name}: no src/${cmd.name}.{tsx,ts,jsx,js}`); continue }
    log(`  bundling ${cmd.name}`)
    run("node", [esbuild, entry, `--outfile=${path.join(staging, cmd.name + ".js")}`, ...common], src)
  }
  if (Array.isArray(manifest.tools) && manifest.tools.length) {
    fs.mkdirSync(path.join(staging, "tools"), { recursive: true })
    for (const tool of manifest.tools) {
      const entry = findEntry(src, tool.name, true)
      if (!entry) continue
      log(`  bundling tool ${tool.name}`)
      run("node", [esbuild, entry, `--outfile=${path.join(staging, "tools", tool.name + ".js")}`, ...common], src)
    }
  }
  fs.copyFileSync(path.join(src, "package.json"), path.join(staging, "package.json"))
  if (fs.existsSync(path.join(src, "assets"))) fs.cpSync(path.join(src, "assets"), path.join(staging, "assets"), { recursive: true })
  for (const f of fs.readdirSync(staging)) if (f.endsWith(".js.map")) fs.rmSync(path.join(staging, f))
  let commit = ""
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: src, encoding: "utf8" }).trim() } catch {}
  fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(staging, dest)
  return { dir: dest, manifest, commit }
}
