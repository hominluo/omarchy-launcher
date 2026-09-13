// One command session: installs the API client, patches require, loads the
// extension bundle, renders it through the reconciler, and serializes every
// commit into the JSON view model for the shell.
import { parentPort } from "node:worker_threads"
import * as fs from "node:fs"
import * as path from "node:path"
import * as React from "react"
import { LoadParams } from "./protocol"
import { setClient, SessionClient } from "./api/client"
import { patchRequire } from "./patch-require"
import { Callbacks } from "./callbacks"
import { createRenderer, Instance } from "./reconciler"
import { serializeView } from "./viewmodel"

export function runWorker(data: { load: LoadParams; host: any }) {
  const load = data.load
  const sid = load.s
  const port = parentPort!
  const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>()
  const handlers = new Map<string, (params: any) => void>()
  let nextId = 0

  const post = (msg: any) => port.postMessage({ type: "rpc", msg })
  const log = (line: string) => port.postMessage({ type: "log", line })

  const client: SessionClient = {
    sessionId: sid,
    request(method, params) {
      const id = `${sid}:${++nextId}`
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        post({ jsonrpc: "2.0", id, method, params: { s: sid, ...(params || {}) } })
      })
    },
    notify(method, params) { post({ jsonrpc: "2.0", method, params: { s: sid, ...(params || {}) } }) },
    on(method, handler) { handlers.set(method, handler) },
    env: {
      appearance: load.env.appearance, textSize: load.env.textSize, isDevelopment: load.env.isDevelopment,
      extensionName: load.extensionId.split("/").pop() || load.extensionId,
      ownerOrAuthorName: load.extensionId.split("/")[0] || "",
      commandName: load.command.name, commandMode: load.command.mode,
      assetsPath: load.paths.assets, supportPath: load.paths.support,
      launchType: load.launchType, launchContext: load.launchContext,
      capabilities: Object.assign({}, (data.host && data.host.capabilities) || {}, { ai: !!(data.host && data.host.capabilities && data.host.capabilities.ai) })
    },
    preferences: load.preferences || {},
    navigation: null,
    log
  }
  setClient(client)
  try { fs.mkdirSync(load.paths.support, { recursive: true }) } catch {}

  port.on("message", (m: any) => {
    if (!m || typeof m !== "object") return
    if (m.type === "rpc") {
      const msg = m.msg
      if (msg.method) { const h = handlers.get(msg.method); if (h) { try { h(msg.params || {}) } catch (e: any) { log(`handler ${msg.method} threw: ${e && e.stack || e}`) } } else log("unhandled: " + msg.method); return }
      if (msg.id !== undefined) {
        const p = pending.get(msg.id)
        if (!p) return
        pending.delete(msg.id)
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message || "rpc error"), msg.error))
        else p.resolve(msg.result)
      }
      return
    }
    if (m.type === "unload") { teardown() }
  })

  const api = require("./api")
  patchRequire(api)

  // ---- rendering

  const callbacks = new Callbacks()
  const lastSent = new Map<string, string>()
  const lastViews = new Map<string, any>()
  let flushScheduled = false
  let rev = 0

  const renderer = createRenderer(callbacks, () => {
    if (flushScheduled) return
    flushScheduled = true
    setImmediate(flush)
  })

  function flush() {
    flushScheduled = false
    const slots = renderer.container.c.filter((c: Instance) => c.t === "view")
    const views: any[] = []
    for (const slot of slots) {
      const viewId = String(slot.p.id)
      const root = serializeView(slot, { assetsPath: load.paths.assets, appearance: load.env.appearance, viewId })
      const encoded = JSON.stringify(root)
      lastViews.set(viewId, root)
      if (lastSent.get(viewId) === encoded) continue
      lastSent.set(viewId, encoded)
      views.push({ view: viewId, root })
    }
    for (const id of Array.from(lastSent.keys())) if (!slots.find((s: Instance) => String(s.p.id) === id)) { lastSent.delete(id); lastViews.delete(id) }
    callbacks.tick()
    if (views.length) client.notify("ui.render", { rev: ++rev, views })
    for (const v of views) initDropdown(String(v.view), v.root)
  }

  // Raycast fires a search-bar dropdown's onChange with its initial value as
  // soon as the view mounts (restoring a stored value when storeValue is set).
  const dropdownInitialised = new Set<string>()
  function initDropdown(viewId: string, root: any) {
    const acc = root && root.searchBarAccessory
    if (!acc) return
    const key = viewId + ":" + acc.id
    if (dropdownInitialised.has(key)) return
    dropdownInitialised.add(key)
    let value = acc.value !== undefined ? acc.value : acc.defaultValue
    if (acc.storeValue) {
      const stored = api.readStoredDropdown(load.command.name, acc.id)
      if (stored !== undefined) value = stored
    }
    if (value === undefined || value === null) {
      const first = acc.sections && acc.sections[0] && acc.sections[0].items[0]
      value = first ? first.value : undefined
    }
    if (value !== undefined) {
      client.notify("ui.dropdownValue", { view: viewId, dropdown: acc.id, value: String(value) })
      if (acc.handlers && acc.handlers.change) setImmediate(() => callbacks.invoke(acc.handlers.change, [String(value)]))
    }
  }

  renderer.onError((kind, error) => {
    log(`react ${kind} error: ${error && error.stack || error}`)
    if (kind === "uncaught") client.notify("manager.crash", { reason: String(error && error.message || error), stack: String(error && error.stack || "") })
  })

  // ---- navigation provider

  const rootViewId = "v0"
  let setViewsRef: ((fn: (v: any[]) => any[]) => void) | null = null

  function NavigationProvider(props: { root: any }) {
    const [views, setViews] = React.useState<any[]>([{ id: rootViewId, element: props.root }])
    setViewsRef = setViews
    const value = React.useMemo(() => ({
      push: async (element: any) => {
        const res = await client.request("ui.pushView", {})
        const id = String(res && res.view || ("v" + Date.now()))
        setViews((v) => v.concat([{ id, element }]))
      },
      pop: async () => {
        setViews((v) => v.length > 1 ? v.slice(0, -1) : v)
        await client.request("ui.popView", {})
      }
    }), [])
    client.navigation = value
    return React.createElement(api.NavigationContext.Provider, { value },
      views.map((v) => React.createElement("view", { key: v.id, id: v.id }, v.element)))
  }

  class ErrorBoundary extends React.Component<any, { error: any }> {
    constructor(props: any) { super(props); this.state = { error: null } }
    static getDerivedStateFromError(error: any) { return { error } }
    componentDidCatch(error: any) { log("render error: " + (error && error.stack || error)) }
    render() {
      if (this.state.error) {
        const e = this.state.error
        return React.createElement(api.Detail, { navigationTitle: "Error", markdown: "# The extension crashed\n\n```\n" + String(e && e.stack || e).slice(0, 4000) + "\n```" })
      }
      return this.props.children
    }
  }

  // ---- event handlers from the shell

  handlers.set("ui.callback", (p) => { try { const r = callbacks.invoke(String(p.h), Array.isArray(p.args) ? p.args : []); if (r && typeof r.then === "function") r.catch((e: any) => log("callback rejected: " + (e && e.stack || e))) } catch (e: any) { log("callback threw: " + (e && e.stack || e)) } })
  handlers.set("ui.searchText", (p) => { const v = lastViews.get(String(p.view)); const h = v && v.handlers && v.handlers.searchText; if (h) callbacks.invoke(h, [String(p.text)]) })
  handlers.set("ui.selection", (p) => { const v = lastViews.get(String(p.view)); const h = v && v.handlers && v.handlers.selection; if (h) callbacks.invoke(h, [p.itemId === null || p.itemId === undefined ? null : String(p.itemId)]) })
  handlers.set("ui.loadMore", (p) => { const v = lastViews.get(String(p.view)); const h = v && v.handlers && v.handlers.loadMore; if (h) callbacks.invoke(h, []) })
  handlers.set("ui.dropdown", (p) => {
    const v = lastViews.get(String(p.view)); const acc = v && v.searchBarAccessory
    if (acc && acc.storeValue) api.writeStoredDropdown(load.command.name, acc.id, String(p.value))
    if (acc && acc.handlers && acc.handlers.change) callbacks.invoke(acc.handlers.change, [String(p.value)])
  })
  handlers.set("ui.dropdownSearch", (p) => { const v = lastViews.get(String(p.view)); const acc = v && v.searchBarAccessory; if (acc && acc.handlers && acc.handlers.searchText) callbacks.invoke(acc.handlers.searchText, [String(p.text)]) })
  handlers.set("ui.formValue", (p) => {
    const v = lastViews.get(String(p.view))
    const f = v && v.fields ? v.fields.find((x: any) => x.id === String(p.field)) : null
    if (f && f.handlers && f.handlers.change) callbacks.invoke(f.handlers.change, [coerceFormValue(f, p.value)])
  })
  handlers.set("ui.formEvent", (p) => {
    const v = lastViews.get(String(p.view))
    const f = v && v.fields ? v.fields.find((x: any) => x.id === String(p.field)) : null
    const h = f && f.handlers ? (p.type === "focus" ? f.handlers.focus : f.handlers.blur) : null
    if (h) callbacks.invoke(h, [{ target: { id: f.id, value: coerceFormValue(f, p.value) }, type: p.type }])
  })
  handlers.set("ui.formSubmit", (p) => {
    const v = lastViews.get(String(p.view))
    const values: any = {}
    const raw = p.values || {}
    for (const k of Object.keys(raw)) { const f = v && v.fields ? v.fields.find((x: any) => x.id === k) : null; values[k] = f ? coerceFormValue(f, raw[k]) : raw[k] }
    callbacks.invoke(String(p.h), [values])
  })
  handlers.set("ui.viewPopped", (p) => { if (setViewsRef) setViewsRef((v) => v.filter((x) => x.id !== String(p.view))) })
  handlers.set("ui.toastAction", (p) => { const fn = api.toastActions.get(String(p.id)); if (fn) fn() })
  handlers.set("ai.chunk", (p) => { const st = api.aiStreams.get(String(p.id)); if (st) { st.text += String(p.text); st.emitter.emit("data", String(p.text)) } })
  handlers.set("oauth.callback", () => {})
  handlers.set("ui.closed", () => {})

  function coerceFormValue(field: any, value: any) {
    if (field.field === "date") return value ? new Date(String(value)) : null
    if (field.field === "checkbox") return value === true
    if (field.field === "tags" || field.field === "file") return Array.isArray(value) ? value : (value ? [value] : [])
    return value === undefined || value === null ? "" : value
  }

  // ---- launch

  let mod: any
  try {
    mod = require(load.entrypoint)
  } catch (e: any) {
    log("failed to load " + load.entrypoint + ": " + (e && e.stack || e))
    // Report ready first so the shell keeps the session (and its error page) instead of timing out.
    port.postMessage({ type: "ready" })
    client.notify("manager.crash", { reason: "Failed to load the extension: " + String(e && e.message || e), stack: String(e && e.stack || "") })
    return
  }
  let command = mod && (mod.default !== undefined ? mod.default : mod)
  if (command && typeof command === "object" && command.default) command = command.default
  const launchProps = { arguments: load.arguments || {}, launchType: load.launchType, launchContext: load.launchContext, fallbackText: load.fallbackText, draftValues: undefined }

  port.postMessage({ type: "ready" })

  if (load.command.mode === "no-view" || (typeof command === "function" && !isComponent(command))) {
    Promise.resolve().then(() => command(launchProps)).then(
      () => { api.flushStorage(); setTimeout(() => port.postMessage({ type: "ended", reason: "finished" }), 1500) },
      (e: any) => { log("no-view command failed: " + (e && e.stack || e)); client.notify("manager.crash", { reason: String(e && e.message || e), stack: String(e && e.stack || "") }) }
    )
    return
  }

  renderer.render(React.createElement(ErrorBoundary, null, React.createElement(NavigationProvider, { root: React.createElement(command, launchProps) })))

  function teardown() {
    try { renderer.unmount() } catch {}
    api.flushStorage()
  }

  function isComponent(fn: Function) {
    // Heuristic: no-view commands are plain (async) functions; components are
    // function components or classes. Async functions are never components.
    return !(fn.constructor && fn.constructor.name === "AsyncFunction")
  }
}
