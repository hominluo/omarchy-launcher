// Scripted interaction test against the ticker fixture: push, toast, copy.
const { spawn } = require("node:child_process")
const path = require("node:path")
const readline = require("node:readline")
const extDir = process.argv[2]
const bundle = path.resolve(__dirname, "../../../runtime/ext-host.js")
const child = spawn(process.execPath, [bundle], { stdio: ["pipe", "pipe", "inherit"] })
const rl = readline.createInterface({ input: child.stdout })
let id = 1
const send = (m) => child.stdin.write(JSON.stringify(m) + "\n")
const request = (method, params) => { const i = id; id += 2; send({ jsonrpc: "2.0", id: i, method, params }) }
const notify = (method, params) => send({ jsonrpc: "2.0", method, params })
let step = 0, pushed = 0
const seen = []
rl.on("line", (line) => {
  const msg = JSON.parse(line)
  if (msg.method === "host.hello") {
    request("manager.hello", { protocol: 1 })
    request("manager.load", { s: "s1", extensionId: "test/ticker", extensionDir: extDir, command: { name: "ticker", mode: "view", title: "Ticker" }, entrypoint: path.join(extDir, "ticker.js"), preferences: {}, arguments: {}, launchType: "userInitiated", env: { appearance: "dark", textSize: "medium", isDevelopment: false }, paths: { assets: extDir + "/assets", support: "/tmp/claude-1000/-home-homin-Github-Omarchy/eb8361ca-527e-41e2-94aa-1ff911377fdc/scratchpad/ext-support" } })
    return
  }
  if (msg.method === "ui.render") {
    for (const v of msg.params.views) {
      seen.push(v.view + ":" + v.root.type)
      if (v.view === "v0" && step === 0) {
        step = 1
        const item = v.root.sections[0].items[0]
        const actions = item.actions.sections[0].actions
        console.log("actions:", actions.map(a => `${a.kind}/${a.id}/${a.callbackId}`).join("  "))
        notify("ui.callback", { s: "s1", h: actions[0].id, args: [] })           // Toast
        notify("ui.callback", { s: "s1", h: actions[2].id, args: [] })           // Push detail
      }
      if (v.root.type === "detail") { console.log("detail rendered:", v.view, JSON.stringify(v.root.markdown)); notify("ui.viewPopped", { s: "s1", view: v.view }) }
    }
    return
  }
  if (msg.method === "ui.pushView") { pushed++; send({ jsonrpc: "2.0", id: msg.id, result: { view: "v" + pushed } }); console.log("pushView ->", "v" + pushed); return }
  if (msg.method === "ui.toast.show") { console.log("toast:", msg.params.title, msg.params.style); return }
  if (msg.method && msg.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, result: { ok: true } })
})
setTimeout(() => { console.log("views seen:", seen.join(" ")); request("manager.shutdown", {}); setTimeout(() => process.exit(0), 300) }, 2500)
