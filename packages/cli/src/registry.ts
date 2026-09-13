// extensions/index.json: what the shell reads to list extension commands.
import fs from "node:fs"
import path from "node:path"
import { EXT_DIR, INDEX_FILE } from "./paths"
import { scan } from "./compat"

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
  const tmp = INDEX_FILE + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2) + "\n")
  fs.renameSync(tmp, INDEX_FILE)
}

export function entryFor(dir: string, owner: string, name: string, install: any): IndexEntry {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
  const compat = scan(dir, manifest)
  const iconFile = manifest.icon ? path.join(dir, "assets", manifest.icon) : ""
  return {
    id: `${owner}/${name}`, owner, name,
    title: String(manifest.title || name), description: String(manifest.description || ""),
    icon: iconFile && fs.existsSync(iconFile) ? iconFile : "",
    dir, source: install.source || "store", commit: String(install.commit || ""), apiVersion: String(install.apiVersion || ""), installedAt: install.installedAt || Date.now(),
    compat,
    preferences: manifest.preferences || [],
    commands: (manifest.commands || []).map((c: any) => ({
      name: c.name, title: c.title || c.name, subtitle: c.subtitle || "", description: c.description || "", mode: c.mode || "view",
      icon: c.icon && fs.existsSync(path.join(dir, "assets", c.icon)) ? path.join(dir, "assets", c.icon) : "",
      keywords: c.keywords || [], arguments: c.arguments || [], preferences: c.preferences || [], interval: c.interval || "", disabledByDefault: c.disabledByDefault === true,
      compat: compat.commands[c.name] || { status: "full", notes: [] }
    })),
    tools: manifest.tools || []
  }
}

// Rebuild the index from whatever is on disk (each extension has install.json).
export function rebuild(): { version: number; extensions: IndexEntry[] } {
  const out: IndexEntry[] = []
  try {
    for (const owner of fs.readdirSync(EXT_DIR)) {
      const od = path.join(EXT_DIR, owner)
      if (!fs.statSync(od).isDirectory()) continue
      for (const name of fs.readdirSync(od)) {
        const dir = path.join(od, name)
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
