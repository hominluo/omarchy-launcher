// react-reconciler host config that builds a plain object tree:
//   { t: type, p: props (functions replaced by handler ids), c: children }
// Every commit calls container.onCommit(), which serializes and sends.
import Reconciler from "react-reconciler"
import { ConcurrentRoot, DefaultEventPriority, NoEventPriority } from "react-reconciler/constants"
import { Callbacks } from "./callbacks"

export interface Instance {
  t: string
  p: Record<string, any>
  c: Instance[]
  h: string[]                      // handler ids owned by this instance
  key?: string | null
}
export interface Container { c: Instance[]; onCommit: () => void; callbacks: Callbacks }

let currentUpdatePriority: number = NoEventPriority

function cleanProps(inst: Instance | null, props: Record<string, any>, callbacks: Callbacks): { p: Record<string, any>; h: string[] } {
  const p: Record<string, any> = {}
  const h: string[] = []
  const previous = inst ? inst.p : {}
  for (const k of Object.keys(props)) {
    if (k === "children") continue
    const v = props[k]
    if (typeof v === "function") {
      // Keep the id stable across re-renders when the same prop gets a new closure.
      const prevId = previous[k]
      const id = typeof prevId === "string" && prevId.startsWith("h") && callbacks.has(prevId) ? callbacks.replace(prevId, v) : callbacks.register(v)
      p[k] = id
      h.push(id)
      continue
    }
    if (v && typeof v === "object" && (v as any).$$typeof) continue   // React elements as props are mapped by the shim into children
    p[k] = v
  }
  return { p, h }
}

export function createHostConfig() {
  const config: any = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    supportsMicrotasks: true,
    isPrimaryRenderer: true,
    noTimeout: -1,
    NotPendingTransition: null,
    HostTransitionContext: { $$typeof: Symbol.for("react.context"), Consumer: null, Provider: null, _currentValue: null, _currentValue2: null, _threadCount: 0 },

    getRootHostContext: () => ({}),
    getChildHostContext: (parent: any) => parent,
    getPublicInstance: (i: Instance) => i,
    prepareForCommit: () => null,
    resetAfterCommit: (container: Container) => container.onCommit(),
    clearContainer: (container: Container) => { container.c = [] },
    shouldSetTextContent: () => false,

    createInstance(type: string, props: any, root: Container) {
      const inst: Instance = { t: type, p: {}, c: [], h: [], key: props.key ?? null }
      const cleaned = cleanProps(null, props, root.callbacks)
      inst.p = cleaned.p
      inst.h = cleaned.h
      return inst
    },
    createTextInstance(text: string): Instance {
      return { t: "#text", p: { text }, c: [], h: [] }
    },
    appendInitialChild(parent: Instance, child: Instance) { parent.c.push(child) },
    appendChild(parent: Instance, child: Instance) { parent.c.push(child) },
    appendChildToContainer(container: Container, child: Instance) { container.c.push(child) },
    insertBefore(parent: Instance, child: Instance, before: Instance) {
      const i = parent.c.indexOf(before)
      if (i >= 0) parent.c.splice(i, 0, child); else parent.c.push(child)
    },
    insertInContainerBefore(container: Container, child: Instance, before: Instance) {
      const i = container.c.indexOf(before)
      if (i >= 0) container.c.splice(i, 0, child); else container.c.push(child)
    },
    removeChild(parent: Instance, child: Instance) {
      const i = parent.c.indexOf(child)
      if (i >= 0) parent.c.splice(i, 1)
    },
    removeChildFromContainer(container: Container, child: Instance) {
      const i = container.c.indexOf(child)
      if (i >= 0) container.c.splice(i, 1)
    },
    finalizeInitialChildren: () => false,
    commitMount() {},
    commitUpdate(inst: Instance, type: string, _prev: any, next: any, _fiber: any) {
      // React 19 signature: (instance, type, oldProps, newProps, internalHandle)
      const cleaned = cleanProps(inst, next, currentContainer.callbacks)
      for (const id of inst.h) if (cleaned.h.indexOf(id) < 0) currentContainer.callbacks.release(id)
      inst.p = cleaned.p
      inst.h = cleaned.h
    },
    commitTextUpdate(inst: Instance, _old: string, next: string) { inst.p.text = next },
    resetTextContent() {},
    hideInstance() {},
    unhideInstance() {},
    hideTextInstance() {},
    unhideTextInstance() {},
    detachDeletedInstance(inst: Instance) { releaseTree(inst) },

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    scheduleMicrotask: queueMicrotask,
    getCurrentUpdatePriority: () => currentUpdatePriority,
    setCurrentUpdatePriority: (p: number) => { currentUpdatePriority = p },
    resolveUpdatePriority: () => currentUpdatePriority || DefaultEventPriority,
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1,
    shouldAttemptEagerTransition: () => false,
    trackSchedulerEvent() {},
    requestPostPaintCallback() {},
    maySuspendCommit: () => false,
    maySuspendCommitOnUpdate: () => false,
    maySuspendCommitInSyncRender: () => false,
    preloadInstance: () => true,
    startSuspendingCommit() {},
    suspendInstance() {},
    waitForCommitToBeReady: () => null,
    resetFormInstance() {},
    preparePortalMount() {},
    prepareScopeUpdate() {},
    getInstanceFromScope: () => null,
    getInstanceFromNode: () => null,
    beforeActiveInstanceBlur() {},
    afterActiveInstanceBlur() {},
    bindToConsole: (method: string, args: any[]) => Function.prototype.bind.apply((console as any)[method], [console].concat(args)),
    rendererPackageName: "omarchy-launcher",
    rendererVersion: "0.1.0"
  }
  return config
}

let currentContainer: Container

function releaseTree(inst: Instance) {
  if (!inst) return
  for (const id of inst.h) currentContainer.callbacks.release(id)
  for (const c of inst.c) releaseTree(c)
}

export function createRenderer(callbacks: Callbacks, onCommit: () => void) {
  const container: Container = { c: [], onCommit, callbacks }
  currentContainer = container
  const reconciler = (Reconciler as any)(createHostConfig())
  const root = reconciler.createContainer(container, ConcurrentRoot, null, false, null, "", (e: any) => reportError("uncaught", e), (e: any) => reportError("caught", e), (e: any) => reportError("recoverable", e), null)
  let errorHandler: (kind: string, error: any) => void = () => {}
  function reportError(kind: string, error: any) { errorHandler(kind, error) }
  return {
    container,
    render(element: any) { reconciler.updateContainer(element, root, null, null) },
    unmount() { reconciler.updateContainer(null, root, null, null) },
    flushSync(fn: () => void) { reconciler.flushSyncFromReconciler ? reconciler.flushSyncFromReconciler(fn) : fn() },
    onError(fn: (kind: string, error: any) => void) { errorHandler = fn }
  }
}
