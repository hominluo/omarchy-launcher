// Shared driver for the sidecar tests: spawns runtime/ext-host.js like the
// shell would, completes the handshake, loads a command, and collects frames.
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const readline = require("node:readline")

const BUNDLE = path.resolve(__dirname, "..", "runtime", "ext-host.js")

function startHost(opts = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ext-host-test-"))
  const child = spawn(process.execPath, [BUNDLE], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, HOME: home, ...(opts.env || {}) } })
  const rl = readline.createInterface({ input: child.stdout })
  const frames = []
  const waiters = []
  let stderr = ""
  child.stderr.on("data", (d) => { stderr += d })
  let nextId = 1
  const pending = new Map()
  const send = (m) => child.stdin.write(JSON.stringify(m) + "\n")
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId; nextId += 2
    pending.set(id, { resolve, reject })
    send({ jsonrpc: "2.0", id, method, params })
  })
  const hello = new Promise((resolve) => waiters.push({ test: (m) => m.method === "host.hello", resolve }))
  rl.on("line", (line) => {
    let msg; try { msg = JSON.parse(line) } catch { return }
    frames.push({ msg, bytes: Buffer.byteLength(line) })
    if (msg.id !== undefined && msg.method === undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result)
    } else if (msg.method && msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: msg.method === "ui.pushView" ? { view: "v9" } : { ok: true } })
    }
    for (const w of waiters.slice()) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg) }
  })
  const waitFor = (test, ms = 8000) => new Promise((resolve, reject) => {
    const hit = frames.find((f) => test(f.msg))
    if (hit) return resolve(hit.msg)
    const timer = setTimeout(() => reject(new Error("timed out waiting; stderr:\n" + stderr.slice(-2000))), ms)
    waiters.push({ test, resolve: (m) => { clearTimeout(timer); resolve(m) } })
  })
  const load = async (extDir, command) => {
    await hello
    await request("manager.hello", { protocol: 1, capabilities: { ai: false, windowManagement: false } })
    return request("manager.load", {
      s: "s1", extensionId: "test/" + path.basename(extDir), extensionDir: extDir,
      command: { name: command, mode: "view", title: command }, entrypoint: path.join(extDir, command + ".js"),
      preferences: {}, arguments: {}, launchType: "userInitiated",
      env: { appearance: "dark", textSize: "medium", isDevelopment: false },
      paths: { assets: path.join(extDir, "assets"), support: fs.mkdtempSync(path.join(home, "support-")) },
    })
  }
  const stop = () => { try { send({ jsonrpc: "2.0", method: "manager.shutdown", params: {} }) } catch {} setTimeout(() => { try { child.kill() } catch {} }, 500) }
  return { home, child, frames, request, hello, load, waitFor, stop, stderr: () => stderr }
}

module.exports = { startHost, FIXTURES: path.resolve(__dirname, "fixtures", "extensions") }
