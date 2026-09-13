// `launcher` — command line for the Omarchy Launcher plugin.
import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { resolveSpec, lookup, download, search } from "./store"
import { readIndex, rebuild, entryFor, writeIndex } from "./registry"
import { EXT_DIR, PLUGIN_ID, CONFIG_DIR, DATA_DIR, STATE_DIR, PREFS_DIR } from "./paths"

const USAGE = `launcher — Omarchy Launcher command line

  launcher ext search <query>            search the Raycast Store
  launcher ext install <owner/name|url>  install a store extension (prebuilt, no toolchain needed)
  launcher ext update [owner/name]       update one or every store extension
  launcher ext remove <owner/name>       remove an extension
  launcher ext list [--json]             installed extensions and their commands
  launcher ext reindex                   rebuild the extension index from disk
  launcher ext prefs <owner/name>        open the extension's preferences in the launcher
  launcher open [json]                   open the launcher (optional payload)
  launcher run <command-id>              run a launcher command, e.g. cmd:clipboard
  launcher url <uri>                     handle a raycast:// or omarchy-launcher:// link
  launcher status                        runtime status
`

function shell(method: string, ...args: string[]) {
  const r = spawnSync("omarchy-shell", [PLUGIN_ID, method, ...args], { encoding: "utf8" })
  return (r.stdout || "").trim()
}

function b64(json: any) { return Buffer.from(JSON.stringify(json)).toString("base64") }

async function extInstall(spec: string) {
  const r = resolveSpec(spec)
  if (!r) throw new Error(`cannot parse "${spec}"; use owner/name or a store URL`)
  process.stdout.write(`Looking up ${r.owner ? r.owner + "/" : ""}${r.name}…\n`)
  const meta = await lookup(r)
  if (meta.kill_listed_at) throw new Error("this extension was removed from the store")
  const owner = (meta.owner && meta.owner.handle) || (meta.author && meta.author.handle) || r.owner || "unknown"
  const dest = path.join(EXT_DIR, owner, meta.name)
  process.stdout.write(`Downloading ${meta.title} (${owner}/${meta.name}, api ${meta.api_version})…\n`)
  await download(meta, dest)
  fs.writeFileSync(path.join(dest, "install.json"), JSON.stringify({ source: "store", owner, name: meta.name, commit: meta.commit_sha, apiVersion: meta.api_version, installedAt: Date.now(), storeUrl: meta.store_url || "" }, null, 2))
  const idx = readIndex()
  const entry = entryFor(dest, owner, meta.name, JSON.parse(fs.readFileSync(path.join(dest, "install.json"), "utf8")))
  idx.extensions = idx.extensions.filter((e) => e.id !== entry.id).concat([entry]).sort((a, b) => a.id.localeCompare(b.id))
  writeIndex(idx)
  process.stdout.write(`Installed ${entry.title}: ${entry.commands.map((c: any) => c.title).join(", ")}\n`)
  if (entry.compat.status !== "full") process.stdout.write(`Compatibility: ${entry.compat.status} (${entry.compat.notes.join("; ")})\n`)
  const required = entry.preferences.filter((p: any) => p.required && p.default === undefined)
  if (required.length) process.stdout.write(`Needs configuration before first run: ${required.map((p: any) => p.title || p.name).join(", ")} — the launcher will ask.\n`)
  shell("reindex")
}

async function extUpdate(spec?: string) {
  const idx = readIndex()
  const targets = spec ? idx.extensions.filter((e) => e.id === spec || e.name === spec) : idx.extensions.filter((e) => e.source === "store")
  if (!targets.length) throw new Error("nothing to update")
  for (const e of targets) {
    const meta = await lookup({ owner: e.owner, name: e.name })
    if (meta.commit_sha === e.commit) { process.stdout.write(`${e.id}: up to date\n`); continue }
    process.stdout.write(`${e.id}: ${String(e.commit).slice(0, 7)} → ${String(meta.commit_sha).slice(0, 7)}\n`)
    await extInstall(`${e.owner}/${e.name}`)
  }
}

function extRemove(spec: string) {
  const idx = readIndex()
  const e = idx.extensions.find((x) => x.id === spec || x.name === spec)
  if (!e) throw new Error(`not installed: ${spec}`)
  fs.rmSync(e.dir, { recursive: true, force: true })
  idx.extensions = idx.extensions.filter((x) => x.id !== e.id)
  writeIndex(idx)
  process.stdout.write(`Removed ${e.id}\n`)
  shell("reindex")
}

function extList(json: boolean) {
  const idx = readIndex()
  if (json) { process.stdout.write(JSON.stringify(idx, null, 2) + "\n"); return }
  if (!idx.extensions.length) { process.stdout.write("No extensions installed. Try: launcher ext install thomas/hacker-news\n"); return }
  for (const e of idx.extensions) {
    process.stdout.write(`${e.id}  ${e.title}  [${e.compat.status}]\n`)
    for (const c of e.commands) process.stdout.write(`    ${c.name.padEnd(28)} ${c.title}  (${c.mode}${c.compat && c.compat.status !== "full" ? ", " + c.compat.status : ""})\n`)
  }
}

async function extSearch(query: string) {
  const hits = await search(query)
  if (!hits.length) { process.stdout.write("No results.\n"); return }
  for (const h of hits) {
    const owner = (h.owner && h.owner.handle) || (h.author && h.author.handle) || "?"
    const mac = Array.isArray(h.platforms) && h.platforms.length === 1 && h.platforms[0] === "macOS" ? "  (macOS only)" : ""
    process.stdout.write(`${(owner + "/" + h.name).padEnd(40)} ${h.title}${mac}\n`)
  }
}

function handleUrl(uri: string) {
  let u: URL
  try { u = new URL(uri) } catch { throw new Error("not a URL: " + uri) }
  const parts = (u.host + u.pathname).split("/").filter(Boolean)
  const q = u.searchParams
  const parse = (v: string | null) => { if (!v) return undefined; try { return JSON.parse(v) } catch { return undefined } }
  if (parts[0] === "extensions" && parts.length >= 4) {
    const payload: any = { extension: `${parts[1]}/${parts[2]}`, command: parts[3], arguments: parse(q.get("arguments")) || {}, context: parse(q.get("context")), launchType: q.get("launchType") || "userInitiated", fallbackText: q.get("fallbackText") || undefined }
    process.stdout.write(shell("open", b64(payload)) + "\n")
    return
  }
  if (parts[0] === "oauth") {
    process.stdout.write(shell("oauth", b64({ state: q.get("state"), code: q.get("code"), error: q.get("error") })) + "\n")
    return
  }
  if (parts[0] === "script-commands" && parts[1]) { process.stdout.write(shell("open", b64({ query: decodeURIComponent(parts[1]) })) + "\n"); return }
  if (parts[0] === "confetti") { spawnSync("omarchy-notification-send", ["🎉", "Confetti!"]); return }
  if (parts[0] === "quicklink" && parts[1]) { process.stdout.write(shell("open", b64({ command: "ql:" + parts[1], arguments: { query: q.get("query") || "" } })) + "\n"); return }
  if (parts[0] === "open") { process.stdout.write(shell("open", b64({ command: q.get("view") ? "cmd:" + q.get("view") : undefined, query: q.get("query") || "" })) + "\n"); return }
  if (parts[0] === "toggle" || parts.length === 0) { process.stdout.write(shell("toggle") + "\n"); return }
  throw new Error("unsupported link: " + uri)
}

async function main(argv: string[]) {
  const [cmd, sub, ...rest] = argv
  for (const d of [CONFIG_DIR, DATA_DIR, STATE_DIR, EXT_DIR, PREFS_DIR]) fs.mkdirSync(d, { recursive: true })
  switch (cmd) {
    case "ext":
      if (sub === "install") { for (const s of rest) await extInstall(s); return }
      if (sub === "update") { await extUpdate(rest[0]); return }
      if (sub === "remove" || sub === "uninstall") { extRemove(rest[0]); return }
      if (sub === "list" || sub === undefined) { extList(rest.includes("--json")); return }
      if (sub === "search") { await extSearch(rest.join(" ")); return }
      if (sub === "reindex") { const idx = rebuild(); process.stdout.write(`${idx.extensions.length} extension(s)\n`); shell("reindex"); return }
      if (sub === "prefs") { process.stdout.write(shell("open", b64({ command: "cmd:preferences", arguments: { extension: rest[0] } })) + "\n"); return }
      break
    case "open": process.stdout.write(shell("open", b64(sub ? JSON.parse(sub) : {})) + "\n"); return
    case "run": process.stdout.write(shell("run", sub) + "\n"); return
    case "toggle": process.stdout.write(shell("toggle") + "\n"); return
    case "url": handleUrl(sub); return
    case "status": process.stdout.write(shell("status") + "\n"); return
    case "-h": case "--help": case "help": case undefined: process.stdout.write(USAGE); return
  }
  process.stderr.write(USAGE)
  process.exit(1)
}

main(process.argv.slice(2)).catch((e) => { process.stderr.write("launcher: " + (e && e.message || e) + "\n"); process.exit(1) })
