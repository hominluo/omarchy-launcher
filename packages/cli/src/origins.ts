// Where each installed extension came from, kept outside the extension's
// own directory. An extension has full filesystem access once it runs; if
// `ext update` read its origin from a file the extension can rewrite, an
// update would clone and build whatever the extension chose.
import fs from "node:fs"
import { ORIGINS_FILE } from "./paths"
import { atomicWrite } from "./fsio"

export type Origin =
  | { kind: "store"; owner: string; name: string; commit: string }
  | { kind: "git"; url: string; ref?: string; commit: string; subdir?: string }
  | { kind: "local"; dir: string }

export function readOrigins(): Record<string, Origin> {
  try {
    const d = JSON.parse(fs.readFileSync(ORIGINS_FILE, "utf8"))
    if (d && typeof d === "object" && d.origins && typeof d.origins === "object") return d.origins
  } catch {}
  return {}
}

function writeOrigins(origins: Record<string, Origin>) {
  atomicWrite(ORIGINS_FILE, JSON.stringify({ version: 1, origins }, null, 2) + "\n", 0o600)
}

export function setOrigin(id: string, origin: Origin) {
  const all = readOrigins()
  all[id] = origin
  writeOrigins(all)
}

export function deleteOrigin(id: string) {
  const all = readOrigins()
  if (!(id in all)) return
  delete all[id]
  writeOrigins(all)
}
