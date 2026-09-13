// Serializes the reconciler's instance tree into the JSON view model the
// QML renderers consume (see lib/ViewModel.js on the shell side).
import { Instance } from "./reconciler"

export interface SerializeContext {
  assetsPath: string
  appearance: "light" | "dark"
  viewId: string
}

let autoId = 0

function str(v: any): string { return v === undefined || v === null ? "" : String(v) }

function isElementInstance(x: any): x is Instance { return x && typeof x === "object" && typeof x.t === "string" }

export function image(v: any, ctx: SerializeContext): any {
  if (v === undefined || v === null || v === "") return null
  if (typeof v === "string") return imageSource(v, ctx)
  if (typeof v === "object") {
    if (v.fileIcon) return "file-icon://" + str(v.fileIcon)
    if (v.light !== undefined || v.dark !== undefined) return image(ctx.appearance === "dark" && v.dark !== undefined ? v.dark : v.light, ctx)
    if (v.source !== undefined) {
      const src = typeof v.source === "object" && v.source && (v.source.light !== undefined || v.source.dark !== undefined)
        ? (ctx.appearance === "dark" && v.source.dark !== undefined ? v.source.dark : v.source.light) : v.source
      const out: any = { source: imageSource(str(src), ctx) }
      if (v.tintColor) out.tint = color(v.tintColor, ctx)
      if (v.mask) out.mask = str(v.mask)
      if (v.fallback !== undefined) out.fallback = image(v.fallback, ctx)
      return out
    }
  }
  return null
}

function imageSource(s: string, ctx: SerializeContext): string {
  if (!s) return ""
  if (/^(https?|file|data|image):/.test(s) || s.startsWith("/")) return s
  if (s.startsWith("~/")) return "file://" + require("node:os").homedir() + s.slice(1)
  if (/^[a-z0-9-]+-16$/.test(s) || /^[a-z0-9-]+$/.test(s) && !/\.[a-z0-9]+$/i.test(s)) return "icon://" + s   // Icon enum value
  // Anything else is an asset name relative to the extension's assets dir.
  return "file://" + ctx.assetsPath.replace(/\/$/, "") + "/" + s.replace(/^\.?\//, "")
}

export function color(v: any, ctx: SerializeContext): string {
  if (!v) return ""
  if (typeof v === "string") return v
  if (typeof v === "object") {
    if (v.light !== undefined || v.dark !== undefined) return str(ctx.appearance === "dark" && v.dark !== undefined ? v.dark : v.light)
    if (v.value) return str(v.value)
  }
  return str(v)
}

const KEY_LABELS: Record<string, string> = { return: "↵", enter: "↵", delete: "⌫", backspace: "⌫", deleteForward: "⌦", tab: "⇥", arrowUp: "↑", arrowDown: "↓", arrowLeft: "←", arrowRight: "→", pageUp: "⇞", pageDown: "⇟", home: "↖", end: "↘", space: "␣", escape: "⎋" }

export function shortcut(v: any): any {
  if (!v || typeof v !== "object") return null
  if (v.macOS || v.Windows || v.windows) v = v.Windows || v.windows || v.macOS   // platform-specific: prefer the Windows form (ctrl-based)
  const mods: string[] = Array.isArray(v.modifiers) ? v.modifiers.map((m: string) => String(m).toLowerCase()) : []
  const linux: string[] = []
  let label = ""
  for (const m of mods) {
    if (m === "cmd" || m === "ctrl") { if (linux.indexOf("ctrl") < 0) { linux.push("ctrl"); label += "⌃" } }
    else if (m === "opt" || m === "alt") { linux.push("alt"); label += "⌥" }
    else if (m === "shift") { linux.push("shift"); label += "⇧" }
    else if (m === "windows" || m === "super") { linux.push("super"); label += "❖" }
  }
  const key = str(v.key)
  label += KEY_LABELS[key] || key.toUpperCase()
  return { modifiers: linux, key, label }
}

function textValue(v: any, ctx: SerializeContext): any {
  if (v === undefined || v === null) return undefined
  if (typeof v === "object") return { value: str(v.value), color: v.color ? color(v.color, ctx) : "" }
  return str(v)
}

function accessories(list: any, ctx: SerializeContext): any[] {
  if (!Array.isArray(list)) return []
  const out: any[] = []
  for (const a of list) {
    if (!a || typeof a !== "object") continue
    const acc: any = {}
    if (a.text !== undefined && a.text !== null) acc.text = textValue(a.text, ctx)
    if (a.tag !== undefined && a.tag !== null) acc.tag = textValue(a.tag, ctx)
    if (a.date !== undefined && a.date !== null) acc.date = a.date instanceof Date ? { value: a.date.toISOString() } : (typeof a.date === "object" ? { value: a.date.value instanceof Date ? a.date.value.toISOString() : str(a.date.value), color: a.date.color ? color(a.date.color, ctx) : "" } : { value: str(a.date) })
    if (a.icon !== undefined && a.icon !== null) acc.icon = image(a.icon, ctx)
    if (a.tooltip) acc.tooltip = str(a.tooltip)
    if (Object.keys(acc).length) out.push(acc)
  }
  return out
}

// ---- actions

function action(inst: Instance, ctx: SerializeContext): any {
  const p = inst.p
  const kind = str(p.kind || "callback")
  const a: any = {
    id: str(p.onAction || p.onSubmit || p.onCopy || p.onOpen || p.onPaste || p.onChange || p.onTrash || p.onShow || ("a" + (++autoId))),
    title: str(p.title),
    icon: image(p.icon, ctx),
    style: p.style === "destructive" || p.style === "Action.Style.Destructive" ? "destructive" : "regular",
    shortcut: shortcut(p.shortcut),
    kind,
    payload: p.payload || null,
    callbackId: p.onAction || p.onSubmit || p.onCopy || p.onOpen || p.onPaste || p.onChange || p.onTrash || p.onShow || null,
    autoFocus: p.autoFocus === true
  }
  return a
}

function actionPanel(inst: Instance | null, ctx: SerializeContext): any {
  if (!inst) return null
  const sections: any[] = []
  let loose: any[] = []
  const flush = () => { if (loose.length) { sections.push({ title: "", actions: loose }); loose = [] } }
  const walk = (children: Instance[], sectionTitle: string | null) => {
    for (const c of children) {
      if (c.t === "action") { if (sectionTitle === null) loose.push(action(c, ctx)); else sections[sections.length - 1].actions.push(action(c, ctx)) }
      else if (c.t === "action-section") { flush(); sections.push({ title: str(c.p.title), actions: [] }); walk(c.c, str(c.p.title)) }
      else if (c.t === "action-submenu") { flush(); sections.push({ title: str(c.p.title), actions: [] }); walk(c.c, str(c.p.title)) }
      else if (c.t === "#fragment") walk(c.c, sectionTitle)
    }
  }
  walk(inst.c, null)
  flush()
  return { title: str(inst.p.title), sections }
}

// ---- metadata

function metadata(inst: Instance | null, ctx: SerializeContext): any[] {
  if (!inst) return []
  const out: any[] = []
  for (const c of inst.c) {
    if (c.t === "metadata-label") out.push({ kind: "label", title: str(c.p.title), text: textValue(c.p.text, ctx), icon: image(c.p.icon, ctx) })
    else if (c.t === "metadata-link") out.push({ kind: "link", title: str(c.p.title), text: str(c.p.text), target: str(c.p.target) })
    else if (c.t === "metadata-taglist") out.push({ kind: "tags", title: str(c.p.title), tags: c.c.filter((t) => t.t === "metadata-tag").map((t) => ({ text: str(t.p.text), color: t.p.color ? color(t.p.color, ctx) : "", icon: image(t.p.icon, ctx), callbackId: t.p.onAction || null })) })
    else if (c.t === "metadata-separator") out.push({ kind: "separator" })
  }
  return out
}

function childOf(inst: Instance, type: string): Instance | null {
  for (const c of inst.c) if (c.t === type) return c
  return null
}

// ---- list / grid

function listItem(inst: Instance, ctx: SerializeContext, index: number): any {
  const p = inst.p
  const detailInst = childOf(inst, "list-item-detail")
  const item: any = {
    id: str(p.id || ("i" + index)),
    title: typeof p.title === "object" && p.title ? str(p.title.value) : str(p.title),
    subtitle: typeof p.subtitle === "object" && p.subtitle ? str(p.subtitle.value) : str(p.subtitle),
    icon: image(p.icon, ctx),
    keywords: Array.isArray(p.keywords) ? p.keywords.map(str) : [],
    accessories: accessories(p.accessories, ctx),
    actions: actionPanel(childOf(inst, "action-panel"), ctx),
    detail: detailInst ? { markdown: str(detailInst.p.markdown), isLoading: detailInst.p.isLoading === true, metadata: metadata(childOf(detailInst, "metadata"), ctx) } : null,
    quickLook: p.quickLook ? { path: str(p.quickLook.path), name: str(p.quickLook.name) } : null
  }
  return item
}

function gridItem(inst: Instance, ctx: SerializeContext, index: number): any {
  const p = inst.p
  let content: any = null
  const c = p.content
  if (c && typeof c === "object" && !c.source && !c.fileIcon && (c.color || (c.value && typeof c.value === "object" && c.value.color))) content = { color: color(c.color || c.value.color, ctx) }
  else if (c && typeof c === "object" && c.value !== undefined && c.tooltip !== undefined) content = { image: image(c.value, ctx) }
  else content = { image: image(c, ctx) }
  return {
    id: str(p.id || ("g" + index)),
    title: str(p.title),
    subtitle: str(p.subtitle),
    keywords: Array.isArray(p.keywords) ? p.keywords.map(str) : [],
    content,
    accessory: p.accessory ? { icon: image(p.accessory.icon, ctx), text: str(p.accessory.text), tooltip: str(p.accessory.tooltip) } : null,
    actions: actionPanel(childOf(inst, "action-panel"), ctx)
  }
}

function dropdown(inst: Instance | null, ctx: SerializeContext): any {
  if (!inst) return null
  const sections: any[] = []
  let loose: any[] = []
  const item = (c: Instance) => ({ value: str(c.p.value), title: str(c.p.title), icon: image(c.p.icon, ctx), keywords: Array.isArray(c.p.keywords) ? c.p.keywords.map(str) : [] })
  for (const c of inst.c) {
    if (c.t === "dropdown-item") loose.push(item(c))
    else if (c.t === "dropdown-section") { if (loose.length) { sections.push({ title: "", items: loose }); loose = [] } sections.push({ title: str(c.p.title), items: c.c.filter((x) => x.t === "dropdown-item").map(item) }) }
  }
  if (loose.length) sections.push({ title: "", items: loose })
  return { id: str(inst.p.id || "dropdown"), tooltip: str(inst.p.tooltip), placeholder: str(inst.p.placeholder), value: inst.p.value !== undefined ? str(inst.p.value) : undefined, defaultValue: inst.p.defaultValue !== undefined ? str(inst.p.defaultValue) : undefined, storeValue: inst.p.storeValue === true, sections, handlers: { change: inst.p.onChange || null, searchText: inst.p.onSearchTextChange || null }, isLoading: inst.p.isLoading === true, filtering: inst.p.filtering }
}

function emptyView(inst: Instance | null, ctx: SerializeContext): any {
  if (!inst) return null
  return { icon: image(inst.p.icon, ctx), title: str(inst.p.title), description: str(inst.p.description), actions: actionPanel(childOf(inst, "action-panel"), ctx) }
}

function collection(inst: Instance, ctx: SerializeContext, itemType: string, mapItem: (i: Instance, ctx: SerializeContext, n: number) => any): { sections: any[]; emptyView: any; accessory: any; actions: any } {
  const sections: any[] = []
  let loose: any[] = []
  let n = 0
  let empty: any = null
  let accessory: any = null
  let actions: any = null
  const flush = () => { if (loose.length) { sections.push({ id: "s" + sections.length, title: "", items: loose }); loose = [] } }
  for (const c of inst.c) {
    if (c.t === itemType) loose.push(mapItem(c, ctx, n++))
    else if (c.t === itemType.replace("-item", "-section")) {
      flush()
      sections.push({ id: str(c.p.id || ("s" + sections.length)), title: str(c.p.title), subtitle: str(c.p.subtitle), columns: c.p.columns, aspectRatio: c.p.aspectRatio, inset: c.p.inset, fit: c.p.fit, items: c.c.filter((x) => x.t === itemType).map((x) => mapItem(x, ctx, n++)) })
    }
    else if (c.t === "empty-view") empty = emptyView(c, ctx)
    else if (c.t === "dropdown") accessory = dropdown(c, ctx)
    else if (c.t === "action-panel") actions = actionPanel(c, ctx)
  }
  flush()
  return { sections, emptyView: empty, accessory, actions }
}

function list(inst: Instance, ctx: SerializeContext): any {
  const p = inst.p
  const col = collection(inst, ctx, "list-item", listItem)
  const filtering = p.filtering === undefined ? !p.onSearchTextChange : (typeof p.filtering === "object" ? true : p.filtering !== false)
  return {
    id: ctx.viewId, type: "list",
    navigationTitle: str(p.navigationTitle),
    searchBarPlaceholder: str(p.searchBarPlaceholder || "Search…"),
    searchText: p.searchText !== undefined ? str(p.searchText) : undefined,
    filtering,
    keepSectionOrder: typeof p.filtering === "object" && p.filtering ? p.filtering.keepSectionOrder === true : false,
    throttle: p.throttle === true,
    isLoading: p.isLoading === true,
    isShowingDetail: p.isShowingDetail === true,
    selectedItemId: p.selectedItemId !== undefined ? str(p.selectedItemId) : undefined,
    sections: col.sections,
    emptyView: col.emptyView,
    searchBarAccessory: col.accessory,
    actions: col.actions,
    pagination: p.pagination ? { hasMore: !!p.pagination.hasMore, pageSize: p.pagination.pageSize } : null,
    handlers: { searchText: p.onSearchTextChange || null, selection: p.onSelectionChange || null, loadMore: p.pagination && p.pagination.onLoadMore ? p.pagination.onLoadMore : null }
  }
}

function grid(inst: Instance, ctx: SerializeContext): any {
  const p = inst.p
  const col = collection(inst, ctx, "grid-item", gridItem)
  const filtering = p.filtering === undefined ? !p.onSearchTextChange : (typeof p.filtering === "object" ? true : p.filtering !== false)
  return {
    id: ctx.viewId, type: "grid",
    navigationTitle: str(p.navigationTitle),
    searchBarPlaceholder: str(p.searchBarPlaceholder || "Search…"),
    searchText: p.searchText !== undefined ? str(p.searchText) : undefined,
    filtering, throttle: p.throttle === true, isLoading: p.isLoading === true,
    columns: p.columns || 5, aspectRatio: str(p.aspectRatio || "1"), inset: str(p.inset || "small"), fit: str(p.fit || "contain"),
    selectedItemId: p.selectedItemId !== undefined ? str(p.selectedItemId) : undefined,
    sections: col.sections, emptyView: col.emptyView, searchBarAccessory: col.accessory, actions: col.actions,
    pagination: p.pagination ? { hasMore: !!p.pagination.hasMore, pageSize: p.pagination.pageSize } : null,
    handlers: { searchText: p.onSearchTextChange || null, selection: p.onSelectionChange || null, loadMore: p.pagination && p.pagination.onLoadMore ? p.pagination.onLoadMore : null }
  }
}

function detail(inst: Instance, ctx: SerializeContext): any {
  const p = inst.p
  return { id: ctx.viewId, type: "detail", navigationTitle: str(p.navigationTitle), isLoading: p.isLoading === true, markdown: str(p.markdown), metadata: metadata(childOf(inst, "metadata"), ctx), actions: actionPanel(childOf(inst, "action-panel"), ctx) }
}

const FORM_KINDS: Record<string, string> = { "form-textfield": "text", "form-password": "password", "form-textarea": "textarea", "form-checkbox": "checkbox", "form-datepicker": "date", "form-dropdown": "dropdown", "form-tagpicker": "tags", "form-filepicker": "file", "form-separator": "separator", "form-description": "description", "form-linkaccessory": "link" }

function form(inst: Instance, ctx: SerializeContext): any {
  const p = inst.p
  const fields: any[] = []
  let actions: any = null
  const dateValue = (v: any) => v instanceof Date ? v.toISOString() : (v === null || v === undefined ? v : str(v))
  for (const c of inst.c) {
    if (c.t === "action-panel") { actions = actionPanel(c, ctx); continue }
    const kind = FORM_KINDS[c.t]
    if (!kind) continue
    const f: any = { id: str(c.p.id || ("f" + fields.length)), field: kind, title: str(c.p.title), info: str(c.p.info), error: str(c.p.error), placeholder: str(c.p.placeholder), autoFocus: c.p.autoFocus === true, storeValue: c.p.storeValue === true, handlers: { change: c.p.onChange || null, focus: c.p.onFocus || null, blur: c.p.onBlur || null } }
    if (kind === "date") { f.value = dateValue(c.p.value); f.defaultValue = dateValue(c.p.defaultValue); f.type = c.p.type === "date" ? "date" : "dateTime"; f.min = dateValue(c.p.min); f.max = dateValue(c.p.max) }
    else { if (c.p.value !== undefined) f.value = c.p.value; if (c.p.defaultValue !== undefined) f.defaultValue = c.p.defaultValue }
    if (kind === "checkbox") f.label = str(c.p.label)
    if (kind === "description") f.text = str(c.p.text)
    if (kind === "textarea") f.enableMarkdown = c.p.enableMarkdown === true
    if (kind === "dropdown" || kind === "tags") {
      const items: any[] = []
      const item = (x: Instance) => ({ value: str(x.p.value), title: str(x.p.title), icon: image(x.p.icon, ctx) })
      for (const x of c.c) {
        if (x.t === "dropdown-item") items.push(item(x))
        else if (x.t === "dropdown-section") items.push({ title: str(x.p.title), items: x.c.filter((y) => y.t === "dropdown-item").map(item) })
      }
      f.items = items
      f.filtering = c.p.filtering
    }
    if (kind === "file") { f.allowMultiple = c.p.allowMultipleSelection !== false; f.files = c.p.canChooseFiles !== false; f.directories = c.p.canChooseDirectories === true }
    if (kind === "link") { f.text = str(c.p.text); f.target = str(c.p.target) }
    fields.push(f)
  }
  return { id: ctx.viewId, type: "form", navigationTitle: str(p.navigationTitle), isLoading: p.isLoading === true, enableDrafts: p.enableDrafts === true, fields, actions }
}

function menubar(inst: Instance, ctx: SerializeContext): any {
  const items = (children: Instance[]): any[] => {
    const out: any[] = []
    for (const c of children) {
      if (c.t === "menubar-item") out.push({ kind: "item", id: str(c.p.onAction || ("m" + (++autoId))), title: str(c.p.title), subtitle: str(c.p.subtitle), icon: image(c.p.icon, ctx), tooltip: str(c.p.tooltip), shortcut: shortcut(c.p.shortcut), callbackId: c.p.onAction || null })
      else if (c.t === "menubar-submenu") out.push({ kind: "submenu", title: str(c.p.title), icon: image(c.p.icon, ctx), items: items(c.c) })
      else if (c.t === "menubar-section") out.push({ kind: "section", title: str(c.p.title), items: items(c.c) })
      else if (c.t === "menubar-separator") out.push({ kind: "separator" })
    }
    return out
  }
  return { id: ctx.viewId, type: "menubar", title: str(inst.p.title), icon: image(inst.p.icon, ctx), tooltip: str(inst.p.tooltip), isLoading: inst.p.isLoading === true, items: items(inst.c) }
}

// Serialize the single root component under a <view> slot.
export function serializeView(slot: Instance, ctx: SerializeContext): any {
  const root = slot.c.find((c) => c.t !== "#text" && c.t !== "#fragment") || (slot.c[0] && slot.c[0].c.find((c) => c.t !== "#text"))
  if (!root) return { id: ctx.viewId, type: "list", isLoading: true, sections: [], searchBarPlaceholder: "Loading…" }
  switch (root.t) {
    case "list": return list(root, ctx)
    case "grid": return grid(root, ctx)
    case "detail": return detail(root, ctx)
    case "form": return form(root, ctx)
    case "menubar": return menubar(root, ctx)
    default: return { id: ctx.viewId, type: "detail", markdown: "Unsupported root component: `" + root.t + "`", metadata: [], actions: null }
  }
}
