// Filesystem helpers that never trust a pathname twice.
import fs from "node:fs"
import path from "node:path"
import { createHash, randomBytes } from "node:crypto"
import { EXT_DIR } from "./paths"

const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants

// Replace `file` with `data` through an unpredictable O_EXCL|O_NOFOLLOW temp
// beside it: a symlink planted at a guessable name can never redirect the
// write, the descriptor is checked to be our own fresh regular file, and the
// temp is fsynced before it is renamed into place.
export function atomicWrite(file: string, data: string | Buffer, mode = 0o600) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  let tmp = "", fd = -1
  for (let i = 0; i < 32 && fd < 0; i++) {
    tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(8).toString("hex")}.tmp`)
    try { fd = fs.openSync(tmp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode) } catch (e: any) { if (e.code !== "EEXIST") throw e }
  }
  if (fd < 0) throw new Error(`could not create a temporary file beside ${file}`)
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile() || st.uid !== process.getuid!() || st.nlink !== 1) throw new Error(`unexpected file at ${tmp}; refusing to write`)
    fs.writeSync(fd, data as any)
    fs.fsyncSync(fd)
    fs.closeSync(fd); fd = -1
    fs.renameSync(tmp, file)
  } catch (e) {
    if (fd >= 0) try { fs.closeSync(fd) } catch {}
    try { fs.unlinkSync(tmp) } catch {}
    throw e
  }
}

// Store metadata and extension manifests decide which directory under
// EXT_DIR an extension lives in — and is later removed from. Only a plain
// single path component may become one.
export const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export function safeSegment(value: any, what: string): string {
  const s = String(value ?? "")
  if (!SEGMENT.test(s)) throw new Error(`${what} "${s}" is not a safe directory name`)
  return s
}

export function plainName(value: any): boolean {
  return typeof value === "string" && SEGMENT.test(value)
}

// A relative directory inside a checkout (`extensions/hacker-news`): plain
// segments only, so it can neither climb out nor read as a git option.
export function safeRelDir(value: any, what: string): string {
  const s = String(value ?? "").replace(/^\/+|\/+$/g, "")
  if (!s) throw new Error(`${what} is empty`)
  const parts = s.split("/")
  for (const part of parts) safeSegment(part, what)
  return parts.join("/")
}

// Text from the store or a manifest that will be printed or shown: no
// control characters, no bidi overrides, bounded length.
export function cleanText(value: any, max = 200): string {
  return String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f‪-‮⁦-⁩]/g, "").slice(0, max)
}

export function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

// Nothing is ever removed recursively — or renamed into place — unless it
// sits strictly inside the real EXT_DIR. Resolved through realpath: a
// symlinked owner directory planted under EXT_DIR would otherwise pass a
// purely lexical check and redirect the removal.
export function assertInsideExtDir(p: string) {
  const abs = path.resolve(p)
  let extReal: string, parentReal: string
  try { extReal = fs.realpathSync(EXT_DIR) } catch { throw new Error(`refusing to touch ${p}: ${EXT_DIR} does not exist`) }
  try { parentReal = fs.realpathSync(path.dirname(abs)) } catch { throw new Error(`refusing to touch ${p}: its parent does not exist`) }
  const rel = path.relative(extReal, path.join(parentReal, path.basename(abs)))
  if (!rel || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) throw new Error(`refusing to touch ${p}: not inside ${EXT_DIR}`)
  let st: fs.Stats | null = null
  try { st = fs.lstatSync(abs) } catch (e: any) { if (e.code !== "ENOENT") throw e }
  if (st && st.isSymbolicLink()) throw new Error(`refusing to touch ${p}: it is a symlink`)
}

// Copy a tree of regular files. Symlinks, devices and the like are refused
// outright rather than followed, and the total is capped.
export function copyTreeNoSymlinks(src: string, dst: string, maxBytes = 50 * 1024 * 1024) {
  let total = 0
  const walk = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true })
    for (const name of fs.readdirSync(from)) {
      const s = path.join(from, name), d = path.join(to, name)
      const st = fs.lstatSync(s)
      if (st.isDirectory()) { walk(s, d); continue }
      if (!st.isFile()) throw new Error(`${s} is not a regular file; refusing to copy it`)
      total += st.size
      if (total > maxBytes) throw new Error(`assets exceed ${Math.round(maxBytes / (1024 * 1024))} MB; refusing to install`)
      fs.copyFileSync(s, d, fs.constants.COPYFILE_EXCL)
    }
  }
  walk(src, dst)
}
