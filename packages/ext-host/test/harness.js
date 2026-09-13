// Drives runtime/ext-host.js like the shell would: spawn, handshake, load a
// command, print renders, answer host requests. Usage:
//   node test/harness.js <extensionDir> <commandName> [mode] [seconds]
const { spawn } = require("node:child_process")
const path = require("node:path")
const readline = require("node:readline")

const [extDirArg, command, mode = "view", seconds = "8"] = process.argv.slice(2)
const extDir = extDirArg && path.resolve(extDirArg)
if (!extDir || !command) { console.error("usage: harness <extensionDir> <command> [mode] [seconds]"); process.exit(1) }
const bundle = path.resolve(__dirname, "../../../runtime/ext-host.js")
const child = spawn(process.execPath, [bundle], { stdio: ["pipe", "pipe", "inherit"] })
const rl = readline.createInterface({ input: child.stdout })
let id = 1
const send = (m) => child.stdin.write(JSON.stringify(m) + "\n")
const request = (method, params) => { const i = id; id += 2; send({ jsonrpc: "2.0", id: i, method, params }) }
let views = 0

rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line) } catch { console.log("RAW", line); return }
  if (msg.method === "host.hello") {
    console.log("hello:", JSON.stringify(msg.params))
    request("manager.hello", { protocol: 1, capabilities: { ai: false, windowManagement: true } })
    request("manager.load", {
      s: "s1", extensionId: "thomas/hacker-news", extensionDir: extDir,
      command: { name: command, mode, title: command }, entrypoint: path.join(extDir, command + ".js"),
      preferences: {}, arguments: {}, launchType: "userInitiated",
      env: { appearance: "dark", textSize: "medium", isDevelopment: false },
      paths: { assets: path.join(extDir, "assets"), support: "/tmp/claude-1000/-home-homin-Github-Omarchy/eb8361ca-527e-41e2-94aa-1ff911377fdc/scratchpad/ext-support" }
    })
    return
  }
  if (msg.method === "ui.render") {
    views++
    for (const v of msg.params.views) {
      const r = v.root
      const n = (r.sections || []).reduce((a, s) => a + s.items.length, 0)
      console.log(`render #${views} view=${v.view} type=${r.type} loading=${r.isLoading} items=${n} title=${JSON.stringify(r.navigationTitle || "")}`)
      if (n) { const it = r.sections[0].items[0]; console.log("  first item:", JSON.stringify({ id: it.id, title: it.title, subtitle: it.subtitle, icon: it.icon, accessories: it.accessories, actions: it.actions && it.actions.sections.map(s => s.actions.map(a => a.kind + ":" + a.title)) })) }
      if (r.emptyView) console.log("  empty:", JSON.stringify(r.emptyView))
    }
    return
  }
  if (msg.method) {
    console.log("host <-", msg.method, JSON.stringify(msg.params).slice(0, 300))
    if (msg.id !== undefined) {
      let result = { ok: true }
      if (msg.method === "ui.pushView") result = { view: "v" + (views + 100) }
      if (msg.method === "ui.alert") result = { confirmed: true }
      if (msg.method === "clipboard.read") result = { text: "" }
      send({ jsonrpc: "2.0", id: msg.id, result })
    }
    return
  }
  if (msg.id !== undefined) console.log("response", msg.id, JSON.stringify(msg.result || msg.error).slice(0, 200))
})

setTimeout(() => { request("manager.shutdown", {}); setTimeout(() => process.exit(0), 500) }, Number(seconds) * 1000)
