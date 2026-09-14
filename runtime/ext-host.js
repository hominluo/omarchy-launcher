#!/usr/bin/env node
/* Omarchy Launcher extension host — built from packages/ext-host; do not edit. React lives in vendor.js. */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// vendor:react
var require_react = __commonJS({
  "vendor:react"(exports2, module2) {
    module2.exports = require(require("node:path").join(__dirname, "vendor.js"))["react"];
  }
});

// src/api/client.ts
function setClient(c) {
  client = c;
}
function getClient() {
  if (!client) throw new Error("@raycast/api used outside of a command session");
  return client;
}
function unsupported(name) {
  throw new Error(`${name} is not supported by Omarchy Launcher`);
}
var client;
var init_client = __esm({
  "src/api/client.ts"() {
    client = null;
  }
});

// vendor:react/jsx-runtime
var require_jsx_runtime = __commonJS({
  "vendor:react/jsx-runtime"(exports2, module2) {
    module2.exports = require(require("node:path").join(__dirname, "vendor.js"))["react/jsx-runtime"];
  }
});

// vendor:react/jsx-dev-runtime
var require_jsx_dev_runtime = __commonJS({
  "vendor:react/jsx-dev-runtime"(exports2, module2) {
    module2.exports = require(require("node:path").join(__dirname, "vendor.js"))["react/jsx-dev-runtime"];
  }
});

// src/patch-require.ts
function patchRequire(api) {
  const react = require_react();
  const jsx = require_jsx_runtime();
  const proxied = new Proxy(api, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
      if (prop === "__esModule") return true;
      if (prop === "default" || prop === "then") return void 0;
      return () => {
        throw new Error(`@raycast/api.${String(prop)} is not supported by Omarchy Launcher`);
      };
    }
  });
  const overrides = {
    "react": react,
    "react/jsx-runtime": jsx,
    "react/jsx-dev-runtime": require_jsx_dev_runtime(),
    "@raycast/api": proxied,
    "@omarchy-launcher/raycast-api": api
  };
  const original = import_node_module.default.prototype.require;
  import_node_module.default.prototype.require = function(id) {
    if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id];
    return original.apply(this, arguments);
  };
  const g = globalThis;
  g._jsx = jsx.jsx;
  g._jsxs = jsx.jsxs;
  g._jsxFragment = jsx.Fragment;
  return proxied;
}
var import_node_module;
var init_patch_require = __esm({
  "src/patch-require.ts"() {
    import_node_module = __toESM(require("node:module"));
  }
});

// src/callbacks.ts
var Callbacks;
var init_callbacks = __esm({
  "src/callbacks.ts"() {
    Callbacks = class {
      next = 1;
      handlers = /* @__PURE__ */ new Map();
      graveyard = [/* @__PURE__ */ new Set(), /* @__PURE__ */ new Set()];
      register(fn) {
        const id = "h" + this.next++;
        this.handlers.set(id, fn);
        return id;
      }
      replace(id, fn) {
        this.handlers.set(id, fn);
        return id;
      }
      has(id) {
        return this.handlers.has(id);
      }
      release(id) {
        this.graveyard[0].add(id);
      }
      // Called once per render frame: ids released two frames ago are dropped.
      tick() {
        for (const id of this.graveyard[1]) if (this.graveyard[0].has(id) || !this.handlers.has(id)) continue;
        else this.handlers.delete(id);
        this.graveyard = [/* @__PURE__ */ new Set(), this.graveyard[0]];
      }
      invoke(id, args) {
        const fn = this.handlers.get(id);
        if (!fn) return void 0;
        return fn(...args);
      }
      clear() {
        this.handlers.clear();
        this.graveyard = [/* @__PURE__ */ new Set(), /* @__PURE__ */ new Set()];
      }
    };
  }
});

// vendor:react-reconciler
var require_react_reconciler = __commonJS({
  "vendor:react-reconciler"(exports2, module2) {
    module2.exports = require(require("node:path").join(__dirname, "vendor.js"))["react-reconciler"];
  }
});

// vendor:react-reconciler/constants
var require_constants = __commonJS({
  "vendor:react-reconciler/constants"(exports2, module2) {
    module2.exports = require(require("node:path").join(__dirname, "vendor.js"))["react-reconciler/constants"];
  }
});

// src/reconciler.ts
function cleanProps(inst, props, callbacks) {
  const p = {};
  const h2 = [];
  const previous = inst ? inst.p : {};
  for (const k of Object.keys(props)) {
    if (k === "children") continue;
    const v = props[k];
    if (typeof v === "function") {
      const prevId = previous[k];
      const id = typeof prevId === "string" && prevId.startsWith("h") && callbacks.has(prevId) ? callbacks.replace(prevId, v) : callbacks.register(v);
      p[k] = id;
      h2.push(id);
      continue;
    }
    if (v && typeof v === "object" && v.$$typeof) continue;
    p[k] = v;
  }
  return { p, h: h2 };
}
function createHostConfig() {
  const config = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    supportsMicrotasks: true,
    isPrimaryRenderer: true,
    noTimeout: -1,
    NotPendingTransition: null,
    HostTransitionContext: { $$typeof: /* @__PURE__ */ Symbol.for("react.context"), Consumer: null, Provider: null, _currentValue: null, _currentValue2: null, _threadCount: 0 },
    getRootHostContext: () => ({}),
    getChildHostContext: (parent) => parent,
    getPublicInstance: (i) => i,
    prepareForCommit: () => null,
    resetAfterCommit: (container) => container.onCommit(),
    clearContainer: (container) => {
      container.c = [];
    },
    shouldSetTextContent: () => false,
    createInstance(type, props, root) {
      const inst = { t: type, p: {}, c: [], h: [], key: props.key ?? null };
      const cleaned = cleanProps(null, props, root.callbacks);
      inst.p = cleaned.p;
      inst.h = cleaned.h;
      return inst;
    },
    createTextInstance(text) {
      return { t: "#text", p: { text }, c: [], h: [] };
    },
    appendInitialChild(parent, child) {
      parent.c.push(child);
    },
    appendChild(parent, child) {
      parent.c.push(child);
    },
    appendChildToContainer(container, child) {
      container.c.push(child);
    },
    insertBefore(parent, child, before) {
      const i = parent.c.indexOf(before);
      if (i >= 0) parent.c.splice(i, 0, child);
      else parent.c.push(child);
    },
    insertInContainerBefore(container, child, before) {
      const i = container.c.indexOf(before);
      if (i >= 0) container.c.splice(i, 0, child);
      else container.c.push(child);
    },
    removeChild(parent, child) {
      const i = parent.c.indexOf(child);
      if (i >= 0) parent.c.splice(i, 1);
    },
    removeChildFromContainer(container, child) {
      const i = container.c.indexOf(child);
      if (i >= 0) container.c.splice(i, 1);
    },
    finalizeInitialChildren: () => false,
    commitMount() {
    },
    commitUpdate(inst, type, _prev, next, _fiber) {
      const cleaned = cleanProps(inst, next, currentContainer.callbacks);
      for (const id of inst.h) if (cleaned.h.indexOf(id) < 0) currentContainer.callbacks.release(id);
      inst.p = cleaned.p;
      inst.h = cleaned.h;
    },
    commitTextUpdate(inst, _old, next) {
      inst.p.text = next;
    },
    resetTextContent() {
    },
    hideInstance() {
    },
    unhideInstance() {
    },
    hideTextInstance() {
    },
    unhideTextInstance() {
    },
    detachDeletedInstance(inst) {
      releaseTree(inst);
    },
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    scheduleMicrotask: queueMicrotask,
    getCurrentUpdatePriority: () => currentUpdatePriority,
    setCurrentUpdatePriority: (p) => {
      currentUpdatePriority = p;
    },
    resolveUpdatePriority: () => currentUpdatePriority || import_constants.DefaultEventPriority,
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1,
    shouldAttemptEagerTransition: () => false,
    trackSchedulerEvent() {
    },
    requestPostPaintCallback() {
    },
    maySuspendCommit: () => false,
    maySuspendCommitOnUpdate: () => false,
    maySuspendCommitInSyncRender: () => false,
    preloadInstance: () => true,
    startSuspendingCommit() {
    },
    suspendInstance() {
    },
    waitForCommitToBeReady: () => null,
    resetFormInstance() {
    },
    preparePortalMount() {
    },
    prepareScopeUpdate() {
    },
    getInstanceFromScope: () => null,
    getInstanceFromNode: () => null,
    beforeActiveInstanceBlur() {
    },
    afterActiveInstanceBlur() {
    },
    bindToConsole: (method, args) => Function.prototype.bind.apply(console[method], [console].concat(args)),
    rendererPackageName: "omarchy-launcher",
    rendererVersion: "0.1.0"
  };
  return config;
}
function releaseTree(inst) {
  if (!inst) return;
  for (const id of inst.h) currentContainer.callbacks.release(id);
  for (const c of inst.c) releaseTree(c);
}
function createRenderer(callbacks, onCommit) {
  const container = { c: [], onCommit, callbacks };
  currentContainer = container;
  const reconciler = (0, import_react_reconciler.default)(createHostConfig());
  const root = reconciler.createContainer(container, import_constants.ConcurrentRoot, null, false, null, "", (e) => reportError("uncaught", e), (e) => reportError("caught", e), (e) => reportError("recoverable", e), null);
  let errorHandler = () => {
  };
  function reportError(kind, error) {
    errorHandler(kind, error);
  }
  return {
    container,
    render(element) {
      reconciler.updateContainer(element, root, null, null);
    },
    unmount() {
      reconciler.updateContainer(null, root, null, null);
    },
    flushSync(fn) {
      reconciler.flushSyncFromReconciler ? reconciler.flushSyncFromReconciler(fn) : fn();
    },
    onError(fn) {
      errorHandler = fn;
    }
  };
}
var import_react_reconciler, import_constants, currentUpdatePriority, currentContainer;
var init_reconciler = __esm({
  "src/reconciler.ts"() {
    import_react_reconciler = __toESM(require_react_reconciler());
    import_constants = __toESM(require_constants());
    currentUpdatePriority = import_constants.NoEventPriority;
  }
});

// src/viewmodel.ts
function str(v) {
  return v === void 0 || v === null ? "" : String(v);
}
function image(v, ctx) {
  if (v === void 0 || v === null || v === "") return null;
  if (typeof v === "string") return imageSource(v, ctx);
  if (typeof v === "object") {
    if (v.fileIcon) return "file-icon://" + str(v.fileIcon);
    if (v.light !== void 0 || v.dark !== void 0) return image(ctx.appearance === "dark" && v.dark !== void 0 ? v.dark : v.light, ctx);
    if (v.source !== void 0) {
      const src = typeof v.source === "object" && v.source && (v.source.light !== void 0 || v.source.dark !== void 0) ? ctx.appearance === "dark" && v.source.dark !== void 0 ? v.source.dark : v.source.light : v.source;
      const out = { source: imageSource(str(src), ctx) };
      if (v.tintColor) out.tint = color(v.tintColor, ctx);
      if (v.mask) out.mask = str(v.mask);
      if (v.fallback !== void 0) out.fallback = image(v.fallback, ctx);
      return out;
    }
  }
  return null;
}
function imageSource(s, ctx) {
  if (!s) return "";
  if (/^(https?|file|data|image):/.test(s) || s.startsWith("/")) return s;
  if (s.startsWith("~/")) return "file://" + require("node:os").homedir() + s.slice(1);
  if (/^[a-z0-9-]+-16$/.test(s) || /^[a-z0-9-]+$/.test(s) && !/\.[a-z0-9]+$/i.test(s)) return "icon://" + s;
  return "file://" + ctx.assetsPath.replace(/\/$/, "") + "/" + s.replace(/^\.?\//, "");
}
function color(v, ctx) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.light !== void 0 || v.dark !== void 0) return str(ctx.appearance === "dark" && v.dark !== void 0 ? v.dark : v.light);
    if (v.value) return str(v.value);
  }
  return str(v);
}
function shortcut(v) {
  if (!v || typeof v !== "object") return null;
  if (v.macOS || v.Windows || v.windows) v = v.Windows || v.windows || v.macOS;
  const mods = Array.isArray(v.modifiers) ? v.modifiers.map((m) => String(m).toLowerCase()) : [];
  const linux = [];
  let label = "";
  for (const m of mods) {
    if (m === "cmd" || m === "ctrl") {
      if (linux.indexOf("ctrl") < 0) {
        linux.push("ctrl");
        label += "\u2303";
      }
    } else if (m === "opt" || m === "alt") {
      linux.push("alt");
      label += "\u2325";
    } else if (m === "shift") {
      linux.push("shift");
      label += "\u21E7";
    } else if (m === "windows" || m === "super") {
      linux.push("super");
      label += "\u2756";
    }
  }
  const key = str(v.key);
  label += KEY_LABELS[key] || key.toUpperCase();
  return { modifiers: linux, key, label };
}
function textValue(v, ctx) {
  if (v === void 0 || v === null) return void 0;
  if (typeof v === "object") return { value: str(v.value), color: v.color ? color(v.color, ctx) : "" };
  return str(v);
}
function accessories(list2, ctx) {
  if (!Array.isArray(list2)) return [];
  const out = [];
  for (const a of list2) {
    if (!a || typeof a !== "object") continue;
    const acc = {};
    if (a.text !== void 0 && a.text !== null) acc.text = textValue(a.text, ctx);
    if (a.tag !== void 0 && a.tag !== null) acc.tag = textValue(a.tag, ctx);
    if (a.date !== void 0 && a.date !== null) acc.date = a.date instanceof Date ? { value: a.date.toISOString() } : typeof a.date === "object" ? { value: a.date.value instanceof Date ? a.date.value.toISOString() : str(a.date.value), color: a.date.color ? color(a.date.color, ctx) : "" } : { value: str(a.date) };
    if (a.icon !== void 0 && a.icon !== null) acc.icon = image(a.icon, ctx);
    if (a.tooltip) acc.tooltip = str(a.tooltip);
    if (Object.keys(acc).length) out.push(acc);
  }
  return out;
}
function action(inst, ctx) {
  const p = inst.p;
  const kind = str(p.kind || "callback");
  const a = {
    id: str(p.onAction || p.onSubmit || p.onCopy || p.onOpen || p.onPaste || p.onChange || p.onTrash || p.onShow || "a" + ++autoId),
    title: str(p.title),
    icon: image(p.icon, ctx),
    style: p.style === "destructive" || p.style === "Action.Style.Destructive" ? "destructive" : "regular",
    shortcut: shortcut(p.shortcut),
    kind,
    payload: p.payload || null,
    callbackId: p.onAction || p.onSubmit || p.onCopy || p.onOpen || p.onPaste || p.onChange || p.onTrash || p.onShow || null,
    autoFocus: p.autoFocus === true
  };
  return a;
}
function actionPanel(inst, ctx) {
  if (!inst) return null;
  const sections = [];
  let loose = [];
  const flush = () => {
    if (loose.length) {
      sections.push({ title: "", actions: loose });
      loose = [];
    }
  };
  const walk = (children, sectionTitle) => {
    for (const c of children) {
      if (c.t === "action") {
        if (sectionTitle === null) loose.push(action(c, ctx));
        else sections[sections.length - 1].actions.push(action(c, ctx));
      } else if (c.t === "action-section") {
        flush();
        sections.push({ title: str(c.p.title), actions: [] });
        walk(c.c, str(c.p.title));
      } else if (c.t === "action-submenu") {
        flush();
        sections.push({ title: str(c.p.title), actions: [] });
        walk(c.c, str(c.p.title));
      } else if (c.t === "#fragment") walk(c.c, sectionTitle);
    }
  };
  walk(inst.c, null);
  flush();
  return { title: str(inst.p.title), sections };
}
function metadata(inst, ctx) {
  if (!inst) return [];
  const out = [];
  for (const c of inst.c) {
    if (c.t === "metadata-label") out.push({ kind: "label", title: str(c.p.title), text: textValue(c.p.text, ctx), icon: image(c.p.icon, ctx) });
    else if (c.t === "metadata-link") out.push({ kind: "link", title: str(c.p.title), text: str(c.p.text), target: str(c.p.target) });
    else if (c.t === "metadata-taglist") out.push({ kind: "tags", title: str(c.p.title), tags: c.c.filter((t) => t.t === "metadata-tag").map((t) => ({ text: str(t.p.text), color: t.p.color ? color(t.p.color, ctx) : "", icon: image(t.p.icon, ctx), callbackId: t.p.onAction || null })) });
    else if (c.t === "metadata-separator") out.push({ kind: "separator" });
  }
  return out;
}
function childOf(inst, type) {
  for (const c of inst.c) if (c.t === type) return c;
  return null;
}
function listItem(inst, ctx, index) {
  const p = inst.p;
  const detailInst = childOf(inst, "list-item-detail");
  const item = {
    id: str(p.id || "i" + index),
    title: typeof p.title === "object" && p.title ? str(p.title.value) : str(p.title),
    subtitle: typeof p.subtitle === "object" && p.subtitle ? str(p.subtitle.value) : str(p.subtitle),
    icon: image(p.icon, ctx),
    keywords: Array.isArray(p.keywords) ? p.keywords.map(str) : [],
    accessories: accessories(p.accessories, ctx),
    actions: actionPanel(childOf(inst, "action-panel"), ctx),
    detail: detailInst ? { markdown: str(detailInst.p.markdown), isLoading: detailInst.p.isLoading === true, metadata: metadata(childOf(detailInst, "metadata"), ctx) } : null,
    quickLook: p.quickLook ? { path: str(p.quickLook.path), name: str(p.quickLook.name) } : null
  };
  return item;
}
function gridItem(inst, ctx, index) {
  const p = inst.p;
  let content = null;
  const c = p.content;
  if (c && typeof c === "object" && !c.source && !c.fileIcon && (c.color || c.value && typeof c.value === "object" && c.value.color)) content = { color: color(c.color || c.value.color, ctx) };
  else if (c && typeof c === "object" && c.value !== void 0 && c.tooltip !== void 0) content = { image: image(c.value, ctx) };
  else content = { image: image(c, ctx) };
  return {
    id: str(p.id || "g" + index),
    title: str(p.title),
    subtitle: str(p.subtitle),
    keywords: Array.isArray(p.keywords) ? p.keywords.map(str) : [],
    content,
    accessory: p.accessory ? { icon: image(p.accessory.icon, ctx), text: str(p.accessory.text), tooltip: str(p.accessory.tooltip) } : null,
    actions: actionPanel(childOf(inst, "action-panel"), ctx)
  };
}
function dropdown(inst, ctx) {
  if (!inst) return null;
  const sections = [];
  let loose = [];
  const item = (c) => ({ value: str(c.p.value), title: str(c.p.title), icon: image(c.p.icon, ctx), keywords: Array.isArray(c.p.keywords) ? c.p.keywords.map(str) : [] });
  for (const c of inst.c) {
    if (c.t === "dropdown-item") loose.push(item(c));
    else if (c.t === "dropdown-section") {
      if (loose.length) {
        sections.push({ title: "", items: loose });
        loose = [];
      }
      sections.push({ title: str(c.p.title), items: c.c.filter((x) => x.t === "dropdown-item").map(item) });
    }
  }
  if (loose.length) sections.push({ title: "", items: loose });
  return { id: str(inst.p.id || "dropdown"), tooltip: str(inst.p.tooltip), placeholder: str(inst.p.placeholder), value: inst.p.value !== void 0 ? str(inst.p.value) : void 0, defaultValue: inst.p.defaultValue !== void 0 ? str(inst.p.defaultValue) : void 0, storeValue: inst.p.storeValue === true, sections, handlers: { change: inst.p.onChange || null, searchText: inst.p.onSearchTextChange || null }, isLoading: inst.p.isLoading === true, filtering: inst.p.filtering };
}
function emptyView(inst, ctx) {
  if (!inst) return null;
  return { icon: image(inst.p.icon, ctx), title: str(inst.p.title), description: str(inst.p.description), actions: actionPanel(childOf(inst, "action-panel"), ctx) };
}
function collection(inst, ctx, itemType, mapItem) {
  const sections = [];
  let loose = [];
  let n = 0;
  let empty = null;
  let accessory = null;
  let actions = null;
  const flush = () => {
    if (loose.length) {
      sections.push({ id: "s" + sections.length, title: "", items: loose });
      loose = [];
    }
  };
  for (const c of inst.c) {
    if (c.t === itemType) loose.push(mapItem(c, ctx, n++));
    else if (c.t === itemType.replace("-item", "-section")) {
      flush();
      sections.push({ id: str(c.p.id || "s" + sections.length), title: str(c.p.title), subtitle: str(c.p.subtitle), columns: c.p.columns, aspectRatio: c.p.aspectRatio, inset: c.p.inset, fit: c.p.fit, items: c.c.filter((x) => x.t === itemType).map((x) => mapItem(x, ctx, n++)) });
    } else if (c.t === "empty-view") empty = emptyView(c, ctx);
    else if (c.t === "dropdown") accessory = dropdown(c, ctx);
    else if (c.t === "action-panel") actions = actionPanel(c, ctx);
  }
  flush();
  return { sections, emptyView: empty, accessory, actions };
}
function list(inst, ctx) {
  const p = inst.p;
  const col = collection(inst, ctx, "list-item", listItem);
  const filtering = p.filtering === void 0 ? !p.onSearchTextChange : typeof p.filtering === "object" ? true : p.filtering !== false;
  return {
    id: ctx.viewId,
    type: "list",
    navigationTitle: str(p.navigationTitle),
    searchBarPlaceholder: str(p.searchBarPlaceholder || "Search\u2026"),
    searchText: p.searchText !== void 0 ? str(p.searchText) : void 0,
    filtering,
    keepSectionOrder: typeof p.filtering === "object" && p.filtering ? p.filtering.keepSectionOrder === true : false,
    throttle: p.throttle === true,
    isLoading: p.isLoading === true,
    isShowingDetail: p.isShowingDetail === true,
    selectedItemId: p.selectedItemId !== void 0 ? str(p.selectedItemId) : void 0,
    sections: col.sections,
    emptyView: col.emptyView,
    searchBarAccessory: col.accessory,
    actions: col.actions,
    pagination: p.pagination ? { hasMore: !!p.pagination.hasMore, pageSize: p.pagination.pageSize } : null,
    handlers: { searchText: p.onSearchTextChange || null, selection: p.onSelectionChange || null, loadMore: p.pagination && p.pagination.onLoadMore ? p.pagination.onLoadMore : null }
  };
}
function grid(inst, ctx) {
  const p = inst.p;
  const col = collection(inst, ctx, "grid-item", gridItem);
  const filtering = p.filtering === void 0 ? !p.onSearchTextChange : typeof p.filtering === "object" ? true : p.filtering !== false;
  return {
    id: ctx.viewId,
    type: "grid",
    navigationTitle: str(p.navigationTitle),
    searchBarPlaceholder: str(p.searchBarPlaceholder || "Search\u2026"),
    searchText: p.searchText !== void 0 ? str(p.searchText) : void 0,
    filtering,
    throttle: p.throttle === true,
    isLoading: p.isLoading === true,
    columns: p.columns || 5,
    aspectRatio: str(p.aspectRatio || "1"),
    inset: str(p.inset || "small"),
    fit: str(p.fit || "contain"),
    selectedItemId: p.selectedItemId !== void 0 ? str(p.selectedItemId) : void 0,
    sections: col.sections,
    emptyView: col.emptyView,
    searchBarAccessory: col.accessory,
    actions: col.actions,
    pagination: p.pagination ? { hasMore: !!p.pagination.hasMore, pageSize: p.pagination.pageSize } : null,
    handlers: { searchText: p.onSearchTextChange || null, selection: p.onSelectionChange || null, loadMore: p.pagination && p.pagination.onLoadMore ? p.pagination.onLoadMore : null }
  };
}
function detail(inst, ctx) {
  const p = inst.p;
  return { id: ctx.viewId, type: "detail", navigationTitle: str(p.navigationTitle), isLoading: p.isLoading === true, markdown: str(p.markdown), metadata: metadata(childOf(inst, "metadata"), ctx), actions: actionPanel(childOf(inst, "action-panel"), ctx) };
}
function form(inst, ctx) {
  const p = inst.p;
  const fields = [];
  let actions = null;
  const dateValue = (v) => v instanceof Date ? v.toISOString() : v === null || v === void 0 ? v : str(v);
  for (const c of inst.c) {
    if (c.t === "action-panel") {
      actions = actionPanel(c, ctx);
      continue;
    }
    const kind = FORM_KINDS[c.t];
    if (!kind) continue;
    const f = { id: str(c.p.id || "f" + fields.length), field: kind, title: str(c.p.title), info: str(c.p.info), error: str(c.p.error), placeholder: str(c.p.placeholder), autoFocus: c.p.autoFocus === true, storeValue: c.p.storeValue === true, handlers: { change: c.p.onChange || null, focus: c.p.onFocus || null, blur: c.p.onBlur || null } };
    if (kind === "date") {
      f.value = dateValue(c.p.value);
      f.defaultValue = dateValue(c.p.defaultValue);
      f.type = c.p.type === "date" ? "date" : "dateTime";
      f.min = dateValue(c.p.min);
      f.max = dateValue(c.p.max);
    } else {
      if (c.p.value !== void 0) f.value = c.p.value;
      if (c.p.defaultValue !== void 0) f.defaultValue = c.p.defaultValue;
    }
    if (kind === "checkbox") f.label = str(c.p.label);
    if (kind === "description") f.text = str(c.p.text);
    if (kind === "textarea") f.enableMarkdown = c.p.enableMarkdown === true;
    if (kind === "dropdown" || kind === "tags") {
      const items = [];
      const item = (x) => ({ value: str(x.p.value), title: str(x.p.title), icon: image(x.p.icon, ctx) });
      for (const x of c.c) {
        if (x.t === "dropdown-item") items.push(item(x));
        else if (x.t === "dropdown-section") items.push({ title: str(x.p.title), items: x.c.filter((y) => y.t === "dropdown-item").map(item) });
      }
      f.items = items;
      f.filtering = c.p.filtering;
    }
    if (kind === "file") {
      f.allowMultiple = c.p.allowMultipleSelection !== false;
      f.files = c.p.canChooseFiles !== false;
      f.directories = c.p.canChooseDirectories === true;
    }
    if (kind === "link") {
      f.text = str(c.p.text);
      f.target = str(c.p.target);
    }
    fields.push(f);
  }
  return { id: ctx.viewId, type: "form", navigationTitle: str(p.navigationTitle), isLoading: p.isLoading === true, enableDrafts: p.enableDrafts === true, fields, actions };
}
function menubar(inst, ctx) {
  const items = (children) => {
    const out = [];
    for (const c of children) {
      if (c.t === "menubar-item") out.push({ kind: "item", id: str(c.p.onAction || "m" + ++autoId), title: str(c.p.title), subtitle: str(c.p.subtitle), icon: image(c.p.icon, ctx), tooltip: str(c.p.tooltip), shortcut: shortcut(c.p.shortcut), callbackId: c.p.onAction || null });
      else if (c.t === "menubar-submenu") out.push({ kind: "submenu", title: str(c.p.title), icon: image(c.p.icon, ctx), items: items(c.c) });
      else if (c.t === "menubar-section") out.push({ kind: "section", title: str(c.p.title), items: items(c.c) });
      else if (c.t === "menubar-separator") out.push({ kind: "separator" });
    }
    return out;
  };
  return { id: ctx.viewId, type: "menubar", title: str(inst.p.title), icon: image(inst.p.icon, ctx), tooltip: str(inst.p.tooltip), isLoading: inst.p.isLoading === true, items: items(inst.c) };
}
function serializeView(slot, ctx) {
  const root = slot.c.find((c) => c.t !== "#text" && c.t !== "#fragment") || slot.c[0] && slot.c[0].c.find((c) => c.t !== "#text");
  if (!root) return { id: ctx.viewId, type: "list", isLoading: true, sections: [], searchBarPlaceholder: "Loading\u2026" };
  switch (root.t) {
    case "list":
      return list(root, ctx);
    case "grid":
      return grid(root, ctx);
    case "detail":
      return detail(root, ctx);
    case "form":
      return form(root, ctx);
    case "menubar":
      return menubar(root, ctx);
    default:
      return { id: ctx.viewId, type: "detail", markdown: "Unsupported root component: `" + root.t + "`", metadata: [], actions: null };
  }
}
var autoId, KEY_LABELS, FORM_KINDS;
var init_viewmodel = __esm({
  "src/viewmodel.ts"() {
    autoId = 0;
    KEY_LABELS = { return: "\u21B5", enter: "\u21B5", delete: "\u232B", backspace: "\u232B", deleteForward: "\u2326", tab: "\u21E5", arrowUp: "\u2191", arrowDown: "\u2193", arrowLeft: "\u2190", arrowRight: "\u2192", pageUp: "\u21DE", pageDown: "\u21DF", home: "\u2196", end: "\u2198", space: "\u2423", escape: "\u238B" };
    FORM_KINDS = { "form-textfield": "text", "form-password": "password", "form-textarea": "textarea", "form-checkbox": "checkbox", "form-datepicker": "date", "form-dropdown": "dropdown", "form-tagpicker": "tags", "form-filepicker": "file", "form-separator": "separator", "form-description": "description", "form-linkaccessory": "link" };
  }
});

// src/api/icons.generated.ts
var Icon;
var init_icons_generated = __esm({
  "src/api/icons.generated.ts"() {
    Icon = {
      AddPerson: "add-person-16",
      Airplane: "airplane-16",
      AirplaneFilled: "airplane-filled-16",
      AirplaneLanding: "airplane-landing-16",
      AirplaneTakeoff: "airplane-takeoff-16",
      Airpods: "airpods-16",
      Alarm: "alarm-16",
      AlarmRinging: "alarm-ringing-16",
      AlignCentre: "align-centre-16",
      AlignLeft: "align-left-16",
      AlignRight: "align-right-16",
      AmericanFootball: "american-football-16",
      Anchor: "anchor-16",
      AppWindow: "app-window-16",
      AppWindowGrid2x2: "app-window-grid-2x2-16",
      AppWindowGrid3x3: "app-window-grid-3x3-16",
      AppWindowList: "app-window-list-16",
      AppWindowSidebarLeft: "app-window-sidebar-left-16",
      AppWindowSidebarRight: "app-window-sidebar-right-16",
      ArrowClockwise: "arrow-clockwise-16",
      ArrowCounterClockwise: "arrow-counter-clockwise-16",
      ArrowDown: "arrow-down-16",
      ArrowDownCircle: "arrow-down-circle-16",
      ArrowDownCircleFilled: "arrow-down-circle-filled-16",
      ArrowLeft: "arrow-left-16",
      ArrowLeftCircle: "arrow-left-circle-16",
      ArrowLeftCircleFilled: "arrow-left-circle-filled-16",
      ArrowNe: "arrow-ne-16",
      ArrowRight: "arrow-right-16",
      ArrowRightCircle: "arrow-right-circle-16",
      ArrowRightCircleFilled: "arrow-right-circle-filled-16",
      ArrowUp: "arrow-up-16",
      ArrowUpCircle: "arrow-up-circle-16",
      ArrowUpCircleFilled: "arrow-up-circle-filled-16",
      ArrowsContract: "arrows-contract-16",
      ArrowsExpand: "arrows-expand-16",
      AtSymbol: "at-symbol-16",
      BandAid: "band-aid-16",
      BankNote: "bank-note-16",
      BarChart: "bar-chart-16",
      BarCode: "bar-code-16",
      BathTub: "bath-tub-16",
      Battery: "battery-16",
      BatteryCharging: "battery-charging-16",
      BatteryDisabled: "battery-disabled-16",
      Bell: "bell-16",
      BellDisabled: "bell-disabled-16",
      Bike: "bike-16",
      Binoculars: "binoculars-16",
      Bird: "bird-16",
      BlankDocument: "blank-document-16",
      Bluetooth: "bluetooth-16",
      Boat: "boat-16",
      Bold: "bold-16",
      Bolt: "bolt-16",
      BoltDisabled: "bolt-disabled-16",
      Book: "book-16",
      Bookmark: "bookmark-16",
      Box: "box-16",
      Brush: "brush-16",
      Bubble: "speech-bubble-16",
      Bug: "bug-16",
      Building: "building-16",
      BulletPoints: "bullet-points-16",
      BullsEye: "bulls-eye-16",
      BullsEyeMissed: "bulls-eye-missed-16",
      Buoy: "buoy-16",
      Calculator: "calculator-16",
      Calendar: "calendar-16",
      Camera: "camera-16",
      Car: "car-16",
      Cart: "cart-16",
      Cd: "cd-16",
      Center: "center-16",
      Check: "check-16",
      CheckCircle: "check-circle-16",
      CheckList: "check-list-16",
      CheckRosette: "check-rosette-16",
      Checkmark: "checkmark-16",
      ChessPiece: "chess-piece-16",
      ChevronDown: "chevron-down-16",
      ChevronDownSmall: "chevron-down-small-16",
      ChevronLeft: "chevron-left-16",
      ChevronLeftSmall: "chevron-left-small-16",
      ChevronRight: "chevron-right-16",
      ChevronRightSmall: "chevron-right-small-16",
      ChevronUp: "chevron-up-16",
      ChevronUpDown: "chevron-up-down-16",
      ChevronUpSmall: "chevron-up-small-16",
      Circle: "circle-16",
      CircleDisabled: "circle-disabled-16",
      CircleEllipsis: "circle-ellipsis-16",
      CircleFilled: "circle-filled-16",
      CircleProgress: "circle-progress-16",
      CircleProgress100: "circle-progress-100-16",
      CircleProgress25: "circle-progress-25-16",
      CircleProgress50: "circle-progress-50-16",
      CircleProgress75: "circle-progress-75-16",
      ClearFormatting: "clear-formatting-16",
      Clipboard: "copy-clipboard-16",
      Clock: "clock-16",
      Cloud: "cloud-16",
      CloudLightning: "cloud-lightning-16",
      CloudRain: "cloud-rain-16",
      CloudSnow: "cloud-snow-16",
      CloudSun: "cloud-sun-16",
      Code: "code-16",
      CodeBlock: "code-block-16",
      Cog: "cog-16",
      Coin: "coin-16",
      Coins: "coins-16",
      CommandSymbol: "command-symbol-16",
      Compass: "compass-16",
      ComputerChip: "computer-chip-16",
      Contrast: "contrast-16",
      CopyClipboard: "copy-clipboard-16",
      CreditCard: "credit-card-16",
      CricketBall: "cricket-ball-16",
      Crop: "crop-16",
      Crown: "crown-16",
      Crypto: "crypto-16",
      DeleteDocument: "delete-document-16",
      Desktop: "desktop-16",
      Devices: "devices-16",
      Dna: "dna-16",
      Document: "blank-document-16",
      Dot: "dot-16",
      Download: "download-16",
      Droplets: "droplets-16",
      Duplicate: "duplicate-16",
      EditShape: "edit-shape-16",
      Eject: "eject-16",
      Ellipsis: "ellipsis-16",
      EllipsisVertical: "ellipsis-vertical-16",
      Emoji: "emoji-16",
      EmojiSad: "emoji-sad-16",
      Envelope: "envelope-16",
      Eraser: "eraser-16",
      ExclamationMark: "important-01-16",
      Exclamationmark: "exclamationmark-16",
      Exclamationmark2: "exclamationmark-2-16",
      Exclamationmark3: "exclamationmark-3-16",
      Eye: "eye-16",
      EyeDisabled: "eye-disabled-16",
      EyeDropper: "eye-dropper-16",
      Female: "female-16",
      FilmStrip: "film-strip-16",
      Filter: "filter-16",
      Finder: "finder-16",
      Fingerprint: "fingerprint-16",
      Flag: "flag-16",
      Folder: "folder-16",
      Footprints: "footprints-16",
      Forward: "forward-16",
      ForwardFilled: "forward-filled-16",
      FountainTip: "fountain-tip-16",
      FullSignal: "full-signal-16",
      GameController: "game-controller-16",
      Gauge: "gauge-16",
      Gear: "cog-16",
      Geopin: "geopin-16",
      Germ: "germ-16",
      Gift: "gift-16",
      Glasses: "glasses-16",
      Globe: "globe-01-16",
      Goal: "goal-16",
      Hammer: "hammer-16",
      HardDrive: "hard-drive-16",
      Hashtag: "hashtag-16",
      Heading: "heading-16",
      Headphones: "headphones-16",
      Heart: "heart-16",
      HeartDisabled: "heart-disabled-16",
      Heartbeat: "heartbeat-16",
      Highlight: "highlight-16",
      Hourglass: "hourglass-16",
      House: "house-16",
      Humidity: "humidity-16",
      Image: "image-16",
      Important: "important-01-16",
      Info: "info-01-16",
      Italics: "italics-16",
      Key: "key-16",
      Keyboard: "keyboard-16",
      Layers: "layers-16",
      Leaderboard: "leaderboard-16",
      Leaf: "leaf-16",
      LevelMeter: "signal-2-16",
      LightBulb: "light-bulb-16",
      LightBulbOff: "light-bulb-off-16",
      LineChart: "line-chart-16",
      Link: "link-16",
      List: "app-window-list-16",
      Livestream: "livestream-01-16",
      LivestreamDisabled: "livestream-disabled-01-16",
      Lock: "lock-16",
      LockDisabled: "lock-disabled-16",
      LockUnlocked: "lock-unlocked-16",
      Logout: "logout-16",
      Lorry: "lorry-16",
      Lowercase: "lowercase-16",
      MagnifyingGlass: "magnifying-glass-16",
      Male: "male-16",
      Map: "map-16",
      Mask: "mask-16",
      Maximize: "maximize-16",
      MedicalSupport: "medical-support-16",
      Megaphone: "megaphone-16",
      MemoryChip: "computer-chip-16",
      MemoryStick: "memory-stick-16",
      Message: "speech-bubble-16",
      Microphone: "microphone-16",
      MicrophoneDisabled: "microphone-disabled-16",
      Minimize: "minimize-16",
      Minus: "minus-16",
      MinusCircle: "minus-circle-16",
      MinusCircleFilled: "minus-circle-filled-16",
      Mobile: "mobile-16",
      Monitor: "monitor-16",
      Moon: "moon-16",
      MoonDown: "moon-down-16",
      MoonUp: "moon-up-16",
      Moonrise: "moonrise-16",
      Mountain: "mountain-16",
      Mouse: "mouse-16",
      Move: "move-16",
      Mug: "mug-16",
      MugSteam: "mug-steam-16",
      Multiply: "multiply-16",
      Music: "music-16",
      Network: "network-16",
      NewDocument: "new-document-16",
      NewFolder: "new-folder-16",
      Number00: "number-00-16",
      Number01: "number-01-16",
      Number02: "number-02-16",
      Number03: "number-03-16",
      Number04: "number-04-16",
      Number05: "number-05-16",
      Number06: "number-06-16",
      Number07: "number-07-16",
      Number08: "number-08-16",
      Number09: "number-09-16",
      Number10: "number-10-16",
      Number11: "number-11-16",
      Number12: "number-12-16",
      Number13: "number-13-16",
      Number14: "number-14-16",
      Number15: "number-15-16",
      Number16: "number-16-16",
      Number17: "number-17-16",
      Number18: "number-18-16",
      Number19: "number-19-16",
      Number20: "number-20-16",
      Number21: "number-21-16",
      Number22: "number-22-16",
      Number23: "number-23-16",
      Number24: "number-24-16",
      Number25: "number-25-16",
      Number26: "number-26-16",
      Number27: "number-27-16",
      Number28: "number-28-16",
      Number29: "number-29-16",
      Number30: "number-30-16",
      Number31: "number-31-16",
      Number32: "number-32-16",
      Number33: "number-33-16",
      Number34: "number-34-16",
      Number35: "number-35-16",
      Number36: "number-36-16",
      Number37: "number-37-16",
      Number38: "number-38-16",
      Number39: "number-39-16",
      Number40: "number-40-16",
      Number41: "number-41-16",
      Number42: "number-42-16",
      Number43: "number-43-16",
      Number44: "number-44-16",
      Number45: "number-45-16",
      Number46: "number-46-16",
      Number47: "number-47-16",
      Number48: "number-48-16",
      Number49: "number-49-16",
      Number50: "number-50-16",
      Number51: "number-51-16",
      Number52: "number-52-16",
      Number53: "number-53-16",
      Number54: "number-54-16",
      Number55: "number-55-16",
      Number56: "number-56-16",
      Number57: "number-57-16",
      Number58: "number-58-16",
      Number59: "number-59-16",
      Number60: "number-60-16",
      Number61: "number-61-16",
      Number62: "number-62-16",
      Number63: "number-63-16",
      Number64: "number-64-16",
      Number65: "number-65-16",
      Number66: "number-66-16",
      Number67: "number-67-16",
      Number68: "number-68-16",
      Number69: "number-69-16",
      Number70: "number-70-16",
      Number71: "number-71-16",
      Number72: "number-72-16",
      Number73: "number-73-16",
      Number74: "number-74-16",
      Number75: "number-75-16",
      Number76: "number-76-16",
      Number77: "number-77-16",
      Number78: "number-78-16",
      Number79: "number-79-16",
      Number80: "number-80-16",
      Number81: "number-81-16",
      Number82: "number-82-16",
      Number83: "number-83-16",
      Number84: "number-84-16",
      Number85: "number-85-16",
      Number86: "number-86-16",
      Number87: "number-87-16",
      Number88: "number-88-16",
      Number89: "number-89-16",
      Number90: "number-90-16",
      Number91: "number-91-16",
      Number92: "number-92-16",
      Number93: "number-93-16",
      Number94: "number-94-16",
      Number95: "number-95-16",
      Number96: "number-96-16",
      Number97: "number-97-16",
      Number98: "number-98-16",
      Number99: "number-99-16",
      NumberList: "number-list-16",
      Paperclip: "paperclip-16",
      Paragraph: "paragraph-16",
      Patch: "patch-16",
      Pause: "pause-16",
      PauseFilled: "pause-filled-16",
      Pencil: "pencil-16",
      Person: "person-16",
      PersonCircle: "person-circle-16",
      PersonLines: "person-lines-16",
      Phone: "phone-16",
      PhoneRinging: "phone-ringing-16",
      PieChart: "pie-chart-16",
      Pill: "pill-16",
      Pin: "pin-16",
      PinDisabled: "pin-disabled-16",
      Play: "play-16",
      PlayFilled: "play-filled-16",
      Plug: "plug-16",
      Plus: "plus-16",
      PlusCircle: "plus-circle-16",
      PlusCircleFilled: "plus-circle-filled-16",
      PlusMinusDivideMultiply: "plus-minus-divide-multiply-16",
      PlusSquare: "plus-square-16",
      PlusTopRightSquare: "plus-top-right-square-16",
      Power: "power-16",
      Print: "print-16",
      QuestionMark: "question-mark-circle-16",
      QuestionMarkCircle: "question-mark-circle-16",
      Quicklink: "quicklink-16",
      QuotationMarks: "quotation-marks-16",
      QuoteBlock: "quote-block-16",
      Racket: "racket-16",
      Raindrop: "raindrop-16",
      RaycastLogoNeg: "raycast-logo-neg-16",
      RaycastLogoPos: "raycast-logo-pos-16",
      Receipt: "receipt-16",
      Redo: "redo-16",
      RemovePerson: "remove-person-16",
      Repeat: "repeat-16",
      Replace: "replace-16",
      ReplaceOne: "replace-one-16",
      Reply: "reply-16",
      Rewind: "rewind-16",
      RewindFilled: "rewind-filled-16",
      Rocket: "rocket-16",
      Rosette: "rosette-16",
      RotateAntiClockwise: "rotate-anti-clockwise-16",
      RotateClockwise: "rotate-clockwise-16",
      Rss: "rss-16",
      Ruler: "ruler-16",
      SaveDocument: "save-document-16",
      Shield: "shield-01-16",
      ShortParagraph: "short-paragraph-16",
      Shuffle: "shuffle-16",
      Sidebar: "app-window-sidebar-right-16",
      Signal0: "signal-0-16",
      Signal1: "signal-1-16",
      Signal2: "signal-2-16",
      Signal3: "signal-3-16",
      Snippets: "snippets-16",
      Snowflake: "snowflake-16",
      SoccerBall: "soccer-ball-16",
      Speaker: "speaker-16",
      SpeakerDown: "speaker-down-16",
      SpeakerHigh: "speaker-high-16",
      SpeakerLow: "speaker-low-16",
      SpeakerOff: "speaker-off-16",
      SpeakerOn: "speaker-on-16",
      SpeakerUp: "speaker-up-16",
      SpeechBubble: "speech-bubble-16",
      SpeechBubbleActive: "speech-bubble-active-16",
      SpeechBubbleImportant: "speech-bubble-important-16",
      SquareEllipsis: "square-ellipsis-16",
      StackedBars1: "stacked-bars-1-16",
      StackedBars2: "stacked-bars-2-16",
      StackedBars3: "stacked-bars-3-16",
      StackedBars4: "stacked-bars-4-16",
      Star: "star-16",
      StarCircle: "star-circle-16",
      StarDisabled: "star-disabled-16",
      Stars: "stars-16",
      Stop: "stop-16",
      StopFilled: "stop-filled-16",
      Stopwatch: "stopwatch-16",
      Store: "store-16",
      StrikeThrough: "strike-through-16",
      Sun: "sun-16",
      Sunrise: "sunrise-16",
      Swatch: "swatch-16",
      Switch: "switch-16",
      Syringe: "syringe-16",
      Tack: "tack-16",
      TackDisabled: "tack-disabled-16",
      Tag: "tag-16",
      Temperature: "temperature-16",
      TennisBall: "tennis-ball-16",
      Terminal: "terminal-16",
      Text: "text-16",
      TextCursor: "text-cursor-16",
      TextInput: "text-input-16",
      TextSelection: "text-selection-16",
      ThumbsDown: "thumbs-down-16",
      ThumbsDownFilled: "thumbs-down-filled-16",
      ThumbsUp: "thumbs-up-16",
      ThumbsUpFilled: "thumbs-up-filled-16",
      Ticket: "ticket-16",
      Torch: "torch-16",
      Train: "train-16",
      Trash: "trash-16",
      Tray: "tray-16",
      Tree: "tree-16",
      Trophy: "trophy-16",
      TwoPeople: "two-people-16",
      Umbrella: "umbrella-16",
      Underline: "underline-16",
      Undo: "undo-16",
      Upload: "upload-16",
      Uppercase: "uppercase-16",
      Video: "video-16",
      VideoDisabled: "video-disabled-16",
      Wallet: "wallet-16",
      Wand: "wand-16",
      Warning: "warning-16",
      Waveform: "waveform-16",
      Weights: "weights-16",
      Wifi: "wifi-16",
      WifiDisabled: "wifi-disabled-16",
      Wind: "wind-16",
      Window: "app-window-16",
      Windsock: "windsock-16",
      WrenchScrewdriver: "wrench-screwdriver-16",
      WristWatch: "wrist-watch-16",
      XMarkCircle: "x-mark-circle-16",
      XMarkCircleFilled: "x-mark-circle-filled-16",
      XMarkCircleHalfDash: "x-mark-circle-half-dash-16",
      XMarkTopRightSquare: "x-mark-top-right-square-16",
      Xmark: "xmark-16",
      TwoArrowsClockwise: "arrow-clockwise-16",
      EyeSlash: "eye-disabled-16",
      SpeakerArrowDown: "speaker-down-16",
      SpeakerArrowUp: "speaker-up-16",
      SpeakerSlash: "speaker-off-16",
      TextDocument: "blank-document-16",
      XmarkCircle: "x-mark-circle-16"
    };
  }
});

// src/api/enums.ts
var Color, ImageMask, Image, ToastStyle, AlertActionStyle, ActionStyle, LaunchType, PopToRootType, DatePickerType, GridInset, GridFit, GridItemSize, GridAspectRatio, Keyboard;
var init_enums = __esm({
  "src/api/enums.ts"() {
    init_icons_generated();
    Color = {
      Blue: "raycast-blue",
      Green: "raycast-green",
      Magenta: "raycast-magenta",
      Orange: "raycast-orange",
      Purple: "raycast-purple",
      Red: "raycast-red",
      Yellow: "raycast-yellow",
      PrimaryText: "raycast-primary-text",
      SecondaryText: "raycast-secondary-text"
    };
    ImageMask = { Circle: "circle", RoundedRectangle: "roundedRectangle" };
    Image = { Mask: ImageMask };
    ToastStyle = { Success: "SUCCESS", Failure: "FAILURE", Animated: "ANIMATED" };
    AlertActionStyle = { Default: "DEFAULT", Cancel: "CANCEL", Destructive: "DESTRUCTIVE" };
    ActionStyle = { Regular: "regular", Destructive: "destructive" };
    LaunchType = { UserInitiated: "userInitiated", Background: "background" };
    PopToRootType = { Default: "default", Immediate: "immediate", Suspended: "suspended" };
    DatePickerType = { Date: "date", DateTime: "date_time" };
    GridInset = { Zero: "zero", Small: "small", Medium: "medium", Large: "large" };
    GridFit = { Contain: "contain", Fill: "fill" };
    GridItemSize = { Small: "small", Medium: "medium", Large: "large" };
    GridAspectRatio = { "1": "1", "3/2": "3/2", "2/3": "2/3", "4/3": "4/3", "3/4": "3/4", "16/9": "16/9", "9/16": "9/16" };
    Keyboard = {
      Shortcut: {
        Common: {
          Copy: { modifiers: ["cmd", "shift"], key: "c" },
          CopyDeeplink: { modifiers: ["cmd", "shift"], key: "c" },
          CopyName: { modifiers: ["cmd", "shift"], key: "." },
          CopyPath: { modifiers: ["cmd", "shift"], key: "," },
          Save: { modifiers: ["cmd"], key: "s" },
          Duplicate: { modifiers: ["cmd"], key: "d" },
          Edit: { modifiers: ["cmd"], key: "e" },
          MoveDown: { modifiers: ["cmd", "shift"], key: "arrowDown" },
          MoveUp: { modifiers: ["cmd", "shift"], key: "arrowUp" },
          New: { modifiers: ["cmd"], key: "n" },
          Open: { modifiers: ["cmd"], key: "o" },
          OpenWith: { modifiers: ["cmd", "shift"], key: "o" },
          Pin: { modifiers: ["cmd", "shift"], key: "p" },
          Refresh: { modifiers: ["cmd"], key: "r" },
          Remove: { modifiers: ["ctrl"], key: "x" },
          RemoveAll: { modifiers: ["ctrl", "shift"], key: "x" },
          ToggleQuickLook: { modifiers: ["cmd"], key: "y" }
        }
      }
    };
  }
});

// src/api/components.tsx
function rest(props, drop) {
  const out = {};
  for (const k of Object.keys(props || {})) if (drop.indexOf(k) < 0) out[k] = props[k];
  return out;
}
function useNavigation() {
  const nav = React.useContext(NavigationContext);
  if (nav) return nav;
  const client2 = getClient();
  return client2.navigation || { push: async () => {
  }, pop: async () => {
  } };
}
function clipboardContent(content) {
  if (content === void 0 || content === null) return { text: "" };
  if (typeof content === "string" || typeof content === "number") return { text: String(content) };
  if (typeof content === "object") return { text: content.text !== void 0 ? String(content.text) : "", html: content.html, file: content.file ? String(content.file) : void 0 };
  return { text: String(content) };
}
var React, h, NavigationContext, Metadata, Dropdown, EmptyView, List, Grid, Detail, Form, ActionPanel, Action, MenuBarExtra, ListItem, ListSection, FormTextField, FormTextArea, FormCheckbox, FormDatePicker, FormDropdown, FormDropdownItem, FormDropdownSection, FormTagPicker, FormTagPickerItem, FormSeparator, ActionPanelItem, ActionPanelSection, ActionPanelSubmenu, CopyToClipboardAction, PasteAction, OpenAction, OpenInBrowserAction, OpenWithAction, ShowInFinderAction, TrashAction, PushAction, SubmitFormAction, useActionPanel, useId2, render;
var init_components = __esm({
  "src/api/components.tsx"() {
    React = __toESM(require_react());
    init_client();
    init_enums();
    h = React.createElement;
    NavigationContext = React.createContext(null);
    Metadata = (props) => h("metadata", rest(props, ["children"]), props.children);
    Metadata.Label = (props) => h("metadata-label", props);
    Metadata.Link = (props) => h("metadata-link", props);
    Metadata.TagList = (props) => h("metadata-taglist", rest(props, ["children"]), props.children);
    Metadata.TagList.Item = (props) => h("metadata-tag", props);
    Metadata.Separator = () => h("metadata-separator", {});
    Dropdown = (props) => h("dropdown", rest(props, ["children"]), props.children);
    Dropdown.Item = (props) => h("dropdown-item", props);
    Dropdown.Section = (props) => h("dropdown-section", rest(props, ["children"]), props.children);
    EmptyView = (props) => h("empty-view", rest(props, ["children", "actions"]), props.actions);
    List = (props) => h("list", rest(props, ["children", "actions", "searchBarAccessory"]), props.searchBarAccessory, props.actions, props.children);
    List.Item = (props) => h("list-item", rest(props, ["children", "actions", "detail"]), props.actions, props.detail, props.children);
    List.Item.Detail = (props) => h("list-item-detail", rest(props, ["children", "metadata"]), props.metadata);
    List.Item.Detail.Metadata = Metadata;
    List.Section = (props) => h("list-section", rest(props, ["children"]), props.children);
    List.EmptyView = EmptyView;
    List.Dropdown = Dropdown;
    Grid = (props) => h("grid", rest(props, ["children", "actions", "searchBarAccessory"]), props.searchBarAccessory, props.actions, props.children);
    Grid.Item = (props) => h("grid-item", rest(props, ["children", "actions"]), props.actions, props.children);
    Grid.Section = (props) => h("grid-section", rest(props, ["children"]), props.children);
    Grid.EmptyView = EmptyView;
    Grid.Dropdown = Dropdown;
    Grid.Inset = GridInset;
    Grid.Fit = GridFit;
    Grid.ItemSize = GridItemSize;
    Grid.AspectRatio = GridAspectRatio;
    Detail = (props) => h("detail", rest(props, ["children", "actions", "metadata"]), props.metadata, props.actions);
    Detail.Metadata = Metadata;
    Form = (props) => h("form", rest(props, ["children", "actions"]), props.actions, props.children);
    Form.TextField = (props) => h("form-textfield", props);
    Form.PasswordField = (props) => h("form-password", props);
    Form.TextArea = (props) => h("form-textarea", props);
    Form.Checkbox = (props) => h("form-checkbox", props);
    Form.DatePicker = (props) => h("form-datepicker", props);
    Form.DatePicker.Type = DatePickerType;
    Form.Dropdown = (props) => h("form-dropdown", rest(props, ["children"]), props.children);
    Form.Dropdown.Item = (props) => h("dropdown-item", props);
    Form.Dropdown.Section = (props) => h("dropdown-section", rest(props, ["children"]), props.children);
    Form.TagPicker = (props) => h("form-tagpicker", rest(props, ["children"]), props.children);
    Form.TagPicker.Item = (props) => h("dropdown-item", props);
    Form.FilePicker = (props) => h("form-filepicker", props);
    Form.Separator = () => h("form-separator", {});
    Form.Description = (props) => h("form-description", props);
    Form.LinkAccessory = (props) => h("form-linkaccessory", props);
    ActionPanel = (props) => h("action-panel", rest(props, ["children"]), props.children);
    ActionPanel.Section = (props) => h("action-section", rest(props, ["children"]), props.children);
    ActionPanel.Submenu = (props) => h("action-submenu", rest(props, ["children"]), props.children);
    ActionPanel.Item = (props) => h("action", { kind: "callback", ...props });
    Action = (props) => h("action", { kind: "callback", ...props });
    Action.Style = ActionStyle;
    Action.CopyToClipboard = (props) => h("action", { kind: "copy", title: props.title || "Copy to Clipboard", icon: props.icon || Icon.Clipboard, shortcut: props.shortcut, style: props.style, onCopy: props.onCopy, payload: { content: clipboardContent(props.content), concealed: props.concealed === true } });
    Action.Paste = (props) => h("action", { kind: "paste", title: props.title || "Paste", icon: props.icon || Icon.Clipboard, shortcut: props.shortcut, style: props.style, onPaste: props.onPaste, payload: { content: clipboardContent(props.content) } });
    Action.Open = (props) => h("action", { kind: "open", title: props.title || "Open", icon: props.icon || Icon.Finder, shortcut: props.shortcut, style: props.style, onOpen: props.onOpen, payload: { target: String(props.target), app: typeof props.application === "object" && props.application ? props.application.path || props.application.name : props.application } });
    Action.OpenInBrowser = (props) => h("action", { kind: "openInBrowser", title: props.title || "Open in Browser", icon: props.icon || Icon.Globe, shortcut: props.shortcut, style: props.style, onOpen: props.onOpen, payload: { url: String(props.url) } });
    Action.OpenWith = (props) => h("action", { kind: "openWith", title: props.title || "Open With", icon: props.icon || Icon.Upload, shortcut: props.shortcut, style: props.style, onOpen: props.onOpen, payload: { path: String(props.path) } });
    Action.ShowInFinder = (props) => h("action", { kind: "showInFileManager", title: props.title || "Show in File Manager", icon: props.icon || Icon.Finder, shortcut: props.shortcut, style: props.style, onShow: props.onShow, payload: { path: String(props.path) } });
    Action.Trash = (props) => h("action", { kind: "trash", title: props.title || "Move to Trash", icon: props.icon || Icon.Trash, shortcut: props.shortcut, style: props.style || "destructive", onTrash: props.onTrash, payload: { paths: Array.isArray(props.paths) ? props.paths.map(String) : [String(props.paths)] } });
    Action.SubmitForm = (props) => h("action", { kind: "submitForm", title: props.title || "Submit Form", icon: props.icon, shortcut: props.shortcut, style: props.style, onSubmit: props.onSubmit });
    Action.ToggleQuickLook = (props) => h("action", { kind: "toggleQuickLook", title: props.title || "Quick Look", icon: props.icon || Icon.Eye, shortcut: props.shortcut });
    Action.PickDate = (props) => h("action", { kind: "pickDate", title: props.title || "Pick Date", icon: props.icon || Icon.Calendar, shortcut: props.shortcut, style: props.style, onChange: props.onChange, payload: { type: props.type || "date_time", min: props.min ? String(props.min) : void 0, max: props.max ? String(props.max) : void 0 } });
    Action.PickDate.Type = DatePickerType;
    Action.CreateSnippet = (props) => h("action", { kind: "createSnippet", title: props.title || "Create Snippet", icon: props.icon || Icon.Snippets, shortcut: props.shortcut, payload: { snippet: props.snippet || {} } });
    Action.CreateQuicklink = (props) => h("action", { kind: "createQuicklink", title: props.title || "Create Quicklink", icon: props.icon || Icon.Link, shortcut: props.shortcut, payload: { quicklink: props.quicklink || {} } });
    Action.InstallMCPServer = (props) => h("action", { kind: "callback", title: props.title || "Install MCP Server", icon: props.icon || Icon.Plug, shortcut: props.shortcut, onAction: () => getClient().notify("manager.log", { level: "warn", line: "Action.InstallMCPServer is not supported" }) });
    Action.Push = (props) => {
      const nav = useNavigation();
      return h("action", { kind: "callback", title: props.title, icon: props.icon, shortcut: props.shortcut, style: props.style, autoFocus: props.autoFocus, onAction: () => {
        nav.push(props.target);
        if (props.onPush) props.onPush();
      } });
    };
    MenuBarExtra = (props) => h("menubar", rest(props, ["children"]), props.children);
    MenuBarExtra.Item = (props) => h("menubar-item", props);
    MenuBarExtra.Submenu = (props) => h("menubar-submenu", rest(props, ["children"]), props.children);
    MenuBarExtra.Section = (props) => h("menubar-section", rest(props, ["children"]), props.children);
    MenuBarExtra.Separator = () => h("menubar-separator", {});
    ListItem = List.Item;
    ListSection = List.Section;
    FormTextField = Form.TextField;
    FormTextArea = Form.TextArea;
    FormCheckbox = Form.Checkbox;
    FormDatePicker = Form.DatePicker;
    FormDropdown = Form.Dropdown;
    FormDropdownItem = Form.Dropdown.Item;
    FormDropdownSection = Form.Dropdown.Section;
    FormTagPicker = Form.TagPicker;
    FormTagPickerItem = Form.TagPicker.Item;
    FormSeparator = Form.Separator;
    ActionPanelItem = ActionPanel.Item;
    ActionPanelSection = ActionPanel.Section;
    ActionPanelSubmenu = ActionPanel.Submenu;
    CopyToClipboardAction = Action.CopyToClipboard;
    PasteAction = Action.Paste;
    OpenAction = Action.Open;
    OpenInBrowserAction = Action.OpenInBrowser;
    OpenWithAction = Action.OpenWith;
    ShowInFinderAction = Action.ShowInFinder;
    TrashAction = Action.Trash;
    PushAction = Action.Push;
    SubmitFormAction = Action.SubmitForm;
    useActionPanel = () => ({ update: () => {
    } });
    useId2 = () => React.useId();
    render = (element) => element;
  }
});

// src/api/services.ts
function getPreferenceValues() {
  return { ...getClient().preferences };
}
function styleName(s) {
  return s === ToastStyle.Failure ? "failure" : s === ToastStyle.Animated ? "animated" : "success";
}
async function showToast(optionsOrStyle, title, message) {
  const options = typeof optionsOrStyle === "object" && optionsOrStyle !== null ? optionsOrStyle : { style: optionsOrStyle, title, message };
  const t = new Toast(options);
  await t.show();
  return t;
}
async function showHUD(title, options) {
  const client2 = getClient();
  client2.notify("ui.hud", { s: client2.sessionId, text: String(title), popToRoot: options && options.popToRootType, clearRoot: options && options.clearRootSearch === true });
}
async function confirmAlert(options) {
  const client2 = getClient();
  const res = await client2.request("ui.alert", {
    s: client2.sessionId,
    title: String(options.title || ""),
    message: options.message ? String(options.message) : "",
    icon: options.icon || null,
    primary: { title: String(options.primaryAction && options.primaryAction.title || "Confirm"), style: options.primaryAction && options.primaryAction.style === AlertActionStyle.Destructive ? "destructive" : "default" },
    dismiss: { title: String(options.dismissAction && options.dismissAction.title || "Cancel") },
    rememberKey: options.rememberUserChoice ? `${client2.env.extensionName}:${String(options.title || "")}` : null
  });
  const confirmed = !!(res && res.confirmed);
  if (confirmed && options.primaryAction && options.primaryAction.onAction) options.primaryAction.onAction();
  if (!confirmed && options.dismissAction && options.dismissAction.onAction) options.dismissAction.onAction();
  return confirmed;
}
async function closeMainWindow(options) {
  const client2 = getClient();
  client2.notify("ui.closeMainWindow", { s: client2.sessionId, popToRoot: options && options.popToRootType ? String(options.popToRootType) : "default", clearRoot: options && options.clearRootSearch === true });
}
async function popToRoot(options) {
  const client2 = getClient();
  client2.notify("ui.popToRoot", { s: client2.sessionId, clearSearchBar: !(options && options.clearSearchBar === false) });
}
async function clearSearchBar(options) {
  const client2 = getClient();
  client2.notify("ui.clearSearchBar", { s: client2.sessionId, forceScrollToTop: !(options && options.forceScrollToTop === false) });
}
function contentOf(content) {
  if (content === void 0 || content === null) return { text: "" };
  if (typeof content !== "object") return { text: String(content) };
  return { text: content.text !== void 0 ? String(content.text) : "", html: content.html ? String(content.html) : void 0, file: content.file ? String(content.file) : void 0 };
}
function store() {
  if (!localStore) localStore = new JsonStore(path2.join(getClient().env.supportPath, ".launcher", "localstorage.json"));
  return localStore;
}
function flushStorage() {
  if (localStore) localStore.flushNow();
}
function readStoredDropdown(command, id) {
  return store().get(`__dropdown:${command}:${id}`);
}
function writeStoredDropdown(command, id, value) {
  store().set(`__dropdown:${command}:${id}`, value);
}
async function open(target, application) {
  const client2 = getClient();
  await client2.request("system.open", { target: String(target), app: application ? typeof application === "object" ? application.path || application.name : String(application) : null });
}
async function getApplications(target) {
  return await getClient().request("system.getApplications", { target: target ? String(target) : null }) || [];
}
async function getDefaultApplication(target) {
  return getClient().request("system.getDefaultApplication", { target: String(target) });
}
async function getFrontmostApplication() {
  return getClient().request("system.getFrontmostApplication", {});
}
async function showInFinder(p) {
  await getClient().request("system.showInFileBrowser", { path: String(p) });
}
async function trash(p) {
  await getClient().request("system.trash", { paths: Array.isArray(p) ? p.map(String) : [String(p)] });
}
async function getSelectedText() {
  const r = await getClient().request("ui.getSelectedText", {});
  if (!r || !r.text) throw new Error("Unable to get selected text");
  return String(r.text);
}
async function getSelectedFinderItems() {
  return [];
}
function captureException(e) {
  getClient().log("captureException: " + (e && e.stack || e));
}
function captureMemorySnapshot() {
}
async function openExtensionPreferences() {
  getClient().notify("ui.openPreferences", { s: getClient().sessionId, scope: "extension" });
}
async function openCommandPreferences() {
  getClient().notify("ui.openPreferences", { s: getClient().sessionId, scope: "command" });
}
async function launchCommand(options) {
  const client2 = getClient();
  await client2.request("command.launch", { s: client2.sessionId, name: String(options.name), type: options.type || LaunchType.UserInitiated, extensionName: options.extensionName || null, ownerOrAuthorName: options.ownerOrAuthorName || null, arguments: options.arguments || null, context: options.context || null, fallbackText: options.fallbackText || null });
}
async function updateCommandMetadata(metadata2) {
  const client2 = getClient();
  client2.notify("command.updateMetadata", { s: client2.sessionId, subtitle: metadata2 && metadata2.subtitle !== void 0 ? metadata2.subtitle : null });
}
var fs2, path2, import_node_events, environment, preferences, Toast, toastActions, Alert, Clipboard, copyTextToClipboard, pasteText, clearClipboard, JsonStore, localStore, LocalStorage, getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem, allLocalStorageItems, clearLocalStorage, Cache, randomId, specialKeys, AI, aiStreams, unstable_AI, useUnstableAI, WindowManagement, BrowserExtension, OAuth, Tool;
var init_services = __esm({
  "src/api/services.ts"() {
    fs2 = __toESM(require("node:fs"));
    path2 = __toESM(require("node:path"));
    import_node_events = require("node:events");
    init_client();
    init_enums();
    environment = {
      get raycastVersion() {
        return "1.100.0";
      },
      get ownerOrAuthorName() {
        return getClient().env.ownerOrAuthorName;
      },
      get extensionName() {
        return getClient().env.extensionName;
      },
      get commandName() {
        return getClient().env.commandName;
      },
      get commandMode() {
        return getClient().env.commandMode;
      },
      get entryPointType() {
        return "command";
      },
      get entryPointName() {
        return getClient().env.commandName;
      },
      get entryPointMode() {
        return getClient().env.commandMode;
      },
      get assetsPath() {
        return getClient().env.assetsPath;
      },
      get supportPath() {
        return getClient().env.supportPath;
      },
      get isDevelopment() {
        return getClient().env.isDevelopment;
      },
      get appearance() {
        return getClient().env.appearance;
      },
      get theme() {
        return getClient().env.appearance;
      },
      get textSize() {
        return getClient().env.textSize;
      },
      get launchType() {
        return getClient().env.launchType;
      },
      get launchContext() {
        return getClient().env.launchContext;
      },
      canAccess(api) {
        const caps = getClient().env.capabilities || {};
        if (api === AI) return caps.ai === true;
        if (api === WindowManagement) return caps.windowManagement !== false;
        if (api === BrowserExtension) return false;
        return true;
      }
    };
    preferences = new Proxy({}, { get: (_t, k) => getClient().preferences[k] });
    Toast = class {
      _style;
      _title;
      _message;
      _primaryAction;
      _secondaryAction;
      id = "t" + Math.random().toString(36).slice(2);
      shown = false;
      constructor(options) {
        this._style = options.style || ToastStyle.Success;
        this._title = String(options.title || "");
        this._message = options.message;
        this._primaryAction = options.primaryAction;
        this._secondaryAction = options.secondaryAction;
      }
      get style() {
        return this._style;
      }
      set style(v) {
        this._style = v;
        this.sync();
      }
      get title() {
        return this._title;
      }
      set title(v) {
        this._title = v;
        this.sync();
      }
      get message() {
        return this._message;
      }
      set message(v) {
        this._message = v;
        this.sync();
      }
      get primaryAction() {
        return this._primaryAction;
      }
      set primaryAction(v) {
        this._primaryAction = v;
        this.sync();
      }
      get secondaryAction() {
        return this._secondaryAction;
      }
      set secondaryAction(v) {
        this._secondaryAction = v;
        this.sync();
      }
      payload() {
        const client2 = getClient();
        const act = (a, key) => a ? { title: String(a.title || ""), shortcut: a.shortcut || null, id: `${this.id}:${key}` } : null;
        return { id: this.id, style: styleName(this._style), title: this._title, message: this._message === void 0 ? "" : String(this._message), primaryAction: act(this._primaryAction, "primary"), secondaryAction: act(this._secondaryAction, "secondary") };
      }
      sync() {
        if (this.shown) getClient().notify("ui.toast.update", { s: getClient().sessionId, ...this.payload() });
      }
      async show() {
        this.shown = true;
        toastActions.set(`${this.id}:primary`, () => this._primaryAction && this._primaryAction.onAction && this._primaryAction.onAction(this));
        toastActions.set(`${this.id}:secondary`, () => this._secondaryAction && this._secondaryAction.onAction && this._secondaryAction.onAction(this));
        getClient().notify("ui.toast.show", { s: getClient().sessionId, ...this.payload() });
      }
      async hide() {
        this.shown = false;
        toastActions.delete(`${this.id}:primary`);
        toastActions.delete(`${this.id}:secondary`);
        getClient().notify("ui.toast.hide", { s: getClient().sessionId, id: this.id });
      }
      static Style = ToastStyle;
    };
    toastActions = /* @__PURE__ */ new Map();
    Alert = { ActionStyle: AlertActionStyle };
    Clipboard = {
      async copy(content, options) {
        const client2 = getClient();
        await client2.request("clipboard.copy", { content: contentOf(content), concealed: !!(options && options.concealed) });
      },
      async paste(content) {
        const client2 = getClient();
        await client2.request("clipboard.paste", { content: contentOf(content) });
      },
      async clear() {
        await getClient().request("clipboard.clear", {});
      },
      async read(options) {
        const r = await getClient().request("clipboard.read", { offset: options && options.offset ? Number(options.offset) : 0 });
        return { text: String(r && r.text || ""), file: r && r.file ? String(r.file) : void 0, html: r && r.html ? String(r.html) : void 0 };
      },
      async readText(options) {
        const r = await Clipboard.read(options);
        return r.text || void 0;
      }
    };
    copyTextToClipboard = (text) => Clipboard.copy(text);
    pasteText = (text) => Clipboard.paste(text);
    clearClipboard = () => Clipboard.clear();
    JsonStore = class {
      constructor(file) {
        this.file = file;
      }
      file;
      data = null;
      timer = null;
      load() {
        if (this.data) return this.data;
        try {
          this.data = JSON.parse(fs2.readFileSync(this.file, "utf8"));
        } catch {
          this.data = {};
        }
        if (!this.data || typeof this.data !== "object") this.data = {};
        return this.data;
      }
      flush() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          try {
            fs2.mkdirSync(path2.dirname(this.file), { recursive: true });
            fs2.writeFileSync(this.file, JSON.stringify(this.data));
          } catch (e) {
            getClient().log("storage write failed: " + e);
          }
        }, 50);
      }
      get(k) {
        return this.load()[k];
      }
      set(k, v) {
        this.load()[k] = v;
        this.flush();
      }
      remove(k) {
        delete this.load()[k];
        this.flush();
      }
      all() {
        return { ...this.load() };
      }
      clear() {
        this.data = {};
        this.flush();
      }
      flushNow() {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
          try {
            fs2.mkdirSync(path2.dirname(this.file), { recursive: true });
            fs2.writeFileSync(this.file, JSON.stringify(this.data || {}));
          } catch {
          }
        }
      }
    };
    localStore = null;
    LocalStorage = {
      async getItem(key) {
        return store().get(String(key));
      },
      async setItem(key, value) {
        store().set(String(key), value);
      },
      async removeItem(key) {
        store().remove(String(key));
      },
      async allItems() {
        return store().all();
      },
      async clear() {
        store().clear();
      }
    };
    getLocalStorageItem = LocalStorage.getItem;
    setLocalStorageItem = LocalStorage.setItem;
    removeLocalStorageItem = LocalStorage.removeItem;
    allLocalStorageItems = LocalStorage.allItems;
    clearLocalStorage = LocalStorage.clear;
    Cache = class {
      dir;
      subscribers = /* @__PURE__ */ new Set();
      capacity;
      constructor(options) {
        const ns = options && options.namespace ? String(options.namespace).replace(/[^A-Za-z0-9._-]/g, "_") : "default";
        this.capacity = options && options.capacity ? Number(options.capacity) : 10 * 1024 * 1024;
        this.dir = path2.join(getClient().env.supportPath, ".launcher", "cache", ns);
        try {
          fs2.mkdirSync(this.dir, { recursive: true });
        } catch {
        }
      }
      fileFor(key) {
        return path2.join(this.dir, Buffer.from(String(key)).toString("base64url"));
      }
      get(key) {
        try {
          return fs2.readFileSync(this.fileFor(key), "utf8");
        } catch {
          return void 0;
        }
      }
      has(key) {
        return fs2.existsSync(this.fileFor(key));
      }
      get isEmpty() {
        try {
          return fs2.readdirSync(this.dir).length === 0;
        } catch {
          return true;
        }
      }
      set(key, data) {
        try {
          fs2.writeFileSync(this.fileFor(key), String(data));
        } catch (e) {
          getClient().log("cache write failed: " + e);
        }
        this.evict();
        for (const s of this.subscribers) s(key, data);
      }
      remove(key) {
        let removed = false;
        try {
          fs2.unlinkSync(this.fileFor(key));
          removed = true;
        } catch {
        }
        for (const s of this.subscribers) s(key, void 0);
        return removed;
      }
      clear(options) {
        try {
          for (const f of fs2.readdirSync(this.dir)) fs2.unlinkSync(path2.join(this.dir, f));
        } catch {
        }
        if (!(options && options.notifySubscribers === false)) for (const s of this.subscribers) s(void 0, void 0);
      }
      subscribe(fn) {
        this.subscribers.add(fn);
        return () => {
          this.subscribers.delete(fn);
        };
      }
      evict() {
        try {
          const entries = fs2.readdirSync(this.dir).map((f) => {
            const st = fs2.statSync(path2.join(this.dir, f));
            return { f, size: st.size, atime: st.atimeMs };
          });
          let total = entries.reduce((a, e) => a + e.size, 0);
          if (total <= this.capacity) return;
          entries.sort((a, b) => a.atime - b.atime);
          for (const e of entries) {
            if (total <= this.capacity) break;
            try {
              fs2.unlinkSync(path2.join(this.dir, e.f));
              total -= e.size;
            } catch {
            }
          }
        } catch {
        }
      }
    };
    randomId = () => Math.random().toString(36).slice(2);
    specialKeys = [];
    AI = {
      Model: new Proxy({}, { get: (_t, k) => String(k) }),
      Creativity: { None: "none", Low: "low", Medium: "medium", High: "high", Maximum: "maximum" },
      ask(prompt, options) {
        const client2 = getClient();
        const emitter = new import_node_events.EventEmitter();
        const id = "ai" + Math.random().toString(36).slice(2);
        const stream2 = new Promise((resolve2, reject) => {
          aiStreams.set(id, { emitter, resolve: resolve2, reject, text: "" });
          client2.request("ai.ask", { s: client2.sessionId, id, prompt: String(prompt), model: options && options.model ? String(options.model) : null, creativity: options && options.creativity !== void 0 ? options.creativity : null }, 3e5).then((r) => {
            const st = aiStreams.get(id);
            if (st) {
              aiStreams.delete(id);
              resolve2(String(r && r.text !== void 0 ? r.text : st.text));
            }
          }, (e) => {
            aiStreams.delete(id);
            reject(e);
          });
        });
        if (options && options.signal) options.signal.addEventListener("abort", () => client2.notify("ai.abort", { s: client2.sessionId, id }));
        return Object.assign(stream2, { on: emitter.on.bind(emitter), once: emitter.once.bind(emitter), off: emitter.off.bind(emitter), emit: emitter.emit.bind(emitter), addListener: emitter.addListener.bind(emitter), removeListener: emitter.removeListener.bind(emitter) });
      }
    };
    aiStreams = /* @__PURE__ */ new Map();
    unstable_AI = AI;
    useUnstableAI = () => unsupported("useUnstableAI");
    WindowManagement = {
      DesktopType: { User: "user", FullScreen: "fullscreen" },
      async getActiveWindow() {
        return getClient().request("wm.getActiveWindow", {});
      },
      async getWindowsOnActiveDesktop() {
        return await getClient().request("wm.getWindows", {}) || [];
      },
      async getDesktops() {
        return await getClient().request("wm.getDesktops", {}) || [];
      },
      async setWindowBounds(options) {
        await getClient().request("wm.setWindowBounds", options);
      }
    };
    BrowserExtension = {
      async getContent() {
        unsupported("BrowserExtension.getContent");
      },
      async getTabs() {
        unsupported("BrowserExtension.getTabs");
      }
    };
    OAuth = {
      RedirectMethod: { Web: "web", App: "app", AppURI: "appURI", ClientIdMetadataDocument: "cimd" },
      PKCEClient: class PKCEClient {
        redirectMethod;
        providerName;
        providerIcon;
        providerId;
        description;
        codeVerifier = "";
        tokenFile;
        constructor(options) {
          this.redirectMethod = options.redirectMethod;
          this.providerName = String(options.providerName || "");
          this.providerIcon = options.providerIcon;
          this.providerId = String(options.providerId || this.providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
          this.description = String(options.description || "");
          this.tokenFile = path2.join(getClient().env.supportPath, ".launcher", "oauth", this.providerId + ".json");
        }
        get redirectURL() {
          if (this.redirectMethod === "app") return "raycast://oauth?package_name=Extension";
          if (this.redirectMethod === "appURI") return "com.raycast:/oauth?package_name=Extension";
          return "https://raycast.com/redirect?packageName=Extension";
        }
        async authorizationRequest(options) {
          const crypto = require("node:crypto");
          this.codeVerifier = crypto.randomBytes(48).toString("base64url");
          const codeChallenge = crypto.createHash("sha256").update(this.codeVerifier).digest("base64url");
          const state = crypto.randomBytes(16).toString("hex");
          const url = new URL(options.endpoint);
          url.searchParams.set("response_type", "code");
          url.searchParams.set("client_id", options.clientId);
          url.searchParams.set("redirect_uri", this.redirectURL);
          url.searchParams.set("state", state);
          url.searchParams.set("code_challenge", codeChallenge);
          url.searchParams.set("code_challenge_method", "S256");
          if (options.scope) url.searchParams.set("scope", options.scope);
          for (const k of Object.keys(options.extraParameters || {})) url.searchParams.set(k, options.extraParameters[k]);
          return { codeChallenge, codeVerifier: this.codeVerifier, state, redirectURI: this.redirectURL, toURL: () => url.toString() };
        }
        async authorize(request) {
          const client2 = getClient();
          const res = await client2.request("oauth.authorize", { s: client2.sessionId, url: request.toURL ? request.toURL() : String(request.url), state: request.state, providerName: this.providerName, providerIcon: this.providerIcon || null, description: this.description }, 5 * 60 * 1e3);
          if (!res || !res.code) throw new Error("Authorization was cancelled");
          return { authorizationCode: String(res.code) };
        }
        async getTokens() {
          try {
            const data = JSON.parse(fs2.readFileSync(this.tokenFile, "utf8"));
            return { ...data, isExpired: () => data.expiresIn ? Date.now() > (data.updatedAt || 0) + Number(data.expiresIn) * 1e3 - 1e4 : false };
          } catch {
            return void 0;
          }
        }
        async setTokens(tokens) {
          const data = { accessToken: tokens.accessToken || tokens.access_token, refreshToken: tokens.refreshToken || tokens.refresh_token, idToken: tokens.idToken || tokens.id_token, expiresIn: tokens.expiresIn || tokens.expires_in, scope: tokens.scope, updatedAt: Date.now() };
          fs2.mkdirSync(path2.dirname(this.tokenFile), { recursive: true });
          fs2.writeFileSync(this.tokenFile, JSON.stringify(data), { mode: 384 });
        }
        async removeTokens() {
          try {
            fs2.unlinkSync(this.tokenFile);
          } catch {
          }
        }
      }
    };
    Tool = {};
  }
});

// src/api/index.ts
var api_exports = {};
__export(api_exports, {
  AI: () => AI,
  Action: () => Action,
  ActionPanel: () => ActionPanel,
  ActionPanelItem: () => ActionPanelItem,
  ActionPanelSection: () => ActionPanelSection,
  ActionPanelSubmenu: () => ActionPanelSubmenu,
  Alert: () => Alert,
  AlertActionStyle: () => AlertActionStyle,
  BrowserExtension: () => BrowserExtension,
  Cache: () => Cache,
  Clipboard: () => Clipboard,
  Color: () => Color,
  CopyToClipboardAction: () => CopyToClipboardAction,
  Detail: () => Detail,
  Form: () => Form,
  FormCheckbox: () => FormCheckbox,
  FormDatePicker: () => FormDatePicker,
  FormDropdown: () => FormDropdown,
  FormDropdownItem: () => FormDropdownItem,
  FormDropdownSection: () => FormDropdownSection,
  FormSeparator: () => FormSeparator,
  FormTagPicker: () => FormTagPicker,
  FormTagPickerItem: () => FormTagPickerItem,
  FormTextArea: () => FormTextArea,
  FormTextField: () => FormTextField,
  Grid: () => Grid,
  Icon: () => Icon,
  Image: () => Image,
  ImageMask: () => ImageMask,
  Keyboard: () => Keyboard,
  LaunchType: () => LaunchType,
  List: () => List,
  ListItem: () => ListItem,
  ListSection: () => ListSection,
  LocalStorage: () => LocalStorage,
  MenuBarExtra: () => MenuBarExtra,
  NavigationContext: () => NavigationContext,
  OAuth: () => OAuth,
  OpenAction: () => OpenAction,
  OpenInBrowserAction: () => OpenInBrowserAction,
  OpenWithAction: () => OpenWithAction,
  PasteAction: () => PasteAction,
  PopToRootType: () => PopToRootType,
  PushAction: () => PushAction,
  ShowInFinderAction: () => ShowInFinderAction,
  SubmitFormAction: () => SubmitFormAction,
  Toast: () => Toast,
  ToastStyle: () => ToastStyle,
  Tool: () => Tool,
  TrashAction: () => TrashAction,
  WindowManagement: () => WindowManagement,
  aiStreams: () => aiStreams,
  allLocalStorageItems: () => allLocalStorageItems,
  captureException: () => captureException,
  captureMemorySnapshot: () => captureMemorySnapshot,
  clearClipboard: () => clearClipboard,
  clearLocalStorage: () => clearLocalStorage,
  clearSearchBar: () => clearSearchBar,
  closeMainWindow: () => closeMainWindow,
  confirmAlert: () => confirmAlert,
  copyTextToClipboard: () => copyTextToClipboard,
  environment: () => environment,
  flushStorage: () => flushStorage,
  getApplications: () => getApplications,
  getDefaultApplication: () => getDefaultApplication,
  getFrontmostApplication: () => getFrontmostApplication,
  getLocalStorageItem: () => getLocalStorageItem,
  getPreferenceValues: () => getPreferenceValues,
  getSelectedFinderItems: () => getSelectedFinderItems,
  getSelectedText: () => getSelectedText,
  launchCommand: () => launchCommand,
  open: () => open,
  openCommandPreferences: () => openCommandPreferences,
  openExtensionPreferences: () => openExtensionPreferences,
  pasteText: () => pasteText,
  popToRoot: () => popToRoot,
  preferences: () => preferences,
  randomId: () => randomId,
  readStoredDropdown: () => readStoredDropdown,
  removeLocalStorageItem: () => removeLocalStorageItem,
  render: () => render,
  setLocalStorageItem: () => setLocalStorageItem,
  showHUD: () => showHUD,
  showInFinder: () => showInFinder,
  showToast: () => showToast,
  specialKeys: () => specialKeys,
  toastActions: () => toastActions,
  trash: () => trash,
  unstable_AI: () => unstable_AI,
  updateCommandMetadata: () => updateCommandMetadata,
  useActionPanel: () => useActionPanel,
  useId: () => useId2,
  useNavigation: () => useNavigation,
  useUnstableAI: () => useUnstableAI,
  writeStoredDropdown: () => writeStoredDropdown
});
var init_api = __esm({
  "src/api/index.ts"() {
    init_components();
    init_services();
    init_enums();
    init_components();
  }
});

// src/worker.tsx
var worker_exports = {};
__export(worker_exports, {
  runWorker: () => runWorker
});
function runWorker(data) {
  const load = data.load;
  const sid = load.s;
  const port = import_node_worker_threads.parentPort;
  const pending = /* @__PURE__ */ new Map();
  const handlers = /* @__PURE__ */ new Map();
  let nextId = 0;
  const post = (msg) => port.postMessage({ type: "rpc", msg });
  const log = (line) => port.postMessage({ type: "log", line });
  const client2 = {
    sessionId: sid,
    request(method, params) {
      const id = `${sid}:${++nextId}`;
      return new Promise((resolve2, reject) => {
        pending.set(id, { resolve: resolve2, reject });
        post({ jsonrpc: "2.0", id, method, params: { s: sid, ...params || {} } });
      });
    },
    notify(method, params) {
      post({ jsonrpc: "2.0", method, params: { s: sid, ...params || {} } });
    },
    on(method, handler) {
      handlers.set(method, handler);
    },
    env: {
      appearance: load.env.appearance,
      textSize: load.env.textSize,
      isDevelopment: load.env.isDevelopment,
      extensionName: load.extensionId.split("/").pop() || load.extensionId,
      ownerOrAuthorName: load.extensionId.split("/")[0] || "",
      commandName: load.command.name,
      commandMode: load.command.mode,
      assetsPath: load.paths.assets,
      supportPath: load.paths.support,
      launchType: load.launchType,
      launchContext: load.launchContext,
      capabilities: Object.assign({}, data.host && data.host.capabilities || {}, { ai: !!(data.host && data.host.capabilities && data.host.capabilities.ai) })
    },
    preferences: load.preferences || {},
    navigation: null,
    log
  };
  setClient(client2);
  try {
    fs3.mkdirSync(load.paths.support, { recursive: true });
  } catch {
  }
  port.on("message", (m) => {
    if (!m || typeof m !== "object") return;
    if (m.type === "rpc") {
      const msg = m.msg;
      if (msg.method) {
        const h2 = handlers.get(msg.method);
        if (h2) {
          try {
            h2(msg.params || {});
          } catch (e) {
            log(`handler ${msg.method} threw: ${e && e.stack || e}`);
          }
        } else log("unhandled: " + msg.method);
        return;
      }
      if (msg.id !== void 0) {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message || "rpc error"), msg.error));
        else p.resolve(msg.result);
      }
      return;
    }
    if (m.type === "unload") {
      teardown();
    }
  });
  const api = (init_api(), __toCommonJS(api_exports));
  patchRequire(api);
  const callbacks = new Callbacks();
  const lastSent = /* @__PURE__ */ new Map();
  const lastViews = /* @__PURE__ */ new Map();
  let flushScheduled = false;
  let rev = 0;
  const renderer = createRenderer(callbacks, () => {
    if (flushScheduled) return;
    flushScheduled = true;
    setImmediate(flush);
  });
  function flush() {
    flushScheduled = false;
    const slots = renderer.container.c.filter((c) => c.t === "view");
    const views = [];
    for (const slot of slots) {
      const viewId = String(slot.p.id);
      const root = serializeView(slot, { assetsPath: load.paths.assets, appearance: load.env.appearance, viewId });
      const encoded = JSON.stringify(root);
      lastViews.set(viewId, root);
      if (lastSent.get(viewId) === encoded) continue;
      lastSent.set(viewId, encoded);
      views.push({ view: viewId, root });
    }
    for (const id of Array.from(lastSent.keys())) if (!slots.find((s) => String(s.p.id) === id)) {
      lastSent.delete(id);
      lastViews.delete(id);
    }
    callbacks.tick();
    if (views.length) client2.notify("ui.render", { rev: ++rev, views });
    for (const v of views) initDropdown(String(v.view), v.root);
  }
  const dropdownInitialised = /* @__PURE__ */ new Set();
  function initDropdown(viewId, root) {
    const acc = root && root.searchBarAccessory;
    if (!acc) return;
    const key = viewId + ":" + acc.id;
    if (dropdownInitialised.has(key)) return;
    dropdownInitialised.add(key);
    let value = acc.value !== void 0 ? acc.value : acc.defaultValue;
    if (acc.storeValue) {
      const stored = api.readStoredDropdown(load.command.name, acc.id);
      if (stored !== void 0) value = stored;
    }
    if (value === void 0 || value === null) {
      const first = acc.sections && acc.sections[0] && acc.sections[0].items[0];
      value = first ? first.value : void 0;
    }
    if (value !== void 0) {
      client2.notify("ui.dropdownValue", { view: viewId, dropdown: acc.id, value: String(value) });
      if (acc.handlers && acc.handlers.change) setImmediate(() => callbacks.invoke(acc.handlers.change, [String(value)]));
    }
  }
  renderer.onError((kind, error) => {
    log(`react ${kind} error: ${error && error.stack || error}`);
    if (kind === "uncaught") client2.notify("manager.crash", { reason: String(error && error.message || error), stack: String(error && error.stack || "") });
  });
  const rootViewId = "v0";
  let setViewsRef = null;
  function NavigationProvider(props) {
    const [views, setViews] = React2.useState([{ id: rootViewId, element: props.root }]);
    setViewsRef = setViews;
    const value = React2.useMemo(() => ({
      push: async (element) => {
        const res = await client2.request("ui.pushView", {});
        const id = String(res && res.view || "v" + Date.now());
        setViews((v) => v.concat([{ id, element }]));
      },
      pop: async () => {
        setViews((v) => v.length > 1 ? v.slice(0, -1) : v);
        await client2.request("ui.popView", {});
      }
    }), []);
    client2.navigation = value;
    return React2.createElement(
      api.NavigationContext.Provider,
      { value },
      views.map((v) => React2.createElement("view", { key: v.id, id: v.id }, v.element))
    );
  }
  class ErrorBoundary extends React2.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    componentDidCatch(error) {
      log("render error: " + (error && error.stack || error));
    }
    render() {
      if (this.state.error) {
        const e = this.state.error;
        return React2.createElement(api.Detail, { navigationTitle: "Error", markdown: "# The extension crashed\n\n```\n" + String(e && e.stack || e).slice(0, 4e3) + "\n```" });
      }
      return this.props.children;
    }
  }
  handlers.set("ui.callback", (p) => {
    try {
      const r = callbacks.invoke(String(p.h), Array.isArray(p.args) ? p.args : []);
      if (r && typeof r.then === "function") r.catch((e) => log("callback rejected: " + (e && e.stack || e)));
    } catch (e) {
      log("callback threw: " + (e && e.stack || e));
    }
  });
  handlers.set("ui.searchText", (p) => {
    const v = lastViews.get(String(p.view));
    const h2 = v && v.handlers && v.handlers.searchText;
    if (h2) callbacks.invoke(h2, [String(p.text)]);
  });
  handlers.set("ui.selection", (p) => {
    const v = lastViews.get(String(p.view));
    const h2 = v && v.handlers && v.handlers.selection;
    if (h2) callbacks.invoke(h2, [p.itemId === null || p.itemId === void 0 ? null : String(p.itemId)]);
  });
  handlers.set("ui.loadMore", (p) => {
    const v = lastViews.get(String(p.view));
    const h2 = v && v.handlers && v.handlers.loadMore;
    if (h2) callbacks.invoke(h2, []);
  });
  handlers.set("ui.dropdown", (p) => {
    const v = lastViews.get(String(p.view));
    const acc = v && v.searchBarAccessory;
    if (acc && acc.storeValue) api.writeStoredDropdown(load.command.name, acc.id, String(p.value));
    if (acc && acc.handlers && acc.handlers.change) callbacks.invoke(acc.handlers.change, [String(p.value)]);
  });
  handlers.set("ui.dropdownSearch", (p) => {
    const v = lastViews.get(String(p.view));
    const acc = v && v.searchBarAccessory;
    if (acc && acc.handlers && acc.handlers.searchText) callbacks.invoke(acc.handlers.searchText, [String(p.text)]);
  });
  handlers.set("ui.formValue", (p) => {
    const v = lastViews.get(String(p.view));
    const f = v && v.fields ? v.fields.find((x) => x.id === String(p.field)) : null;
    if (f && f.handlers && f.handlers.change) callbacks.invoke(f.handlers.change, [coerceFormValue(f, p.value)]);
  });
  handlers.set("ui.formEvent", (p) => {
    const v = lastViews.get(String(p.view));
    const f = v && v.fields ? v.fields.find((x) => x.id === String(p.field)) : null;
    const h2 = f && f.handlers ? p.type === "focus" ? f.handlers.focus : f.handlers.blur : null;
    if (h2) callbacks.invoke(h2, [{ target: { id: f.id, value: coerceFormValue(f, p.value) }, type: p.type }]);
  });
  handlers.set("ui.formSubmit", (p) => {
    const v = lastViews.get(String(p.view));
    const values = {};
    const raw = p.values || {};
    for (const k of Object.keys(raw)) {
      const f = v && v.fields ? v.fields.find((x) => x.id === k) : null;
      values[k] = f ? coerceFormValue(f, raw[k]) : raw[k];
    }
    callbacks.invoke(String(p.h), [values]);
  });
  handlers.set("ui.viewPopped", (p) => {
    if (setViewsRef) setViewsRef((v) => v.filter((x) => x.id !== String(p.view)));
  });
  handlers.set("ui.toastAction", (p) => {
    const fn = api.toastActions.get(String(p.id));
    if (fn) fn();
  });
  handlers.set("ai.chunk", (p) => {
    const st = api.aiStreams.get(String(p.id));
    if (st) {
      st.text += String(p.text);
      st.emitter.emit("data", String(p.text));
    }
  });
  handlers.set("oauth.callback", () => {
  });
  handlers.set("ui.closed", () => {
  });
  function coerceFormValue(field, value) {
    if (field.field === "date") return value ? new Date(String(value)) : null;
    if (field.field === "checkbox") return value === true;
    if (field.field === "tags" || field.field === "file") return Array.isArray(value) ? value : value ? [value] : [];
    return value === void 0 || value === null ? "" : value;
  }
  let mod;
  try {
    mod = require(load.entrypoint);
  } catch (e) {
    log("failed to load " + load.entrypoint + ": " + (e && e.stack || e));
    port.postMessage({ type: "ready" });
    client2.notify("manager.crash", { reason: "Failed to load the extension: " + String(e && e.message || e), stack: String(e && e.stack || "") });
    return;
  }
  let command = mod && (mod.default !== void 0 ? mod.default : mod);
  if (command && typeof command === "object" && command.default) command = command.default;
  const launchProps = { arguments: load.arguments || {}, launchType: load.launchType, launchContext: load.launchContext, fallbackText: load.fallbackText, draftValues: void 0 };
  port.postMessage({ type: "ready" });
  if (load.command.mode === "no-view" || typeof command === "function" && !isComponent(command)) {
    Promise.resolve().then(() => command(launchProps)).then(
      () => {
        api.flushStorage();
        setTimeout(() => port.postMessage({ type: "ended", reason: "finished" }), 1500);
      },
      (e) => {
        log("no-view command failed: " + (e && e.stack || e));
        client2.notify("manager.crash", { reason: String(e && e.message || e), stack: String(e && e.stack || "") });
      }
    );
    return;
  }
  renderer.render(React2.createElement(ErrorBoundary, null, React2.createElement(NavigationProvider, { root: React2.createElement(command, launchProps) })));
  function teardown() {
    try {
      renderer.unmount();
    } catch {
    }
    api.flushStorage();
  }
  function isComponent(fn) {
    return !(fn.constructor && fn.constructor.name === "AsyncFunction");
  }
}
var import_node_worker_threads, fs3, React2;
var init_worker = __esm({
  "src/worker.tsx"() {
    import_node_worker_threads = require("node:worker_threads");
    fs3 = __toESM(require("node:fs"));
    React2 = __toESM(require_react());
    init_client();
    init_patch_require();
    init_callbacks();
    init_reconciler();
    init_viewmodel();
  }
});

// src/index.ts
var import_node_worker_threads2 = require("node:worker_threads");

// src/transport.ts
var Transport = class {
  constructor(input, output, idPrefix = "") {
    this.input = input;
    this.output = output;
    this.idPrefix = idPrefix;
    input.setEncoding("utf8");
    input.on("data", (chunk) => this.feed(chunk));
    input.on("end", () => this.rejectAll("transport closed"));
  }
  input;
  output;
  idPrefix;
  buffer = "";
  nextId = 2;
  // host uses odd ids, we use even
  pending = /* @__PURE__ */ new Map();
  onNotification = () => {
  };
  onRequest = () => {
    throw new Error("unhandled");
  };
  feed(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        this.log("bad frame: " + line.slice(0, 200));
        continue;
      }
      this.dispatch(msg);
    }
  }
  dispatch(msg) {
    if (typeof msg.method === "string") {
      if (msg.id === void 0) {
        try {
          this.onNotification(msg.method, msg.params);
        } catch (e) {
          this.log("notification handler threw: " + String(e));
        }
        return;
      }
      Promise.resolve().then(() => this.onRequest(msg.method, msg.params, msg.id)).then(
        (result) => this.write({ jsonrpc: "2.0", id: msg.id, result: result === void 0 ? null : result }),
        (err) => this.write({ jsonrpc: "2.0", id: msg.id, error: { code: -32e3, message: String(err && err.message || err), data: err && err.stack ? String(err.stack).slice(0, 2e3) : void 0 } })
      );
      return;
    }
    if (msg.id !== void 0) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message || "rpc error"), { code: msg.error.code, data: msg.error.data }));
      else p.resolve(msg.result);
    }
  }
  write(msg) {
    this.output.write(JSON.stringify(msg) + "\n");
  }
  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }
  request(method, params, timeoutMs = 3e4) {
    const id = this.idPrefix ? `${this.idPrefix}${this.nextId += 2}` : this.nextId += 2;
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (v) => {
        clearTimeout(timer);
        resolve2(v);
      }, reject: (e) => {
        clearTimeout(timer);
        reject(e);
      } });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }
  rejectAll(reason) {
    for (const [, p] of this.pending) p.reject(new Error(reason));
    this.pending.clear();
  }
  log(line) {
    process.stderr.write("[ext-host] " + line + "\n");
  }
};

// src/protocol.ts
var PROTOCOL_VERSION = 1;

// src/ai/provider.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var CONFIG_PATH = import_node_path.default.join(import_node_os.default.homedir(), ".config", "omarchy-launcher", "ai.json");
var DEFAULT_MODELS = { anthropic: "claude-sonnet-5", openai: "gpt-4o-mini", ollama: "llama3.2" };
function loadConfig() {
  try {
    const d = JSON.parse(import_node_fs.default.readFileSync(CONFIG_PATH, "utf8"));
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}
function configuredProviders(cfg = loadConfig()) {
  const out = [];
  const p = cfg.providers || {};
  if (p.anthropic && p.anthropic.apiKey) out.push("anthropic");
  if (p.openai && p.openai.apiKey) out.push("openai");
  if (p.ollama) out.push("ollama");
  return out;
}
function isConfigured() {
  return configuredProviders().length > 0;
}
function temperature(creativity) {
  if (creativity === void 0 || creativity === null) return void 0;
  if (typeof creativity === "number") return Math.max(0, Math.min(2, creativity));
  return { none: 0, low: 0.3, medium: 0.7, high: 1, maximum: 1.2 }[String(creativity)] ?? void 0;
}
function resolve(requested, cfg = loadConfig()) {
  const providers = cfg.providers || {};
  const available = configuredProviders(cfg);
  if (!available.length) return null;
  let provider = cfg.default && available.indexOf(cfg.default) >= 0 ? cfg.default : available[0];
  let model = "";
  const req = String(requested || "");
  const colon = req.indexOf(":");
  if (colon > 0 && available.indexOf(req.slice(0, colon)) >= 0) {
    provider = req.slice(0, colon);
    model = req.slice(colon + 1);
  } else if (req) {
    const map = cfg.modelMap || {};
    for (const prefix of Object.keys(map)) {
      if (prefix !== "*" && req.startsWith(prefix) && available.indexOf(map[prefix]) >= 0) {
        provider = map[prefix];
        break;
      }
    }
    if (!Object.keys(map).length) {
      if (/^Anthropic_/i.test(req) && available.indexOf("anthropic") >= 0) provider = "anthropic";
      else if (/^OpenAI_/i.test(req) && available.indexOf("openai") >= 0) provider = "openai";
    }
  }
  const config = providers[provider] || {};
  return { provider, model: model || config.model || DEFAULT_MODELS[provider], config };
}
async function* stream(messages, options = {}) {
  const r = resolve(options.model);
  if (!r) throw new Error("No AI provider is configured. Add one to ~/.config/omarchy-launcher/ai.json");
  const temp = temperature(options.creativity);
  if (r.provider === "anthropic") yield* anthropic(messages, r.model, r.config, temp, options);
  else if (r.provider === "ollama") yield* ollama(messages, r.model, r.config, temp, options);
  else yield* openai(messages, r.model, r.config, temp, options);
}
async function* sse(res) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message", data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trim();
      }
      if (data) yield { event, data };
    }
  }
}
async function* anthropic(messages, model, cfg, temp, options) {
  const system = [options.system || "", ...messages.filter((m) => m.role === "system").map((m) => m.content)].filter(Boolean).join("\n\n");
  const body = { model, max_tokens: cfg.maxTokens || 2048, stream: true, messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })) };
  if (system) body.system = system;
  if (temp !== void 0) body.temperature = Math.min(1, temp);
  const res = await fetch((cfg.baseUrl || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    signal: options.signal,
    headers: { "content-type": "application/json", "x-api-key": String(cfg.apiKey), "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  for await (const ev of sse(res)) {
    if (ev.event === "content_block_delta") {
      try {
        const d = JSON.parse(ev.data);
        if (d.delta && d.delta.type === "text_delta" && d.delta.text) yield String(d.delta.text);
      } catch {
      }
    } else if (ev.event === "error") throw new Error("Anthropic stream error: " + ev.data);
  }
}
async function* openai(messages, model, cfg, temp, options) {
  const msgs = (options.system ? [{ role: "system", content: options.system }] : []).concat(messages);
  const body = { model, stream: true, messages: msgs };
  if (temp !== void 0) body.temperature = temp;
  const res = await fetch((cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    signal: options.signal,
    headers: { "content-type": "application/json", "authorization": "Bearer " + String(cfg.apiKey || "") },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenAI-compatible API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  for await (const ev of sse(res)) {
    if (ev.data === "[DONE]") break;
    try {
      const d = JSON.parse(ev.data);
      const t = d.choices && d.choices[0] && d.choices[0].delta && d.choices[0].delta.content;
      if (t) yield String(t);
    } catch {
    }
  }
}
async function* ollama(messages, model, cfg, temp, options) {
  const msgs = (options.system ? [{ role: "system", content: options.system }] : []).concat(messages);
  const body = { model, stream: true, messages: msgs };
  if (temp !== void 0) body.options = { temperature: temp };
  const res = await fetch((cfg.baseUrl || "http://localhost:11434").replace(/\/$/, "") + "/api/chat", { method: "POST", signal: options.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const d = JSON.parse(line);
        if (d.message && d.message.content) yield String(d.message.content);
        if (d.done) return;
      } catch {
      }
    }
  }
}

// src/index.ts
if (!import_node_worker_threads2.isMainThread) {
  (init_worker(), __toCommonJS(worker_exports)).runWorker(import_node_worker_threads2.workerData);
} else {
  main();
}
function main() {
  process.title = "omarchy-launcher-ext-host";
  const transport = new Transport(process.stdin, process.stdout);
  const sessions = /* @__PURE__ */ new Map();
  const unloading = /* @__PURE__ */ new Set();
  const aiAborts = /* @__PURE__ */ new Map();
  let hostInfo = null;
  let shuttingDown = false;
  const log = (line) => process.stderr.write("[ext-host] " + line + "\n");
  transport.onRequest = async (method, params, id) => {
    switch (method) {
      case "manager.hello":
        hostInfo = Object.assign({}, params || {});
        hostInfo.capabilities = Object.assign({}, hostInfo.capabilities || {}, { ai: isConfigured() });
        if (hostInfo.protocol !== void 0 && hostInfo.protocol < PROTOCOL_VERSION) throw new Error(`host protocol ${hostInfo.protocol} is older than ${PROTOCOL_VERSION}`);
        return { ok: true };
      case "manager.load":
        return load(params);
      case "manager.unload":
        unload(String(params.s), false);
        return { ok: true };
      case "manager.shutdown":
        shuttingDown = true;
        for (const s of Array.from(sessions.keys())) unload(s, true);
        setTimeout(() => process.exit(0), 200);
        return { ok: true };
      case "manager.status":
        return { sessions: Array.from(sessions.values()).map((s) => ({ id: s.id, extension: s.params.extensionId, command: s.params.command.name, ready: s.ready })), rss: process.memoryUsage().rss, ai: configuredProviders() };
      case "ai.status":
        return { providers: configuredProviders(), default: resolve(null) };
      case "ai.chat": {
        const ctrl = new AbortController();
        aiAborts.set(String(params.id), ctrl);
        let text = "";
        try {
          for await (const chunk of stream(params.messages || [], { model: params.model, creativity: params.creativity, system: params.system, signal: ctrl.signal })) {
            text += chunk;
            transport.notify("ai.chunk", { id: params.id, text: chunk });
          }
        } finally {
          aiAborts.delete(String(params.id));
        }
        return { text };
      }
      default:
        throw new Error("unknown method " + method);
    }
  };
  transport.onNotification = (method, params) => {
    if (method === "manager.unload") {
      unload(String(params && params.s), false);
      return;
    }
    if (method === "manager.shutdown") {
      shuttingDown = true;
      for (const s2 of Array.from(sessions.keys())) unload(s2, true);
      setTimeout(() => process.exit(0), 200);
      return;
    }
    const s = params && params.s ? sessions.get(String(params.s)) : null;
    if (s) {
      s.worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method, params } });
      return;
    }
    if (method === "oauth.callback") {
      for (const sess of sessions.values()) sess.worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method, params } });
      return;
    }
    if (method === "ai.abort") {
      const c = aiAborts.get(String(params && params.id));
      if (c) c.abort();
      return;
    }
    log("notification for unknown session: " + method);
  };
  const origDispatch = transport.dispatch.bind(transport);
  transport.dispatch = (msg) => {
    if (msg && msg.method === void 0 && typeof msg.id === "string" && msg.id.indexOf(":") > 0) {
      const sid = msg.id.slice(0, msg.id.indexOf(":"));
      const s = sessions.get(sid);
      if (s) s.worker.postMessage({ type: "rpc", msg });
      return;
    }
    origDispatch(msg);
  };
  function load(params) {
    if (!params || !params.s) throw new Error("manager.load needs a session id");
    if (sessions.has(params.s)) unload(params.s, true);
    const worker = new import_node_worker_threads2.Worker(__filename, {
      workerData: { role: "worker", load: params, host: hostInfo },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
      stdout: true,
      stderr: true
    });
    const session = { id: params.s, worker, params, ready: false, readyWaiters: [] };
    sessions.set(params.s, session);
    worker.stdout.on("data", (d) => process.stderr.write(`[${params.extensionId}] ${d}`));
    worker.stderr.on("data", (d) => process.stderr.write(`[${params.extensionId}] ${d}`));
    worker.on("message", (m) => {
      if (!m || typeof m !== "object") return;
      if (m.type === "rpc") {
        const msg = m.msg;
        if (msg && msg.method === "ai.ask" && msg.id !== void 0) {
          serveAiAsk(worker, msg);
          return;
        }
        if (msg && msg.method === "ai.abort") {
          const c = aiAborts.get(String(msg.params && msg.params.id));
          if (c) c.abort();
          return;
        }
        transport.write(msg);
        return;
      }
      if (m.type === "ready") {
        session.ready = true;
        for (const w of session.readyWaiters) w();
        session.readyWaiters = [];
        return;
      }
      if (m.type === "log") {
        log(`[${params.extensionId}] ${m.line}`);
        return;
      }
      if (m.type === "ended") {
        transport.notify("manager.sessionEnded", { s: params.s, reason: m.reason || "finished" });
        unload(params.s, false);
        return;
      }
    });
    worker.on("error", (err) => {
      log(`worker error (${params.extensionId}): ${err && err.stack || err}`);
      transport.notify("manager.crash", { s: params.s, reason: String(err && err.message || err), stack: String(err && err.stack || "") });
      sessions.delete(params.s);
    });
    worker.on("exit", (code) => {
      if (sessions.get(params.s) === session) sessions.delete(params.s);
      const intentional = unloading.delete(params.s);
      if (code !== 0 && !shuttingDown && !intentional) transport.notify("manager.crash", { s: params.s, reason: "worker exited with code " + code, stack: "" });
    });
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => reject(new Error("handshake_timeout")), 5e3);
      session.readyWaiters.push(() => {
        clearTimeout(timer);
        resolve2({ ok: true });
      });
    });
  }
  async function serveAiAsk(worker, msg) {
    const p = msg.params || {};
    const ctrl = new AbortController();
    aiAborts.set(String(p.id), ctrl);
    let text = "";
    try {
      for await (const chunk of stream([{ role: "user", content: String(p.prompt || "") }], { model: p.model, creativity: p.creativity, signal: ctrl.signal })) {
        text += chunk;
        worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method: "ai.chunk", params: { id: p.id, text: chunk } } });
      }
      worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", id: msg.id, result: { text } } });
    } catch (e) {
      worker.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", id: msg.id, error: { code: -32e3, message: String(e && e.message || e) } } });
    } finally {
      aiAborts.delete(String(p.id));
    }
  }
  function unload(sid, immediate) {
    const s = sessions.get(sid);
    if (!s) return;
    sessions.delete(sid);
    unloading.add(sid);
    try {
      s.worker.postMessage({ type: "unload" });
    } catch {
    }
    const kill = () => {
      s.worker.terminate().catch(() => {
      });
    };
    if (immediate) kill();
    else s.unloadTimer = setTimeout(kill, 3e3);
  }
  process.stdin.on("end", () => {
    for (const s of Array.from(sessions.keys())) unload(s, true);
    setTimeout(() => process.exit(0), 100);
  });
  transport.notify("host.hello", {
    protocol: PROTOCOL_VERSION,
    minProtocol: PROTOCOL_VERSION,
    runtime: "omarchy-launcher-ext-host",
    version: "0.1.0",
    node: process.version,
    pid: process.pid,
    capabilities: ["view", "no-view", "oauth", "ai"],
    ai: configuredProviders()
  });
}
//# sourceMappingURL=ext-host.js.map
