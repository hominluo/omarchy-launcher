// Raycast Store backend: metadata lookup and prebuilt bundle download.
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { CACHE_DIR } from "./paths"

const API = "https://backend.raycast.com/api/v1"

export interface Resolved { owner: string; name: string }

// Accepts owner/name, raycast.com store URLs, and github.com/raycast/extensions paths.
export function resolveSpec(spec: string): Resolved | null {
  let s = spec.trim()
  let m = s.match(/raycast\.com\/([^/\s]+)\/([^/\s?#]+)/)
  if (m) return { owner: m[1], name: m[2] }
  m = s.match(/github\.com\/raycast\/extensions\/(?:tree|blob)\/[^/]+\/extensions\/([^/\s?#]+)/)
  if (m) return { owner: "", name: m[1] }
  m = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (m) return { owner: m[1], name: m[2] }
  m = s.match(/^([A-Za-z0-9_.-]+)$/)
  if (m) return { owner: "", name: m[1] }
  return null
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "accept": "application/json", "user-agent": "omarchy-launcher" } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

export async function search(query: string, perPage = 15): Promise<any[]> {
  const data = await getJson(`${API}/store_listings/search?q=${encodeURIComponent(query)}&per_page=${perPage}`)
  return Array.isArray(data && data.data) ? data.data : []
}

export async function lookup(spec: Resolved): Promise<any> {
  if (spec.owner) return getJson(`${API}/extensions/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.name)}`)
  // No owner given: search by name and take the exact match.
  const hits = await search(spec.name, 25)
  const exact = hits.find((h) => h.name === spec.name)
  if (!exact) throw new Error(`no store extension named "${spec.name}"; try owner/name`)
  const owner = (exact.owner && exact.owner.handle) || (exact.author && exact.author.handle)
  return getJson(`${API}/extensions/${encodeURIComponent(owner)}/${encodeURIComponent(spec.name)}`)
}

export async function download(meta: any, dest: string): Promise<string> {
  const url = meta.download_url
  if (!url) throw new Error("the store did not return a download URL")
  fs.mkdirSync(path.join(CACHE_DIR, "downloads"), { recursive: true })
  const zip = path.join(CACHE_DIR, "downloads", `${meta.name}-${String(meta.commit_sha || "latest").slice(0, 12)}.zip`)
  const res = await fetch(url, { headers: { "user-agent": "omarchy-launcher" } })
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  const staging = fs.mkdtempSync(path.join(CACHE_DIR, "stage-"))
  execFileSync("bsdtar", ["-xf", zip, "-C", staging])
  // The zip holds one top-level folder named after the extension.
  const entries = fs.readdirSync(staging)
  const inner = entries.length === 1 ? path.join(staging, entries[0]) : staging
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(inner, dest)
  fs.rmSync(staging, { recursive: true, force: true })
  for (const f of fs.readdirSync(dest)) if (f.endsWith(".js.map")) fs.rmSync(path.join(dest, f))
  const tools = path.join(dest, "tools")
  try { for (const f of fs.readdirSync(tools)) if (f.endsWith(".js.map")) fs.rmSync(path.join(tools, f)) } catch {}
  return dest
}
