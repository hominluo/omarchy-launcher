// Remote images an extension wants shown (list icons, detail pictures)
// are fetched here, in the sidecar, never by the shell: bounded in size,
// checked to actually be one of four raster formats, and handed over as a
// file the shell loads at display size. The shell process therefore never
// opens a network connection an extension chose, nor decodes bytes that
// were not sniffed first.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { atomicWrite } from "./fsio"

export const IMAGES_DIR = path.join(os.homedir(), ".cache", "omarchy-launcher", "images")
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const CACHE_BYTES = 50 * 1024 * 1024
const PARALLEL = 4
const EXTS = ["png", "jpg", "gif", "webp"]

const inflight = new Map<string, Promise<string>>()
let running = 0
const queue: Array<() => void> = []

function sniff(buf: Buffer): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "png"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"
  if (buf.length >= 6 && (buf.subarray(0, 6).toString("latin1") === "GIF87a" || buf.subarray(0, 6).toString("latin1") === "GIF89a")) return "gif"
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp"
  return ""
}

function keyFor(url: string) { return createHash("sha256").update(url).digest("hex") }

function cached(key: string): string {
  for (const ext of EXTS) {
    const p = path.join(IMAGES_DIR, `${key}.${ext}`)
    try {
      if (fs.lstatSync(p).isFile()) { const now = new Date(); try { fs.utimesSync(p, now, now) } catch {} return p }
    } catch {}
  }
  return ""
}

function evict() {
  let entries: Array<{ p: string; size: number; atime: number }> = []
  try {
    for (const name of fs.readdirSync(IMAGES_DIR)) {
      const p = path.join(IMAGES_DIR, name)
      try { const st = fs.lstatSync(p); if (st.isFile()) entries.push({ p, size: st.size, atime: st.atimeMs }) } catch {}
    }
  } catch { return }
  let total = entries.reduce((n, e) => n + e.size, 0)
  entries.sort((a, b) => a.atime - b.atime)
  for (const e of entries) {
    if (total <= CACHE_BYTES) break
    try { fs.unlinkSync(e.p); total -= e.size } catch {}
  }
}

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((resolve) => queue.push(resolve))
  running++
  try { return await fn() } finally { running--; const next = queue.shift(); if (next) next() }
}

async function download(url: string): Promise<string> {
  const u = new URL(url)
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad scheme")
  const key = keyFor(url)
  const hit = cached(key)
  if (hit) return hit
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow", headers: { accept: "image/*", "user-agent": "omarchy-launcher" } })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const declared = Number(res.headers.get("content-length") || 0)
  if (declared > MAX_BYTES) throw new Error("image too large")
  const reader = res.body?.getReader()
  if (!reader) throw new Error("empty response")
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error("image too large") }
    chunks.push(Buffer.from(value))
  }
  const buf = Buffer.concat(chunks)
  const ext = sniff(buf)
  if (!ext) throw new Error("not an image")
  fs.mkdirSync(IMAGES_DIR, { recursive: true, mode: 0o700 })
  const file = path.join(IMAGES_DIR, `${key}.${ext}`)
  atomicWrite(file, buf, 0o600)
  evict()
  return file
}

// The cached file for `url`, fetching it if needed; concurrent callers for
// the same URL share one fetch, and at most PARALLEL run at once.
export function fetchImage(url: string): Promise<string> {
  const text = String(url || "")
  if (text.length > 2048) return Promise.reject(new Error("url too long"))
  const pending = inflight.get(text)
  if (pending) return pending
  const p = slot(() => download(text)).finally(() => inflight.delete(text))
  inflight.set(text, p)
  return p
}
