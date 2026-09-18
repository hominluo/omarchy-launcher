// extensions/index.json: what the shell reads to list extension commands.
import fs from "node:fs"
import path from "node:path"
import { EXT_DIR, INDEX_FILE } from "./paths"
import { scan } from "./compat"
import { atomicWrite, plainName, SEGMENT } from "./fsio"

export interface IndexEntry {
  id: string; owner: string; name: string; title: string; description: string; icon: string; dir: string
  source: string; commit: string; apiVersion: string; installedAt: number
  compat: any; preferences: any[]; commands: any[]; tools: any[]
}

export function readIndex(): { version: number; extensions: IndexEntry[] } {
  try {
    const d = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"))
    if (d && Array.isArray(d.extensions)) return d
  } catch {}
  return { version: 1, extensions: [] }
}

export function writeIndex(idx: { version: number; extensions: IndexEntry[] }) {
  fs.mkdirSync(EXT_DIR, { recursive: true })
  atomicWrite(INDEX_FILE, JSON.stringify(idx, null, 2) + "\n", 0o644)
}

// An asset file name from the manifest: one plain component under assets/.
function assetPath(dir: string, value: any): string {
  if (!plainName(value)) return ""
  const p = path.join(dir, "assets", value)
  try { return fs.lstatSync(p).isFile() ? p : "" } catch { return "" }
}

// Command and tool names become file names next to the bundles and are
// what the host requires(); only plain names are listed at all.
export function entryFor(dir: string, owner: string, name: string, install: any): IndexEntry {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
  const commands = (Array.isArray(manifest.commands) ? manifest.commands : []).filter((c: any) => c && plainName(c.name))
  const tools = (Array.isArray(manifest.tools) ? manifest.tools : []).filter((t: any) => t && plainName(t.name))
  const compat = scan(dir, { ...manifest, commands })
  return {
    id: `${owner}/${name}`, owner, name,
    title: String(manifest.title || name), description: String(manifest.description || ""),
    icon: assetPath(dir, manifest.icon),
    dir, source: install.source || "store", commit: String(install.commit || ""), apiVersion: String(install.apiVersion || ""), installedAt: install.installedAt || Date.now(),
    compat,
    preferences: Array.isArray(manifest.preferences) ? manifest.preferences : [],
    commands: commands.map((c: any) => ({
      name: c.name, title: c.title || c.name, subtitle: c.subtitle || "", description: c.description || "", mode: c.mode || "view",
      icon: assetPath(dir, c.icon),
      keywords: Array.isArray(c.keywords) ? c.keywords : [], arguments: Array.isArray(c.arguments) ? c.arguments : [],
      preferences: Array.isArray(c.preferences) ? c.preferences : [], interval: c.interval || "", disabledByDefault: c.disabledByDefault === true,
      compat: compat.commands[c.name] || { status: "full", notes: [] }
    })),
    tools
  }
}

// Rebuild the index from whatever is on disk (each extension has install.json).
export function rebuild(): { version: number; extensions: IndexEntry[] } {
  const out: IndexEntry[] = []
  // Directory names on disk are what an entry's id and `dir` are built
  // from; a name that is not a plain segment, or a symlink standing in for
  // a directory, is skipped rather than followed.
  const isDir = (p: string) => { try { return fs.lstatSync(p).isDirectory() } catch { return false } }
  try {
    for (const owner of fs.readdirSync(EXT_DIR)) {
      const od = path.join(EXT_DIR, owner)
      if (!SEGMENT.test(owner) || !isDir(od)) continue
      for (const name of fs.readdirSync(od)) {
        const dir = path.join(od, name)
        if (!SEGMENT.test(name) || !isDir(dir)) continue
        if (!fs.existsSync(path.join(dir, "package.json"))) continue
        let install: any = {}
        try { install = JSON.parse(fs.readFileSync(path.join(dir, "install.json"), "utf8")) } catch {}
        try { out.push(entryFor(dir, owner, name, install)) } catch (e) { process.stderr.write(`skipping ${dir}: ${e}\n`) }
      }
    }
  } catch {}
  const idx = { version: 1, extensions: out.sort((a, b) => a.id.localeCompare(b.id)) }
  writeIndex(idx)
  return idx
}
