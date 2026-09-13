// Non-UI parts of @raycast/api: feedback, clipboard, storage, cache,
// preferences, environment, system utilities, navigation helpers.
import * as fs from "node:fs"
import * as path from "node:path"
import { EventEmitter } from "node:events"
import { getClient, unsupported } from "./client"
import { ToastStyle, AlertActionStyle, LaunchType } from "./enums"

// ---- environment & preferences

export const environment: any = {
  get raycastVersion() { return "1.100.0" },
  get ownerOrAuthorName() { return getClient().env.ownerOrAuthorName },
  get extensionName() { return getClient().env.extensionName },
  get commandName() { return getClient().env.commandName },
  get commandMode() { return getClient().env.commandMode },
  get entryPointType() { return "command" },
  get entryPointName() { return getClient().env.commandName },
  get entryPointMode() { return getClient().env.commandMode },
  get assetsPath() { return getClient().env.assetsPath },
  get supportPath() { return getClient().env.supportPath },
  get isDevelopment() { return getClient().env.isDevelopment },
  get appearance() { return getClient().env.appearance },
  get theme() { return getClient().env.appearance },
  get textSize() { return getClient().env.textSize },
  get launchType() { return getClient().env.launchType },
  get launchContext() { return getClient().env.launchContext },
  canAccess(api: any) {
    const caps = getClient().env.capabilities || {}
    if (api === AI) return caps.ai === true
    if (api === WindowManagement) return caps.windowManagement !== false
    if (api === BrowserExtension) return false
    return true
  }
}

export function getPreferenceValues<T = any>(): T {
  return { ...(getClient().preferences as any) } as T
}
export const preferences: any = new Proxy({}, { get: (_t, k) => (getClient().preferences as any)[k as string] })

// ---- toasts, HUD, alerts

export class Toast {
  private _style: string
  private _title: string
  private _message: string | undefined
  private _primaryAction: any
  private _secondaryAction: any
  private id = "t" + Math.random().toString(36).slice(2)
  private shown = false
  constructor(options: any) {
    this._style = options.style || ToastStyle.Success
    this._title = String(options.title || "")
    this._message = options.message
    this._primaryAction = options.primaryAction
    this._secondaryAction = options.secondaryAction
  }
  get style() { return this._style as any }
  set style(v: any) { this._style = v; this.sync() }
  get title() { return this._title }
  set title(v: string) { this._title = v; this.sync() }
  get message() { return this._message }
  set message(v: string | undefined) { this._message = v; this.sync() }
  get primaryAction() { return this._primaryAction }
  set primaryAction(v: any) { this._primaryAction = v; this.sync() }
  get secondaryAction() { return this._secondaryAction }
  set secondaryAction(v: any) { this._secondaryAction = v; this.sync() }
  private payload() {
    const client = getClient()
    const act = (a: any, key: string) => a ? { title: String(a.title || ""), shortcut: a.shortcut || null, id: `${this.id}:${key}` } : null
    return { id: this.id, style: styleName(this._style), title: this._title, message: this._message === undefined ? "" : String(this._message), primaryAction: act(this._primaryAction, "primary"), secondaryAction: act(this._secondaryAction, "secondary") }
  }
  private sync() { if (this.shown) getClient().notify("ui.toast.update", { s: getClient().sessionId, ...this.payload() }) }
  async show() {
    this.shown = true
    toastActions.set(`${this.id}:primary`, () => this._primaryAction && this._primaryAction.onAction && this._primaryAction.onAction(this))
    toastActions.set(`${this.id}:secondary`, () => this._secondaryAction && this._secondaryAction.onAction && this._secondaryAction.onAction(this))
    getClient().notify("ui.toast.show", { s: getClient().sessionId, ...this.payload() })
  }
  async hide() {
    this.shown = false
    toastActions.delete(`${this.id}:primary`); toastActions.delete(`${this.id}:secondary`)
    getClient().notify("ui.toast.hide", { s: getClient().sessionId, id: this.id })
  }
  static Style = ToastStyle
}
export const toastActions = new Map<string, () => void>()
function styleName(s: string) { return s === ToastStyle.Failure ? "failure" : s === ToastStyle.Animated ? "animated" : "success" }

export async function showToast(optionsOrStyle: any, title?: string, message?: string): Promise<Toast> {
  const options = typeof optionsOrStyle === "object" && optionsOrStyle !== null ? optionsOrStyle : { style: optionsOrStyle, title, message }
  const t = new Toast(options)
  await t.show()
  return t
}

export async function showHUD(title: string, options?: any) {
  const client = getClient()
  client.notify("ui.hud", { s: client.sessionId, text: String(title), popToRoot: options && options.popToRootType, clearRoot: options && options.clearRootSearch === true })
}

export const Alert = { ActionStyle: AlertActionStyle }
export async function confirmAlert(options: any): Promise<boolean> {
  const client = getClient()
  const res = await client.request("ui.alert", {
    s: client.sessionId,
    title: String(options.title || ""),
    message: options.message ? String(options.message) : "",
    icon: options.icon || null,
    primary: { title: String(options.primaryAction && options.primaryAction.title || "Confirm"), style: options.primaryAction && options.primaryAction.style === AlertActionStyle.Destructive ? "destructive" : "default" },
    dismiss: { title: String(options.dismissAction && options.dismissAction.title || "Cancel") },
    rememberKey: options.rememberUserChoice ? `${client.env.extensionName}:${String(options.title || "")}` : null
  })
  const confirmed = !!(res && res.confirmed)
  if (confirmed && options.primaryAction && options.primaryAction.onAction) options.primaryAction.onAction()
  if (!confirmed && options.dismissAction && options.dismissAction.onAction) options.dismissAction.onAction()
  return confirmed
}

// ---- window & search bar

export async function closeMainWindow(options?: any) {
  const client = getClient()
  client.notify("ui.closeMainWindow", { s: client.sessionId, popToRoot: options && options.popToRootType ? String(options.popToRootType) : "default", clearRoot: options && options.clearRootSearch === true })
}
export async function popToRoot(options?: any) {
  const client = getClient()
  client.notify("ui.popToRoot", { s: client.sessionId, clearSearchBar: !(options && options.clearSearchBar === false) })
}
export async function clearSearchBar(options?: any) {
  const client = getClient()
  client.notify("ui.clearSearchBar", { s: client.sessionId, forceScrollToTop: !(options && options.forceScrollToTop === false) })
}

// ---- clipboard

export const Clipboard = {
  async copy(content: any, options?: any) {
    const client = getClient()
    await client.request("clipboard.copy", { content: contentOf(content), concealed: !!(options && options.concealed) })
  },
  async paste(content: any) {
    const client = getClient()
    await client.request("clipboard.paste", { content: contentOf(content) })
  },
  async clear() { await getClient().request("clipboard.clear", {}) },
  async read(options?: any) {
    const r = await getClient().request("clipboard.read", { offset: options && options.offset ? Number(options.offset) : 0 })
    return { text: String(r && r.text || ""), file: r && r.file ? String(r.file) : undefined, html: r && r.html ? String(r.html) : undefined }
  },
  async readText(options?: any) {
    const r = await Clipboard.read(options)
    return r.text || undefined
  }
}
function contentOf(content: any) {
  if (content === undefined || content === null) return { text: "" }
  if (typeof content !== "object") return { text: String(content) }
  return { text: content.text !== undefined ? String(content.text) : "", html: content.html ? String(content.html) : undefined, file: content.file ? String(content.file) : undefined }
}
export const copyTextToClipboard = (text: string) => Clipboard.copy(text)
export const pasteText = (text: string) => Clipboard.paste(text)
export const clearClipboard = () => Clipboard.clear()

// ---- storage (JSON file per extension, written on change)

class JsonStore {
  private data: Record<string, any> | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private file: string) {}
  private load() {
    if (this.data) return this.data
    try { this.data = JSON.parse(fs.readFileSync(this.file, "utf8")) } catch { this.data = {} }
    if (!this.data || typeof this.data !== "object") this.data = {}
    return this.data
  }
  private flush() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)) } catch (e) { getClient().log("storage write failed: " + e) }
    }, 50)
  }
  get(k: string) { return this.load()[k] }
  set(k: string, v: any) { this.load()[k] = v; this.flush() }
  remove(k: string) { delete this.load()[k]; this.flush() }
  all() { return { ...this.load() } }
  clear() { this.data = {}; this.flush() }
  flushNow() { if (this.timer) { clearTimeout(this.timer); this.timer = null; try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data || {})) } catch {} } }
}
let localStore: JsonStore | null = null
function store() {
  if (!localStore) localStore = new JsonStore(path.join(getClient().env.supportPath, ".launcher", "localstorage.json"))
  return localStore
}
export const LocalStorage = {
  async getItem(key: string) { return store().get(String(key)) },
  async setItem(key: string, value: any) { store().set(String(key), value) },
  async removeItem(key: string) { store().remove(String(key)) },
  async allItems() { return store().all() },
  async clear() { store().clear() }
}
export const getLocalStorageItem = LocalStorage.getItem
export const setLocalStorageItem = LocalStorage.setItem
export const removeLocalStorageItem = LocalStorage.removeItem
export const allLocalStorageItems = LocalStorage.allItems
export const clearLocalStorage = LocalStorage.clear
export function flushStorage() { if (localStore) localStore.flushNow() }
export function readStoredDropdown(command: string, id: string) { return store().get(`__dropdown:${command}:${id}`) }
export function writeStoredDropdown(command: string, id: string, value: string) { store().set(`__dropdown:${command}:${id}`, value) }

// ---- cache (files under support/.launcher/cache/<namespace>)

export class Cache {
  private dir: string
  private subscribers = new Set<(key: string | undefined, data: string | undefined) => void>()
  private capacity: number
  constructor(options?: any) {
    const ns = options && options.namespace ? String(options.namespace).replace(/[^A-Za-z0-9._-]/g, "_") : "default"
    this.capacity = options && options.capacity ? Number(options.capacity) : 10 * 1024 * 1024
    this.dir = path.join(getClient().env.supportPath, ".launcher", "cache", ns)
    try { fs.mkdirSync(this.dir, { recursive: true }) } catch {}
  }
  private fileFor(key: string) { return path.join(this.dir, Buffer.from(String(key)).toString("base64url")) }
  get(key: string): string | undefined {
    try { return fs.readFileSync(this.fileFor(key), "utf8") } catch { return undefined }
  }
  has(key: string) { return fs.existsSync(this.fileFor(key)) }
  get isEmpty() { try { return fs.readdirSync(this.dir).length === 0 } catch { return true } }
  set(key: string, data: string) {
    try { fs.writeFileSync(this.fileFor(key), String(data)) } catch (e) { getClient().log("cache write failed: " + e) }
    this.evict()
    for (const s of this.subscribers) s(key, data)
  }
  remove(key: string) {
    let removed = false
    try { fs.unlinkSync(this.fileFor(key)); removed = true } catch {}
    for (const s of this.subscribers) s(key, undefined)
    return removed
  }
  clear(options?: any) {
    try { for (const f of fs.readdirSync(this.dir)) fs.unlinkSync(path.join(this.dir, f)) } catch {}
    if (!(options && options.notifySubscribers === false)) for (const s of this.subscribers) s(undefined, undefined)
  }
  subscribe(fn: (key: string | undefined, data: string | undefined) => void) {
    this.subscribers.add(fn)
    return () => { this.subscribers.delete(fn) }
  }
  private evict() {
    try {
      const entries = fs.readdirSync(this.dir).map((f) => { const st = fs.statSync(path.join(this.dir, f)); return { f, size: st.size, atime: st.atimeMs } })
      let total = entries.reduce((a, e) => a + e.size, 0)
      if (total <= this.capacity) return
      entries.sort((a, b) => a.atime - b.atime)
      for (const e of entries) { if (total <= this.capacity) break; try { fs.unlinkSync(path.join(this.dir, e.f)); total -= e.size } catch {} }
    } catch {}
  }
}

// ---- system

export async function open(target: string, application?: any) {
  const client = getClient()
  await client.request("system.open", { target: String(target), app: application ? (typeof application === "object" ? (application.path || application.name) : String(application)) : null })
}
export async function getApplications(target?: any) { return (await getClient().request("system.getApplications", { target: target ? String(target) : null })) || [] }
export async function getDefaultApplication(target: any) { return getClient().request("system.getDefaultApplication", { target: String(target) }) }
export async function getFrontmostApplication() { return getClient().request("system.getFrontmostApplication", {}) }
export async function showInFinder(p: any) { await getClient().request("system.showInFileBrowser", { path: String(p) }) }
export async function trash(p: any) { await getClient().request("system.trash", { paths: Array.isArray(p) ? p.map(String) : [String(p)] }) }
export async function getSelectedText(): Promise<string> {
  const r = await getClient().request("ui.getSelectedText", {})
  if (!r || !r.text) throw new Error("Unable to get selected text")
  return String(r.text)
}
export async function getSelectedFinderItems(): Promise<any[]> { return [] }
export function captureException(e: any) { getClient().log("captureException: " + (e && e.stack || e)) }
export function captureMemorySnapshot() {}
export async function openExtensionPreferences() { getClient().notify("ui.openPreferences", { s: getClient().sessionId, scope: "extension" }) }
export async function openCommandPreferences() { getClient().notify("ui.openPreferences", { s: getClient().sessionId, scope: "command" }) }
export async function launchCommand(options: any) {
  const client = getClient()
  await client.request("command.launch", { s: client.sessionId, name: String(options.name), type: options.type || LaunchType.UserInitiated, extensionName: options.extensionName || null, ownerOrAuthorName: options.ownerOrAuthorName || null, arguments: options.arguments || null, context: options.context || null, fallbackText: options.fallbackText || null })
}
export async function updateCommandMetadata(metadata: any) {
  const client = getClient()
  client.notify("command.updateMetadata", { s: client.sessionId, subtitle: metadata && metadata.subtitle !== undefined ? metadata.subtitle : null })
}
export const randomId = () => Math.random().toString(36).slice(2)
export const specialKeys: string[] = []

// ---- AI

export const AI: any = {
  Model: new Proxy({}, { get: (_t, k) => String(k) }),
  Creativity: { None: "none", Low: "low", Medium: "medium", High: "high", Maximum: "maximum" },
  ask(prompt: string, options?: any): any {
    const client = getClient()
    const emitter = new EventEmitter()
    const id = "ai" + Math.random().toString(36).slice(2)
    const stream = new Promise<string>((resolve, reject) => {
      aiStreams.set(id, { emitter, resolve, reject, text: "" })
      client.request("ai.ask", { s: client.sessionId, id, prompt: String(prompt), model: options && options.model ? String(options.model) : null, creativity: options && options.creativity !== undefined ? options.creativity : null }, 300000)
        .then((r) => { const st = aiStreams.get(id); if (st) { aiStreams.delete(id); resolve(String(r && r.text !== undefined ? r.text : st.text)) } }, (e) => { aiStreams.delete(id); reject(e) })
    })
    if (options && options.signal) options.signal.addEventListener("abort", () => client.notify("ai.abort", { s: client.sessionId, id }))
    return Object.assign(stream, { on: emitter.on.bind(emitter), once: emitter.once.bind(emitter), off: emitter.off.bind(emitter), emit: emitter.emit.bind(emitter), addListener: emitter.addListener.bind(emitter), removeListener: emitter.removeListener.bind(emitter) })
  }
}
export const aiStreams = new Map<string, { emitter: EventEmitter; resolve: (t: string) => void; reject: (e: any) => void; text: string }>()
export const unstable_AI = AI
export const useUnstableAI = () => unsupported("useUnstableAI")

// ---- window management (Hyprland via the host)

export const WindowManagement: any = {
  DesktopType: { User: "user", FullScreen: "fullscreen" },
  async getActiveWindow() { return getClient().request("wm.getActiveWindow", {}) },
  async getWindowsOnActiveDesktop() { return (await getClient().request("wm.getWindows", {})) || [] },
  async getDesktops() { return (await getClient().request("wm.getDesktops", {})) || [] },
  async setWindowBounds(options: any) { await getClient().request("wm.setWindowBounds", options) }
}

export const BrowserExtension: any = {
  async getContent() { unsupported("BrowserExtension.getContent") },
  async getTabs() { unsupported("BrowserExtension.getTabs") }
}

// ---- OAuth (PKCE)

export const OAuth: any = {
  RedirectMethod: { Web: "web", App: "app", AppURI: "appURI", ClientIdMetadataDocument: "cimd" },
  PKCEClient: class PKCEClient {
    redirectMethod: string; providerName: string; providerIcon: any; providerId: string; description: string
    private codeVerifier = ""
    private tokenFile: string
    constructor(options: any) {
      this.redirectMethod = options.redirectMethod
      this.providerName = String(options.providerName || "")
      this.providerIcon = options.providerIcon
      this.providerId = String(options.providerId || this.providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
      this.description = String(options.description || "")
      this.tokenFile = path.join(getClient().env.supportPath, ".launcher", "oauth", this.providerId + ".json")
    }
    get redirectURL() {
      if (this.redirectMethod === "app") return "raycast://oauth?package_name=Extension"
      if (this.redirectMethod === "appURI") return "com.raycast:/oauth?package_name=Extension"
      return "https://raycast.com/redirect?packageName=Extension"
    }
    async authorizationRequest(options: any) {
      const crypto = require("node:crypto")
      this.codeVerifier = crypto.randomBytes(48).toString("base64url")
      const codeChallenge = crypto.createHash("sha256").update(this.codeVerifier).digest("base64url")
      const state = crypto.randomBytes(16).toString("hex")
      const url = new URL(options.endpoint)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("client_id", options.clientId)
      url.searchParams.set("redirect_uri", this.redirectURL)
      url.searchParams.set("state", state)
      url.searchParams.set("code_challenge", codeChallenge)
      url.searchParams.set("code_challenge_method", "S256")
      if (options.scope) url.searchParams.set("scope", options.scope)
      for (const k of Object.keys(options.extraParameters || {})) url.searchParams.set(k, options.extraParameters[k])
      return { codeChallenge, codeVerifier: this.codeVerifier, state, redirectURI: this.redirectURL, toURL: () => url.toString() }
    }
    async authorize(request: any) {
      const client = getClient()
      const res = await client.request("oauth.authorize", { s: client.sessionId, url: request.toURL ? request.toURL() : String(request.url), state: request.state, providerName: this.providerName, providerIcon: this.providerIcon || null, description: this.description }, 5 * 60 * 1000)
      if (!res || !res.code) throw new Error("Authorization was cancelled")
      return { authorizationCode: String(res.code) }
    }
    async getTokens() {
      try {
        const data = JSON.parse(fs.readFileSync(this.tokenFile, "utf8"))
        return { ...data, isExpired: () => data.expiresIn ? Date.now() > (data.updatedAt || 0) + Number(data.expiresIn) * 1000 - 10000 : false }
      } catch { return undefined }
    }
    async setTokens(tokens: any) {
      const data = { accessToken: tokens.accessToken || tokens.access_token, refreshToken: tokens.refreshToken || tokens.refresh_token, idToken: tokens.idToken || tokens.id_token, expiresIn: tokens.expiresIn || tokens.expires_in, scope: tokens.scope, updatedAt: Date.now() }
      fs.mkdirSync(path.dirname(this.tokenFile), { recursive: true })
      fs.writeFileSync(this.tokenFile, JSON.stringify(data), { mode: 0o600 })
    }
    async removeTokens() { try { fs.unlinkSync(this.tokenFile) } catch {} }
  }
}

export const Tool: any = {}
