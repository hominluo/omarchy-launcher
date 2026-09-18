// Where extension code comes from, pinned: every install names one exact
// commit, fetches exactly that commit, verifies it is what was checked out,
// and only builds from a lockfile whose every package is a registry tarball
// with an integrity hash. Nothing mutable — a branch, a `latest`, an opaque
// download URL — is ever what gets installed.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { lookup, resolveSpec, StoreMeta } from "./store"
import { NPM_CACHE_DIR, SRC_CACHE_DIR } from "./paths"
import { safeRelDir, safeSegment, sha256File } from "./fsio"

export type InstallSpec =
  | { kind: "local"; dir: string }
  | { kind: "store"; owner: string; name: string; title: string; commit: string; subdir: string; url: string; apiVersion: string; storeUrl: string }
  | { kind: "git"; url: string; commit: string; ref?: string; subdir?: string }

export const MONOREPO = "https://github.com/raycast/extensions.git"
const COMMIT = /^[0-9a-f]{40}$/
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/
const GIT_URL = /^(https:\/\/[^\s#]+|ssh:\/\/[^\s#]+|git@[^\s:#]+:[^\s#]+|file:\/\/\/[^\s#]+)$/
const MAX_LOCKFILE = 16 * 1024 * 1024
const REGISTRY = "https://registry.npmjs.org/"

export type Log = (line: string) => void

function run(cmd: string, args: string[], cwd: string, opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) {
  const r = spawnSync(cmd, args, {
    cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    timeout: opts.timeoutMs ?? 15 * 60 * 1000, env: opts.env ?? process.env,
  })
  if (r.error) throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(" ")} failed: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(" ")} failed:\n${String(r.stderr || r.stdout || "").trim().slice(-1500)}`)
  return String(r.stdout || "")
}

export function isCommit(value: any): value is string { return typeof value === "string" && COMMIT.test(value) }

function checkRef(value: string): string {
  if (!REF.test(value) || value.includes("..") || value.endsWith(".lock") || value.startsWith("-")) throw new Error(`"${value}" is not a usable git ref`)
  return value
}

function checkGitUrl(value: string): string {
  if (!GIT_URL.test(value) || value.startsWith("-")) throw new Error(`"${value}" is not a supported git URL (https://, ssh://, git@host:path or file:///)`)
  return value
}

// A user's spec becomes exactly one commit before anything is fetched.
export async function resolveInstallSpec(spec: string, flags: { ref?: string; commit?: string; subdir?: string } = {}, log: Log = () => {}): Promise<InstallSpec> {
  const s = spec.trim()
  if (fs.existsSync(s) && fs.existsSync(path.join(s, "package.json"))) return { kind: "local", dir: path.resolve(s) }

  let m = s.match(/^https?:\/\/github\.com\/raycast\/extensions\/(?:tree|blob)\/([^/?#]+)\/extensions\/([^/?#]+)\/?$/)
  if (m) {
    const subdir = "extensions/" + safeSegment(m[2], "extension directory")
    const pinned = flags.commit ?? (isCommit(m[1]) ? m[1] : undefined)
    const ref = pinned ? undefined : checkRef(flags.ref ?? m[1])
    return pinGit(MONOREPO, pinned, ref, subdir, log)
  }

  m = s.match(/^([^#\s]+)(?:#(.+))?$/)
  if (m && /^(https?:\/\/|ssh:\/\/|git@|file:\/\/\/)/.test(m[1]) && !/raycast\.com\//.test(m[1])) {
    let url = m[1]
    if (/^https?:\/\/github\.com\/[^/]+\/[^/#]+$/.test(url) && !url.endsWith(".git")) url += ".git"
    checkGitUrl(url)
    const fragment = m[2]
    let pinned = flags.commit
    let subdir = flags.subdir
    if (fragment) {
      if (isCommit(fragment)) pinned = pinned ?? fragment
      else subdir = subdir ?? fragment            // legacy `url#subdir`
    }
    if (subdir !== undefined) subdir = safeRelDir(subdir, "subdirectory")
    const ref = pinned ? undefined : (flags.ref ? checkRef(flags.ref) : undefined)
    return pinGit(url, pinned, ref, subdir, log)
  }

  const r = resolveSpec(s)
  if (!r) throw new Error(`cannot parse "${spec}"; use owner/name, a store URL, a git URL or a directory`)
  log(`Looking up ${r.owner ? r.owner + "/" : ""}${r.name}…`)
  const meta: StoreMeta = await lookup(r)
  return storeSpec(meta)
}

export function storeSpec(meta: StoreMeta): InstallSpec {
  if (meta.killListedAt) throw new Error("this extension was removed from the store")
  return {
    kind: "store", owner: meta.owner, name: meta.name, title: meta.title, commit: meta.commit,
    subdir: meta.relativePath, url: MONOREPO, apiVersion: meta.apiVersion, storeUrl: meta.storeUrl,
  }
}

async function pinGit(url: string, commit: string | undefined, ref: string | undefined, subdir: string | undefined, log: Log): Promise<InstallSpec> {
  if (commit && !isCommit(commit)) throw new Error("the commit must be the full 40-hex SHA")
  if (!commit) {
    commit = resolveRef(url, ref ?? "HEAD")
    log(`${url} ${ref ?? "HEAD"} pinned to ${commit}`)
  }
  return { kind: "git", url, commit, ref, subdir }
}

// The commit a ref points at right now, from the server. Mutable by nature,
// which is why it is resolved once, printed, and then fetched by SHA.
export function resolveRef(url: string, ref: string): string {
  const wants = ref === "HEAD" ? ["HEAD"] : [`refs/heads/${ref}`, `refs/tags/${ref}^{}`, `refs/tags/${ref}`, ref]
  const out = run("git", ["ls-remote", "--exit-code", "--", url, ...wants], process.cwd(), { env: gitEnv(), timeoutMs: 60_000 })
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean)
  const pick = (suffix: string) => lines.find((l) => l.endsWith("\t" + suffix))
  const line = pick(`refs/tags/${ref}^{}`) || pick(`refs/heads/${ref}`) || pick(`refs/tags/${ref}`) || (ref === "HEAD" ? pick("HEAD") : undefined) || lines[0]
  const sha = line ? line.split("\t")[0] : ""
  if (!isCommit(sha)) throw new Error(`could not resolve "${ref}" at ${url}`)
  return sha
}

function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" }
}

const GIT_OPTS = [
  "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "-c", "protocol.ssh.allow=always", "-c", "protocol.file.allow=always",
  "-c", "core.symlinks=false", "-c", "submodule.recurse=false", "-c", "core.hooksPath=/dev/null", "-c", "advice.detachedHead=false",
]

// Fetch exactly `commit` into an immutable cache directory keyed by URL,
// subdir and commit; verify HEAD is that commit; never pull. GitHub and
// GitLab serve any reachable commit by SHA; a host that refuses gets the
// resolved ref fetched instead, and that fetch must still land on `commit`.
export function fetchPinned(url: string, commit: string, subdir: string | undefined, ref: string | undefined, log: Log): { dir: string; src: string } {
  if (!isCommit(commit)) throw new Error("the commit must be the full 40-hex SHA")
  const key = createHash("sha1").update(url + "#" + (subdir || "")).digest("hex").slice(0, 16)
  const keyDir = path.join(SRC_CACHE_DIR, key)
  const dir = path.join(keyDir, commit)
  const src = subdir ? path.join(dir, subdir) : dir
  const git = (args: string[], cwd = dir) => run("git", [...GIT_OPTS, ...args], cwd, { env: gitEnv() })

  let reuse = false
  if (fs.existsSync(path.join(dir, ".git"))) {
    try { reuse = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim() === commit && fs.lstatSync(path.join(src, "package.json")).isFile() } catch { reuse = false }
  }
  if (!reuse) {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    git(["init", "-q", "--initial-branch=main", dir], keyDir)
    git(["remote", "add", "origin", url])
    log(`Fetching ${url} @ ${commit.slice(0, 12)}${subdir ? " (" + subdir + ")" : ""}…`)
    const fetchArgs = ["fetch", "-q", "--depth=1", "--filter=blob:none", "--no-tags", "--no-recurse-submodules", "origin"]
    try {
      git([...fetchArgs, commit])
    } catch (e: any) {
      if (!/not our ref|unadvertised object|does not allow request|couldn't find remote ref|Could not find/i.test(String(e.message))) throw e
      // Server will not hand out arbitrary SHAs: fetch the ref and insist it is still that commit.
      git([...fetchArgs, ref || "HEAD"])
      const got = git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]).trim()
      if (got !== commit) throw new Error(`${url} ${ref || "HEAD"} moved to ${got.slice(0, 12)} since it was resolved (${commit.slice(0, 12)}); run the install again`)
    }
    if (subdir) git(["sparse-checkout", "set", "--cone", subdir])
    git(["checkout", "-q", "--detach", "FETCH_HEAD"])
  }
  const head = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim()
  if (head !== commit) throw new Error(`checkout is at ${head.slice(0, 12)}, not the pinned ${commit.slice(0, 12)}`)
  if (git(["cat-file", "-t", commit]).trim() !== "commit") throw new Error(`${commit} is not a commit`)
  let pkg: fs.Stats
  try { pkg = fs.lstatSync(path.join(src, "package.json")) } catch { throw new Error(`no package.json in ${src}`) }
  if (!pkg.isFile()) throw new Error(`${path.join(src, "package.json")} is not a regular file`)
  // Other commits of the same source are stale by definition.
  for (const other of fs.readdirSync(keyDir)) if (other !== commit) fs.rmSync(path.join(keyDir, other), { recursive: true, force: true })
  return { dir, src }
}

export interface LockReport { file: string; sha256: string; packages: number }

// The build installs only what a committed lockfile pins: every package a
// registry.npmjs.org tarball with an integrity hash. No lockfile, a v1
// lockfile, a workspace link or a tarball from anywhere else — refused.
export function checkLockfile(src: string): LockReport {
  const candidates = ["npm-shrinkwrap.json", "package-lock.json"].map((n) => path.join(src, n))
  const file = candidates.find((f) => { try { return fs.lstatSync(f).isFile() } catch { return false } })
  if (!file) throw new Error("no package-lock.json; the launcher only builds extensions with a committed npm lockfile")
  if (fs.lstatSync(file).size > MAX_LOCKFILE) throw new Error("the lockfile is unreasonably large; refusing to build")
  let lock: any
  try { lock = JSON.parse(fs.readFileSync(file, "utf8")) } catch { throw new Error("the lockfile is not valid JSON") }
  if (!lock || typeof lock !== "object" || !(Number(lock.lockfileVersion) >= 2) || !lock.packages || typeof lock.packages !== "object") {
    throw new Error("the lockfile is lockfileVersion 1 or malformed; a v2+ package-lock.json is required")
  }
  let packages = 0
  for (const [key, entry] of Object.entries<any>(lock.packages)) {
    if (key === "") continue
    if (!/(^|\/)node_modules\//.test(key) || entry.link === true) throw new Error(`lockfile entry "${key}" is a workspace or link; only registry packages are accepted`)
    if (entry.inBundle === true) { packages++; continue }
    if (typeof entry.resolved !== "string" || !entry.resolved.startsWith(REGISTRY)) throw new Error(`"${key}" resolves to ${entry.resolved ?? "(nothing)"}; only ${REGISTRY} tarballs are accepted`)
    if (typeof entry.integrity !== "string" || !/^sha(512|256|1)-[A-Za-z0-9+/=]+$/.test(entry.integrity)) throw new Error(`"${key}" has no integrity hash in the lockfile`)
    packages++
  }
  return { file, sha256: sha256File(file), packages }
}

// npm always reads the checkout's own .npmrc; there is no flag to skip
// project config. Every key that matters is therefore pinned on the command
// line, which outranks every config file.
export function npmCi(src: string, log: Log) {
  fs.mkdirSync(NPM_CACHE_DIR, { recursive: true })
  // npm insists on two distinct config files; both are empty, so neither the
  // user's ~/.npmrc nor a global one has any say.
  const userRc = path.join(NPM_CACHE_DIR, "empty-user.npmrc"), globalRc = path.join(NPM_CACHE_DIR, "empty-global.npmrc")
  for (const rc of [userRc, globalRc]) fs.writeFileSync(rc, "", { mode: 0o600 })
  log("Installing dependencies (npm ci, scripts disabled, registry.npmjs.org only)…")
  const args = [
    "ci", "--ignore-scripts", "--no-bin-links", "--no-audit", "--no-fund", "--loglevel=error", "--no-update-notifier",
    "--registry=" + REGISTRY, "--strict-ssl=true", "--replace-registry-host=never",
    "--workspaces=false", "--include-workspace-root=false", "--install-links=false", "--foreground-scripts=false",
    "--global=false", "--location=project", "--prefix=" + src, "--cache=" + NPM_CACHE_DIR,
  ]
  const env: NodeJS.ProcessEnv = {
    ...process.env, npm_config_userconfig: userRc, npm_config_globalconfig: globalRc, npm_config_ignore_scripts: "true",
    NODE_OPTIONS: "", GIT_TERMINAL_PROMPT: "0",
  }
  run("npm", args, src, { env })
}
