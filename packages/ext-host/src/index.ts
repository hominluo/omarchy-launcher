// Sidecar entry. Main thread: NDJSON transport to omarchy-shell, one worker
// per command session, routing by session id. Worker thread: see worker.ts.
import { isMainThread, Worker, workerData } from "node:worker_threads"
import { Transport } from "./transport"
import { PROTOCOL_VERSION, LoadParams } from "./protocol"
import * as ai from "./ai/provider"

if (!isMainThread) {
  require("./worker").runWorker(workerData)
} else {
  main()
}

interface Session {
  id: string
  worker: Worker
  params: LoadParams
  ready: boolean
  readyWaiters: Array<() => void>
  unloadTimer?: NodeJS.Timeout
}

function main() {
  process.title = "omarchy-launcher-ext-host"
  const transport = new Transport(process.stdin, process.stdout)
  const sessions = new Map<string, Session>()
  const unloading = new Set<string>()
  const aiAborts = new Map<string, AbortController>()
  let hostInfo: any = null
  let shuttingDown = false

  const log = (line: string) => process.stderr.write("[ext-host] " + line + "\n")

  transport.onRequest = async (method, params, id) => {
    switch (method) {
      case "manager.hello":
        hostInfo = Object.assign({}, params || {})
        hostInfo.capabilities = Object.assign({}, hostInfo.capabilities || {}, { ai: ai.isConfigured() })
        if (hostInfo.protocol !== undefined && hostInfo.protocol < PROTOCOL_VERSION) throw new Error(`host protocol ${hostInfo.protocol} is older than ${PROTOCOL_VERSION}`)
        return { ok: true }
      case "manager.load":
        return load(params as LoadParams)
      case "manager.unload":
        unload(String(params.s), false)
        return { ok: true }
      case "manager.shutdown":
        shuttingDown = true
        for (const s of Array.from(sessions.keys())) unload(s, true)
        setTimeout(() => process.exit(0), 200)
        return { ok: true }
      case "manager.status":
        return { sessions: Array.from(sessions.values()).map((s) => ({ id: s.id, extension: s.params.extensionId, command: s.params.command.name, ready: s.ready })), rss: process.memoryUsage().rss, ai: ai.configuredProviders() }
      case "ai.status":
        return { providers: ai.configuredProviders(), default: ai.resolve(null) }
      case "ai.chat": {
        // Host-side chat: params { id, messages:[{role,content}], model?, creativity?, system? }
        const ctrl = new AbortController()
        aiAborts.set(String(params.id), ctrl)
        let text = ""
        try {
          for await (const chunk of ai.stream(params.messages || [], { model: params.model, creativity: params.creativity, system: params.system, signal: ctrl.signal })) {
            text += chunk
            transport.notify("ai.chunk", { id: params.id, text: chunk })
          }
        } finally { aiAborts.delete(String(params.id)) }
        return { text }
      }
      default:
        throw new Error("unknown method " + method)
    }
  }

  transport.onNotification = (method, params) => {
    if (method === "manager.unload") { unload(String(params && params.s), false); return }
    if (method === "manager.shutdown") { shuttingDown = true; for (const s of Array.from(sessions.keys())) unload(s, true); setTimeout(() => process.exit(0), 200); return }
    const s = params && params.s ? sessions.get(String(params.s)) : null
    if (s) { s.worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method, params } }); return }
    if (method === "oauth.callback") {
      for (const sess of sessions.values()) sess.worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method, params } })
      return
    }
    if (method === "ai.abort") { const c = aiAborts.get(String(params && params.id)); if (c) c.abort(); return }
    log("notification for unknown session: " + method)
  }

  // Responses from the host to worker-originated requests carry "<session>:<n>" ids.
  const origDispatch = transport.dispatch.bind(transport)
  transport.dispatch = (msg: any) => {
    if (msg && msg.method === undefined && typeof msg.id === "string" && msg.id.indexOf(":") > 0) {
      const sid = msg.id.slice(0, msg.id.indexOf(":"))
      const s = sessions.get(sid)
      if (s) s.worker.postMessage({ type: "rpc", msg })
      return
    }
    origDispatch(msg)
  }

  function load(params: LoadParams): Promise<any> {
    if (!params || !params.s) throw new Error("manager.load needs a session id")
    if (sessions.has(params.s)) unload(params.s, true)
    const worker = new Worker(__filename, {
      workerData: { role: "worker", load: params, host: hostInfo },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
      stdout: true,
      stderr: true
    })
    const session: Session = { id: params.s, worker, params, ready: false, readyWaiters: [] }
    sessions.set(params.s, session)

    worker.stdout.on("data", (d) => process.stderr.write(`[${params.extensionId}] ${d}`))
    worker.stderr.on("data", (d) => process.stderr.write(`[${params.extensionId}] ${d}`))
    worker.on("message", (m: any) => {
      if (!m || typeof m !== "object") return
      if (m.type === "rpc") {
        const msg = m.msg
        // AI requests from extensions are served here, not by the shell.
        if (msg && msg.method === "ai.ask" && msg.id !== undefined) { serveAiAsk(worker, msg); return }
        if (msg && msg.method === "ai.abort") { const c = aiAborts.get(String(msg.params && msg.params.id)); if (c) c.abort(); return }
        transport.write(msg)
        return
      }
      if (m.type === "ready") { session.ready = true; for (const w of session.readyWaiters) w(); session.readyWaiters = []; return }
      if (m.type === "log") { log(`[${params.extensionId}] ${m.line}`); return }
      if (m.type === "ended") { transport.notify("manager.sessionEnded", { s: params.s, reason: m.reason || "finished" }); unload(params.s, false); return }
    })
    worker.on("error", (err) => {
      log(`worker error (${params.extensionId}): ${err && err.stack || err}`)
      transport.notify("manager.crash", { s: params.s, reason: String(err && err.message || err), stack: String(err && err.stack || "") })
      sessions.delete(params.s)
    })
    worker.on("exit", (code) => {
      if (sessions.get(params.s) === session) sessions.delete(params.s)
      const intentional = unloading.delete(params.s)
      if (code !== 0 && !shuttingDown && !intentional) transport.notify("manager.crash", { s: params.s, reason: "worker exited with code " + code, stack: "" })
    })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("handshake_timeout")), 5000)
      session.readyWaiters.push(() => { clearTimeout(timer); resolve({ ok: true }) })
    })
  }

  async function serveAiAsk(worker: Worker, msg: any) {
    const p = msg.params || {}
    const ctrl = new AbortController()
    aiAborts.set(String(p.id), ctrl)
    let text = ""
    try {
      for await (const chunk of ai.stream([{ role: "user", content: String(p.prompt || "") }], { model: p.model, creativity: p.creativity, signal: ctrl.signal })) {
        text += chunk
        worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method: "ai.chunk", params: { id: p.id, text: chunk } } })
      }
      worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", id: msg.id, result: { text } } })
    } catch (e: any) {
      worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(e && e.message || e) } } })
    } finally { aiAborts.delete(String(p.id)) }
  }

  function unload(sid: string, immediate: boolean) {
    const s = sessions.get(sid)
    if (!s) return
    sessions.delete(sid)
    unloading.add(sid)
    try { s.worker.postMessage({ type: "unload" }) } catch {}
    const kill = () => { s.worker.terminate().catch(() => {}) }
    if (immediate) kill()
    else s.unloadTimer = setTimeout(kill, 3000)
  }

  process.stdin.on("end", () => { for (const s of Array.from(sessions.keys())) unload(s, true); setTimeout(() => process.exit(0), 100) })

  transport.notify("host.hello", {
    protocol: PROTOCOL_VERSION,
    minProtocol: PROTOCOL_VERSION,
    runtime: "omarchy-launcher-ext-host",
    version: "0.1.0",
    node: process.version,
    pid: process.pid,
    capabilities: ["view", "no-view", "oauth", "ai"],
    ai: ai.configuredProviders()
  })
}
