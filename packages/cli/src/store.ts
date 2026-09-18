// Raycast Store backend: metadata lookup only. The store's prebuilt zip is
// an opaque, unsigned download with no digest the client could check, so it
// is never installed; what the store does provide — the exact commit in
// raycast/extensions each listing was built from — is what gets fetched and
// built here (see source.ts).
import { cleanText, safeSegment } from "./fsio"

const API = "https://backend.raycast.com/api/v1"
const MAX_RESPONSE = 4 * 1024 * 1024
const TIMEOUT_MS = 20_000

export interface Resolved { owner: string; name: string }

export interface StoreMeta {
  owner: string; name: string; title: string; commit: string; relativePath: string
  apiVersion: string; storeUrl: string; killListedAt: string | null
}

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

// A JSON answer from the store, read as a stream under a byte cap.
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "accept": "application/json", "user-agent": "omarchy-launcher" }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const type = res.headers.get("content-type") || ""
  if (!/json/i.test(type)) throw new Error(`the store answered with ${type || "no content type"}, not JSON`)
  const declared = Number(res.headers.get("content-length") || 0)
  if (declared > MAX_RESPONSE) throw new Error("store response too large")
  const chunks: Buffer[] = []
  let total = 0
  const reader = res.body?.getReader()
  if (!reader) throw new Error("empty store response")
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE) { await reader.cancel(); throw new Error("store response too large") }
    chunks.push(Buffer.from(value))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

export async function search(query: string, perPage = 15): Promise<any[]> {
  const n = Math.max(1, Math.min(50, Math.floor(perPage)))
  const data = await getJson(`${API}/store_listings/search?q=${encodeURIComponent(query)}&per_page=${n}`)
  return Array.isArray(data && data.data) ? data.data : []
}

// Everything the store says that ends up in a path, an argv or on screen
// is validated here, once.
export function validateMeta(raw: any, fallbackOwner = ""): StoreMeta {
  if (!raw || typeof raw !== "object") throw new Error("the store answered with something that is not a listing")
  const owner = safeSegment((raw.owner && raw.owner.handle) || (raw.author && raw.author.handle) || fallbackOwner || "unknown", "store owner")
  const name = safeSegment(raw.name, "store extension name")
  const commit = String(raw.commit_sha || "")
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`the store lists no full commit for ${owner}/${name}; cannot pin it`)
  const rel = String(raw.relative_path || "").replace(/\/+$/, "")
  const m = rel.match(/^extensions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/)
  if (!m) throw new Error(`the store lists an unexpected source path "${rel}" for ${owner}/${name}`)
  return {
    owner, name, title: cleanText(raw.title || name, 120), commit, relativePath: rel,
    apiVersion: cleanText(raw.api_version || "", 32), storeUrl: cleanText(raw.store_url || "", 300),
    killListedAt: raw.kill_listed_at ? String(raw.kill_listed_at) : null,
  }
}

export async function lookup(spec: Resolved): Promise<StoreMeta> {
  if (spec.owner) return validateMeta(await getJson(`${API}/extensions/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.name)}`), spec.owner)
  // No owner given: search by name and take the exact match.
  const hits = await search(spec.name, 25)
  const exact = hits.find((h) => h && h.name === spec.name)
  if (!exact) throw new Error(`no store extension named "${spec.name}"; try owner/name`)
  const owner = (exact.owner && exact.owner.handle) || (exact.author && exact.author.handle)
  return validateMeta(await getJson(`${API}/extensions/${encodeURIComponent(owner)}/${encodeURIComponent(spec.name)}`), owner)
}
