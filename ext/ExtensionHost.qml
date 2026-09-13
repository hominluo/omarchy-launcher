import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland

// Owns the Node sidecar that runs Raycast extensions (runtime/ext-host.js):
// spawns it on first use, speaks NDJSON JSON-RPC over stdio, and turns its
// view renders into frames on the launcher window.
Item {
  id: host
  width: 0
  height: 0
  visible: false

  property var service: null
  readonly property string runtimeJs: service ? service.pluginDir + "/runtime/ext-host.js" : ""
  readonly property string dataDir: service ? service.home + "/.local/share/omarchy-launcher" : ""
  readonly property string supportDir: dataDir + "/support"
  property string nodeBin: ""
  property bool ready: false
  property bool wantRestart: false
  property int restartBackoffMs: 500
  property int nextId: 1
  property var pending: ({})            // id -> { resolve, reject }
  property var sessions: ({})           // sid -> ExtSession
  property int sessionSerial: 0
  property var pendingLaunch: null
  property string sidecarVersion: ""
  property string lastError: ""
  property var aiProviders: []
  property var aiChunkListener: null       // function(id, text)

  readonly property bool running: proc.running
  readonly property int liveSessions: Object.keys(sessions).length

  Component { id: sessionComponent; ExtSession {} }

  // ------------------------------------------------------------- process

  Process {
    id: proc
    command: host.nodeBin ? ["setpriv", "--pdeathsig", "TERM", host.nodeBin, "--max-old-space-size=512", host.runtimeJs] : ["true"]
    stdinEnabled: true
    stdout: SplitParser { onRead: function(line) { host.onLine(line) } }
    stderr: SplitParser { onRead: function(line) { host.onLog(line) } }
    onExited: function(code, status) { host.onExit(code, status) }
  }

  Process {
    id: nodeProbe
    command: ["bash", "-c", "for c in \"$OMARCHY_LAUNCHER_NODE\" \"$HOME/.local/share/omarchy-launcher/runtime/node/current/bin/node\" /usr/bin/node; do [[ -n $c && -x $c ]] && { echo \"$c\"; exit 0; }; done; ls -1 \"$HOME\"/.local/share/mise/installs/node/*/bin/node 2>/dev/null | sort -V | tail -1"]
    stdout: StdioCollector {
      onStreamFinished: {
        host.nodeBin = String(text || "").trim().split("\n")[0] || ""
        if (host.nodeBin && (host.pendingLaunch || host.readyWaiters.length)) { host.ensureRunning() }
        else if (!host.nodeBin) {
          if (host.pendingLaunch) host.failLaunch("Node.js 22 or newer is required to run extensions. Install it with: omarchy pkg add nodejs npm")
          host.readyWaiters = []
        }
      }
    }
  }

  function ensureRunning() {
    if (proc.running) return
    if (!host.nodeBin) { nodeProbe.running = true; return }
    host.ready = false
    proc.running = true
  }

  function onExit(code, status) {
    host.ready = false
    host.readyWaiters = []
    var pend = host.pending
    host.pending = ({})
    for (var id in pend) { try { pend[id].reject(new Error("sidecar exited")) } catch (e) {} }
    var ids = Object.keys(host.sessions)
    for (var i = 0; i < ids.length; i++) host.endSession(ids[i], "crash")
    if (host.pendingLaunch) host.failLaunch("The extension runtime exited (code " + code + ")")
    if (host.wantRestart) { host.wantRestart = false; restartTimer.interval = host.restartBackoffMs; host.restartBackoffMs = Math.min(host.restartBackoffMs * 2, 30000); restartTimer.start() }
  }

  Timer { id: restartTimer; onTriggered: host.ensureRunning() }
  Timer {
    id: idleTimer
    interval: 10 * 60 * 1000
    onTriggered: if (host.liveSessions === 0 && proc.running) host.request("manager.shutdown", {})
  }

  function onLog(line) {
    if (line.indexOf("DeprecationWarning") >= 0 || line.indexOf("--trace-deprecation") >= 0) return
    console.log("ext-host:", line)
  }

  // ------------------------------------------------------------- rpc

  // Start the runtime for a host-side request (AI) and run `fn` once ready.
  function whenReady(fn) {
    if (proc.running && host.ready) { fn(); return }
    host.readyWaiters = host.readyWaiters.concat([fn])
    host.ensureRunning()
  }
  property var readyWaiters: []

  function write(msg) { proc.write(JSON.stringify(msg) + "\n") }
  function notify(method, params) { if (proc.running) write({ jsonrpc: "2.0", method: method, params: params || {} }) }
  function request(method, params) {
    if (!proc.running || !host.ready) {
      return new Promise(function(resolve, reject) {
        host.whenReady(function() { host.rawRequest(method, params).then(resolve, reject) })
        if (!host.nodeBin && !nodeProbe.running) nodeProbe.running = true
      })
    }
    return host.rawRequest(method, params)
  }

  // Send without waiting for the handshake (used by the handshake itself).
  function rawRequest(method, params) {
    var id = host.nextId
    host.nextId += 2
    var resolveFn = null, rejectFn = null
    var p = new Promise(function(resolve, reject) { resolveFn = resolve; rejectFn = reject })
    var next = ({})
    for (var k in host.pending) next[k] = host.pending[k]
    next[id] = { resolve: resolveFn, reject: rejectFn }
    host.pending = next
    write({ jsonrpc: "2.0", id: id, method: method, params: params || {} })
    return p
  }
  function reply(id, result) { write({ jsonrpc: "2.0", id: id, result: result === undefined ? null : result }) }
  function replyError(id, message) { write({ jsonrpc: "2.0", id: id, error: { code: -32000, message: String(message) } }) }

  function onLine(line) {
    var msg
    try { msg = JSON.parse(line) } catch (e) { console.warn("ext-host: bad frame", line.slice(0, 200)); return }
    if (msg.method === "host.hello") { host.handshake(msg.params || {}); return }
    if (msg.method !== undefined) {
      if (msg.id !== undefined) {
        try {
          var r = host.handleRequest(msg.method, msg.params || {}, msg.id)
          if (r !== undefined) host.reply(msg.id, r)      // async handlers reply themselves
        } catch (e) { host.replyError(msg.id, e) }
      } else {
        try { host.handleNotification(msg.method, msg.params || {}) } catch (e) { console.warn("ext-host: notification failed", msg.method, e) }
      }
      return
    }
    if (msg.id !== undefined) {
      var p = host.pending[msg.id]
      if (!p) return
      var next = ({})
      for (var k in host.pending) if (String(k) !== String(msg.id)) next[k] = host.pending[k]
      host.pending = next
      if (msg.error) p.reject(new Error(msg.error.message || "rpc error")); else p.resolve(msg.result)
    }
  }

  function handshake(params) {
    host.sidecarVersion = String(params.version || "")
    host.aiProviders = Array.isArray(params.ai) ? params.ai : []
    host.rawRequest("manager.hello", {
      protocol: 1, launcher: "0.1.0", shell: "omarchy-shell",
      paths: { data: host.dataDir, config: service.configDir, state: service.stateDir },
      env: { appearance: "dark", textSize: "medium" },
      capabilities: { windowManagement: true, browserExtension: false, selectedText: true, ai: false }
    }).then(function() {
      host.ready = true
      host.restartBackoffMs = 500
      var waiters = host.readyWaiters
      host.readyWaiters = []
      for (var w = 0; w < waiters.length; w++) { try { waiters[w]() } catch (e) { console.warn("ext-host: ready waiter failed", e) } }
      if (host.pendingLaunch) { var l = host.pendingLaunch; host.pendingLaunch = null; host.doLaunch(l) }
    }, function(e) { console.warn("ext-host: hello failed", e) })
  }

  // ------------------------------------------------------------- sessions

  function sessionFor(params) { return params && params.s ? host.sessions[String(params.s)] : null }

  // Launch an extension command: called from the Service's extension entries.
  function launch(ext, cmd, win, args) {
    var launchSpec = { ext: ext, cmd: cmd, win: win, args: args || {} }
    if (!proc.running || !host.ready) {
      host.pendingLaunch = launchSpec
      win.pushView({ id: "ext-loading", type: "list", navigationTitle: cmd.title, searchBarPlaceholder: cmd.title, isLoading: true, filtering: false, items: [], emptyView: { icon: "󰑣", title: "Starting the extension runtime…" } }, null)
      host.ensureRunning()
      return
    }
    host.doLaunch(launchSpec)
  }

  function failLaunch(message) {
    var l = host.pendingLaunch
    host.pendingLaunch = null
    host.lastError = message
    if (l && l.win) { if (!l.win.atRoot) l.win.popView(); l.win.showToast({ style: "failure", title: "Cannot run extension", message: message }) }
  }

  function doLaunch(l) {
    var win = l.win
    // Replace the "starting" placeholder if one is showing.
    if (win.currentView && win.currentView.id === "ext-loading") win.popView()
    host.sessionSerial += 1
    var sid = "s" + host.sessionSerial
    var sess = sessionComponent.createObject(host, { host: host, sessionId: sid, extensionId: l.ext.id, commandName: l.cmd.name, title: l.cmd.title, panel: win })
    var next = ({})
    for (var k in host.sessions) next[k] = host.sessions[k]
    next[sid] = sess
    host.sessions = next
    idleTimer.stop()

    if (l.cmd.mode !== "no-view") {
      var key = sess.viewKey("v0")
      sess.viewIds = [key]
      win.pushView({ id: key, type: "list", navigationTitle: l.cmd.title, searchBarPlaceholder: l.cmd.title, isLoading: true, filtering: false, items: [] }, sess)
    } else {
      win.showToast({ style: "animated", title: "Running " + l.cmd.title + "…" })
    }

    var prefs = service.extensionPreferences(l.ext, l.cmd)
    host.request("manager.load", {
      s: sid,
      extensionId: l.ext.id,
      extensionDir: l.ext.dir,
      command: { name: l.cmd.name, mode: l.cmd.mode, title: l.cmd.title },
      entrypoint: l.ext.dir + "/" + l.cmd.name + ".js",
      preferences: prefs,
      arguments: l.args && l.args.arguments ? l.args.arguments : {},
      launchContext: l.args ? l.args.context : undefined,
      fallbackText: l.args ? l.args.fallbackText : undefined,
      launchType: l.args && l.args.launchType === "background" ? "background" : "userInitiated",
      env: { appearance: "dark", textSize: "medium", isDevelopment: false },
      paths: { assets: l.ext.dir + "/assets", support: host.supportDir + "/" + l.ext.id.replace("/", "__") }
    }).then(function() {}, function(e) {
      host.endSession(sid, "load-failed")
      if (win) { if (!win.atRoot) win.popView(); win.showToast({ style: "failure", title: "Extension failed to start", message: String(e && e.message || e).slice(0, 120) }) }
    })
  }

  function endSession(sid, reason) {
    var sess = host.sessions[sid]
    if (!sess) return
    var next = ({})
    for (var k in host.sessions) if (k !== sid) next[k] = host.sessions[k]
    host.sessions = next
    sess.ended = true
    host.notify("manager.unload", { s: sid })
    if (host.liveSessions === 0) idleTimer.restart()
    sess.destroy()
  }

  // The window closed: extension sessions end (Raycast unloads commands too).
  function onWindowClosed() {
    var ids = Object.keys(host.sessions)
    for (var i = 0; i < ids.length; i++) { host.notify("ui.closed", { s: ids[i] }); host.endSession(ids[i], "closed") }
  }

  // ------------------------------------------------------------- sidecar -> host

  function handleNotification(method, p) {
    var sess = sessionFor(p)
    switch (method) {
      case "ui.render": {
        if (!sess || sess.ended || !sess.panel) return
        var views = p.views || []
        for (var i = 0; i < views.length; i++) {
          var key = sess.viewKey(views[i].view)
          var root = views[i].root
          root.id = key
          if (!root.navigationTitle) root.navigationTitle = sess.title
          if (sess.viewIds.indexOf(key) < 0) { sess.viewIds = sess.viewIds.concat([key]); sess.panel.pushView(root, sess) }
          else sess.panel.renderView(root)
        }
        return
      }
      case "ui.popToRoot": if (sess && sess.panel) sess.panel.popToRoot(); return
      case "ui.closeMainWindow": if (sess && sess.panel) { if (p.popToRoot === "immediate") sess.panel.popToRoot(); sess.panel.dismiss() } return
      case "ui.clearSearchBar": if (sess && sess.panel) sess.panel.setSearchText(""); return
      case "ui.setSearchText": if (sess && sess.panel) sess.panel.setSearchText(String(p.text || "")); return
      case "ui.toast.show": case "ui.toast.update":
        if (sess && sess.panel) sess.panel.showToast({ id: p.id, style: p.style, title: p.title, message: p.message, duration: p.style === "animated" ? 0 : 3200,
          primaryAction: p.primaryAction ? { title: p.primaryAction.title, run: function() { sess.toastAction(p.primaryAction.id) } } : null })
        return
      case "ui.toast.hide": if (sess && sess.panel) sess.panel.hideToast(); return
      case "ui.hud":
        if (sess && sess.panel) sess.panel.dismiss()
        Quickshell.execDetached(["omarchy-shell", "osd", "show", JSON.stringify({ icon: "󱓞", message: String(p.text || ""), duration: 1800 })])
        return
      case "ui.dropdownValue": if (sess && sess.panel) sess.panel.setAccessoryValue(sess.viewKey(p.view), String(p.value)); return
      case "ui.openPreferences": if (sess && sess.panel && service) service.runCommandId("cmd:preferences", sess.panel, { extension: sess.extensionId }); return
      case "command.updateMetadata": if (sess && service) service.setExtensionSubtitle(sess.extensionId, sess.commandName, p.subtitle); return
      case "manager.crash":
        console.warn("ext-host crash:", p.reason, p.stack)
        if (sess && sess.panel) {
          var key2 = sess.viewIds.length ? sess.viewIds[sess.viewIds.length - 1] : sess.viewKey("v0")
          sess.panel.renderView({ id: key2, type: "detail", navigationTitle: "Extension error", markdown: "# The extension crashed\n\n" + String(p.reason || "") + "\n\n```\n" + String(p.stack || "").slice(0, 3000) + "\n```", actions: { actions: [ { id: "close", title: "Close", kind: "pop" } ] } })
          sess.panel.showToast({ style: "failure", title: "Extension crashed", message: String(p.reason || "").slice(0, 100) })
        }
        return
      case "manager.sessionEnded":
        if (sess) { if (sess.panel && sess.viewIds.length === 0) sess.panel.hideToast(); host.endSession(sess.sessionId, "ended") }
        return
      case "manager.log": console.log("ext-host:", p.level, p.line); return
      case "ai.chunk": if (host.aiChunkListener) host.aiChunkListener(String(p.id), String(p.text || "")); return
      case "ai.abort": return
      default: console.log("ext-host: unhandled notification", method)
    }
  }

  // Returns a value to reply immediately, or undefined when the handler
  // replies asynchronously with host.reply(id, …).
  function handleRequest(method, p, id) {
    var sess = sessionFor(p)
    switch (method) {
      case "ui.pushView": {
        if (!sess || !sess.panel) throw new Error("no session")
        var v = "v" + sess.nextView
        sess.nextView += 1
        var key = sess.viewKey(v)
        sess.viewIds = sess.viewIds.concat([key])
        sess.panel.pushView({ id: key, type: "list", navigationTitle: sess.title, isLoading: true, filtering: false, items: [] }, sess)
        return { view: v }
      }
      case "ui.popView": if (sess && sess.panel) sess.panel.popView(); return { ok: true }
      case "ui.alert": {
        if (!sess || !sess.panel) throw new Error("no session")
        var answered = false
        sess.panel.confirm(String(p.title || "") + (p.message ? "\n" + p.message : ""), String(p.primary && p.primary.title || "Confirm"), function() { answered = true; host.reply(id, { confirmed: true }) })
        sess.panel.onConfirmDismissed(function() { if (!answered) host.reply(id, { confirmed: false }) })
        return undefined
      }
      case "ui.getSelectedText": selectedText.replyId = id; selectedText.running = true; return undefined
      case "clipboard.copy": {
        var c = p.content || {}
        if (c.file) Quickshell.execDetached(["bash", "-c", "printf 'file://%s' \"$1\" | wl-copy --type text/uri-list", "--", String(c.file)])
        else Quickshell.execDetached(["wl-copy", "--", String(c.text || "")])
        return { ok: true }
      }
      case "clipboard.paste": {
        var c2 = p.content || {}
        if (sess && sess.panel) sess.panel.dismiss()
        Quickshell.execDetached(["bash", service.pluginDir + "/bin/paste.sh", String(c2.text || c2.file || "")])
        return { ok: true }
      }
      case "clipboard.clear": Quickshell.execDetached(["wl-copy", "--clear"]); return { ok: true }
      case "clipboard.read": clipboardRead.replyId = id; clipboardRead.offset = Number(p.offset || 0); clipboardRead.running = true; return undefined
      case "system.open": {
        var target = String(p.target || "")
        if (p.app) Quickshell.execDetached(["bash", "-lc", "uwsm-app -- gtk-launch " + JSON.stringify(String(p.app).replace(/\.desktop$/, "") + ".desktop") + " " + JSON.stringify(target) + " || xdg-open " + JSON.stringify(target)])
        else Quickshell.execDetached(["xdg-open", target])
        return { ok: true }
      }
      case "system.getApplications": {
        var apps = service ? service.appEntries : []
        return apps.map(function(a) { return { name: a.title, path: "/usr/share/applications/" + a.desktopId + ".desktop", bundleId: a.desktopId } })
      }
      case "system.getDefaultApplication": return { name: "xdg-open", path: "/usr/bin/xdg-open", bundleId: "xdg-open" }
      case "system.getFrontmostApplication": {
        var t = null
        try { t = Hyprland.activeToplevel } catch (e) {}
        var cls = t && t.lastIpcObject ? String(t.lastIpcObject["class"] || "") : ""
        return { name: cls || "unknown", path: "", bundleId: cls }
      }
      case "system.showInFileBrowser": Quickshell.execDetached(["bash", "-lc", "nautilus --select " + JSON.stringify(String(p.path)) + " 2>/dev/null || xdg-open " + JSON.stringify(String(p.path).replace(/\/[^/]*$/, ""))]); return { ok: true }
      case "system.trash": Quickshell.execDetached(["gio", "trash"].concat((p.paths || []).map(String))); return { ok: true }
      case "command.launch": {
        if (!service) throw new Error("no service")
        var extId = p.extensionName ? ((p.ownerOrAuthorName || (sess ? sess.extensionId.split("/")[0] : "")) + "/" + p.extensionName) : (sess ? sess.extensionId : "")
        var ok = service.launchExtensionCommand(extId, String(p.name), sess ? sess.panel : null, { arguments: p.arguments || {}, context: p.context, fallbackText: p.fallbackText, launchType: p.type })
        if (!ok) throw new Error("command not found: " + extId + "/" + p.name)
        return { ok: true }
      }
      case "oauth.authorize": {
        if (!sess || !sess.panel) throw new Error("no session")
        oauthWaiters[String(p.state)] = id
        Quickshell.execDetached(["xdg-open", String(p.url)])
        sess.panel.showToast({ style: "animated", title: "Waiting for " + (p.providerName || "the browser") + "…", message: "Finish signing in, then return here" })
        return undefined
      }
      case "wm.getActiveWindow": case "wm.getWindows": case "wm.getDesktops": case "wm.setWindowBounds":
        return wmRequest(method, p)
      case "ai.ask": throw new Error("AI is not configured in Omarchy Launcher yet")
      default: throw new Error("unknown method " + method)
    }
  }

  property var oauthWaiters: ({})
  function oauthCallback(params) {
    var state = String(params && params.state || "")
    var id = oauthWaiters[state]
    if (id === undefined) return false
    var next = ({})
    for (var k in oauthWaiters) if (k !== state) next[k] = oauthWaiters[k]
    oauthWaiters = next
    if (params.error) host.replyError(id, String(params.error))
    else host.reply(id, { code: String(params.code || "") })
    return true
  }

  function wmRequest(method, p) {
    var tops = []
    try { tops = Hyprland.toplevels.values || [] } catch (e) {}
    var win = function(t) {
      var o = t.lastIpcObject || {}
      return { id: String(t.address || ""), active: t.activated === true, bounds: { position: { x: o.at ? o.at[0] : 0, y: o.at ? o.at[1] : 0 }, size: { width: o.size ? o.size[0] : 0, height: o.size ? o.size[1] : 0 } }, desktopId: t.workspace ? String(t.workspace.id) : "", application: { name: String(o["class"] || ""), bundleId: String(o["class"] || ""), path: "" }, positionable: true, resizable: true, fullScreenSettable: true }
    }
    if (method === "wm.getWindows") return tops.filter(function(t) { return t }).map(win)
    if (method === "wm.getActiveWindow") { var a = null; try { a = Hyprland.activeToplevel } catch (e) {} return a ? win(a) : null }
    if (method === "wm.getDesktops") { var ws = []; try { ws = Hyprland.workspaces.values || [] } catch (e) {} return ws.map(function(w) { return { id: String(w.id), active: w.active === true, size: { width: 0, height: 0 }, screenId: w.monitor ? String(w.monitor.name) : "" } }) }
    if (method === "wm.setWindowBounds") {
      var b = p.bounds || {}
      var addr = String(p.id || "")
      var cmds = []
      if (b.size) cmds.push("dispatch resizewindowpixel exact " + Math.round(b.size.width) + " " + Math.round(b.size.height) + ",address:" + addr)
      if (b.position) cmds.push("dispatch movewindowpixel exact " + Math.round(b.position.x) + " " + Math.round(b.position.y) + ",address:" + addr)
      if (cmds.length) Quickshell.execDetached(["hyprctl", "--batch", cmds.join("; ")])
      return { ok: true }
    }
    return null
  }

  Process {
    id: selectedText
    property var replyId: null
    command: ["wl-paste", "--primary", "--no-newline"]
    stdout: StdioCollector { onStreamFinished: { if (selectedText.replyId !== null) { host.reply(selectedText.replyId, { text: String(text || "") }); selectedText.replyId = null } } }
  }

  Process {
    id: clipboardRead
    property var replyId: null
    property int offset: 0
    command: ["bash", "-c", "if [[ $1 == 0 ]]; then wl-paste --no-newline --type text 2>/dev/null; else jq -r --argjson i \"$1\" '.[$i].text // empty' \"$HOME/.local/state/omarchy/clipboard-history.json\" 2>/dev/null; fi", "--", String(offset)]
    stdout: StdioCollector { onStreamFinished: { if (clipboardRead.replyId !== null) { host.reply(clipboardRead.replyId, { text: String(text || "") }); clipboardRead.replyId = null } } }
  }

  function restartRuntime() {
    if (proc.running) { host.wantRestart = true; proc.signal(15) }
    else { host.aiProviders = []; host.ensureRunning() }
  }

  IpcHandler {
    target: "launcher-ext"
    function status(): string { return JSON.stringify({ running: proc.running, ready: host.ready, node: host.nodeBin, sessions: Object.keys(host.sessions), version: host.sidecarVersion, lastError: host.lastError }) }
    function restart(): string { if (proc.running) { host.wantRestart = true; proc.signal(15) } else host.ensureRunning(); return "ok" }
  }
}
