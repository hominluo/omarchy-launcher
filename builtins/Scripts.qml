import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/Scripts.js" as Scripts

// Script Commands in Raycast's format (shebang + `@raycast.*` comments),
// scanned from ~/.config/omarchy-launcher/scripts and settings.scriptDirs.
// Modes: silent / compact (toast) / fullOutput (streamed here) / inline
// (result shown as the root row's subtitle, refreshed on refreshTime).
BuiltinHost {
  id: host

  readonly property string home: Quickshell.env("HOME")
  property var scripts: []              // [{ path, header, interpreter, macOnly }]
  property var inlineResults: ({})      // path -> { text, at }
  property double lastScan: 0
  property var running: null            // { path, title } for the fullOutput view
  property string output: ""
  property bool outputDone: false
  property var pendingScript: null

  function dirs() {
    var out = [host.home + "/.config/omarchy-launcher/scripts"]
    var extra = service && service.settings && service.settings.scriptDirs
    if (Array.isArray(extra)) for (var i = 0; i < extra.length; i++) out.push(String(extra[i]).replace(/^~/, host.home))
    return out
  }

  function scan() {
    if (scanner.running) return
    host.lastScan = Date.now()
    var d = dirs().map(function(x) { return JSON.stringify(x) }).join(" ")
    scanner.command = ["bash", "-c",
      "for dir in " + d + "; do [[ -d $dir ]] || continue; find \"$dir\" -maxdepth 3 -type f ! -name '.*' 2>/dev/null; done | sort | while IFS= read -r f; do " +
      "if head -c 4096 \"$f\" 2>/dev/null | grep -q '@raycast.schemaVersion'; then printf '===%s===\\n' \"$f\"; head -c 4096 \"$f\"; printf '\\n=== EOM ===\\n'; fi; done"]
    scanner.running = true
  }

  function parseScan(raw) {
    var out = []
    var blocks = String(raw || "").split("=== EOM ===")
    for (var i = 0; i < blocks.length; i++) {
      var m = blocks[i].match(/===(.+?)===\n([\s\S]*)$/)
      if (!m) continue
      var path = m[1]
      var header = Scripts.parseHeader(m[2])
      if (!header) continue
      var shebang = m[2].split("\n")[0]
      out.push({ path: path, header: header, interpreter: Scripts.interpreterFor(path, shebang), macOnly: Scripts.isMacOnly(path, m[2]) })
    }
    host.scripts = out
    if (service) service.rebuildIndex()
    refreshInline()
  }

  function iconFor(sc) {
    var ic = sc.header.icon
    if (!ic) return "󰆍"
    if (ic.charAt(0) === "/" || ic.charAt(0) === "~") return { kind: "image", value: "file://" + ic.replace(/^~/, host.home) }
    if (/^https?:\/\//.test(ic)) return { kind: "image", value: ic }
    if (ic.charAt(0) === "." || /\.(png|svg|jpg)$/i.test(ic)) { var base = sc.path.slice(0, sc.path.lastIndexOf("/") + 1); return { kind: "image", value: "file://" + base + ic.replace(/^\.\//, "") } }
    return ic
  }

  function rootEntries() {
    var out = []
    for (var i = 0; i < host.scripts.length; i++) {
      var sc = host.scripts[i]
      var h = sc.header
      var inline = h.mode === "inline" ? host.inlineResults[sc.path] : null
      out.push({
        id: "script:" + sc.path,
        kind: "script",
        title: h.title,
        subtitle: sc.macOnly ? "macOS only" : (inline ? inline.text : (h.description || h.packageName)),
        keywords: [h.packageName, h.description, "script"],
        aliases: [], baseAliases: [],
        icon: iconFor(sc),
        accessoryText: h.packageName || "Script",
        enabled: !sc.macOnly,
        favorite: false,
        primaryTitle: "Run Script",
        script: sc,
        acceptsArgument: h.arguments.length > 0,
        run: function(e, win) { return host.runScript(e.script, win, {}) },
        runWithArgument: h.arguments.length > 0 ? function(e, win, text) { return host.runScript(e.script, win, { arg1: String(text || "") }) } : undefined
      })
    }
    return out
  }

  // ---- running

  function runScript(sc, win, args) {
    host.panel = win
    var h = sc.header
    var needed = h.arguments.filter(function(a, idx) { return args["arg" + (idx + 1)] === undefined })
    if (needed.length) {
      host.pendingScript = sc
      host.push(argumentsForm(sc, {}))
      return true
    }
    var self = host
    var go = function() { self.execute(sc, args) }
    if (h.needsConfirmation) {
      host.confirm("Run “" + h.title + "”?", "Run", go)
      return true
    }
    go()
    return h.mode === "fullOutput" || h.mode === "compact"
  }

  function argumentsForm(sc, errors) {
    var fields = []
    var a = sc.header.arguments
    for (var i = 0; i < a.length; i++) {
      var arg = a[i]
      if (arg.type === "dropdown" && arg.data) {
        fields.push({ id: "arg" + (i + 1), field: "dropdown", title: arg.placeholder, autoFocus: i === 0, error: errors["arg" + (i + 1)] || "",
          items: (arg.data || []).map(function(d) { return { value: String(d.value), title: String(d.title || d.value) } }) })
      } else {
        fields.push({ id: "arg" + (i + 1), field: arg.secure ? "password" : "text", title: arg.placeholder, placeholder: arg.optional ? "optional" : "", autoFocus: i === 0, error: errors["arg" + (i + 1)] || "" })
      }
    }
    return { id: "script-args", type: "form", navigationTitle: sc.header.title, fields: fields,
      actions: { actions: [ { id: "run", title: "Run Script", icon: "󰐊", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] } }
  }

  function formSubmit(viewId, actionId, values) {
    if (viewId !== "script-args" || !host.pendingScript) return
    var sc = host.pendingScript
    var errors = {}
    var args = {}
    for (var i = 0; i < sc.header.arguments.length; i++) {
      var key = "arg" + (i + 1)
      var v = String(values[key] || "")
      if (!v && !sc.header.arguments[i].optional) errors[key] = "Required"
      args[key] = sc.header.arguments[i].percentEncoded ? encodeURIComponent(v) : v
    }
    if (Object.keys(errors).length) { host.render(argumentsForm(sc, errors)); return }
    host.pendingScript = null
    host.pop()
    var self = host
    var go = function() { self.execute(sc, args) }
    if (sc.header.needsConfirmation) host.confirm("Run “" + sc.header.title + "”?", "Run", go)
    else go()
  }

  function argv(sc, args) {
    var cmd = sc.interpreter ? [sc.interpreter, sc.path] : [sc.path]
    for (var i = 1; i <= 3; i++) if (args["arg" + i] !== undefined) cmd.push(String(args["arg" + i]))
    return cmd
  }

  function workingDir(sc) {
    var d = sc.header.currentDirectoryPath
    if (d) return d.replace(/^~/, host.home)
    return sc.path.slice(0, sc.path.lastIndexOf("/"))
  }

  function execute(sc, args) {
    var mode = sc.header.mode
    if (mode === "silent") {
      runner.mode = "silent"; runner.title = sc.header.title
      startRunner(sc, args)
      if (host.panel) host.panel.dismiss()
      return
    }
    if (mode === "compact") {
      runner.mode = "compact"; runner.title = sc.header.title
      host.toast("animated", "Running " + sc.header.title + "…")
      startRunner(sc, args)
      return
    }
    if (mode === "inline") {
      runner.mode = "inline"; runner.title = sc.header.title; runner.path = sc.path
      startRunner(sc, args)
      return
    }
    // fullOutput: streamed detail view
    host.output = ""
    host.outputDone = false
    host.running = { path: sc.path, title: sc.header.title }
    runner.mode = "full"; runner.title = sc.header.title
    host.push(outputView())
    startRunner(sc, args)
  }

  function startRunner(sc, args) {
    if (runner.running) runner.running = false
    runner.collected = ""
    runner.workingDirectory = workingDir(sc)
    runner.command = argv(sc, args)
    runner.running = true
  }

  function outputView() {
    var self = host
    var body = host.output ? "<pre style=\"font-family:monospace;white-space:pre-wrap\">" + Scripts.ansiToHtml(host.output) + "</pre>" : (host.outputDone ? "_(no output)_" : "_Running…_")
    return {
      id: "script-output", type: "detail",
      navigationTitle: host.running ? host.running.title : "Script",
      isLoading: !host.outputDone,
      markdown: body,
      actions: { actions: [
        { id: "copy", title: "Copy Output", icon: "󰆏", run: function() { self.copyText(self.output); return false } },
        { id: "rerun", title: "Run Again", icon: "󰑐", run: function() { var sc = self.byPath(self.running ? self.running.path : ""); if (sc) { self.pop(); self.runScript(sc, self.panel, {}) } return true } }
      ] }
    }
  }

  function byPath(p) { for (var i = 0; i < host.scripts.length; i++) if (host.scripts[i].path === p) return host.scripts[i]; return null }

  function viewPopped(viewId) {
    if (viewId === "script-output" && runner.mode === "full" && runner.running) runner.signal(15)
  }

  Process {
    id: runner
    property string mode: "full"
    property string title: ""
    property string path: ""
    property string collected: ""
    stdout: SplitParser {
      onRead: function(line) {
        runner.collected += line + "\n"
        if (runner.mode === "full") { host.output = runner.collected; host.render(host.outputView()) }
      }
    }
    stderr: SplitParser { onRead: function(line) { runner.collected += line + "\n"; if (runner.mode === "full") { host.output = runner.collected; host.render(host.outputView()) } } }
    onExited: function(code, status) {
      var lines = runner.collected.replace(/\s+$/, "").split("\n")
      var last = lines[lines.length - 1] || ""
      if (runner.mode === "full") { host.outputDone = true; host.output = runner.collected.replace(/\s+$/, ""); host.render(host.outputView()) }
      else if (runner.mode === "compact") { host.toast(code === 0 ? "success" : "failure", runner.title, last.slice(0, 120)) }
      else if (runner.mode === "inline") {
        var next = {}
        for (var k in host.inlineResults) next[k] = host.inlineResults[k]
        next[runner.path] = { text: last.slice(0, 120), at: Date.now() }
        host.inlineResults = next
        if (service) service.rebuildIndex()
        if (host.panel && host.panel.opened && host.panel.atRoot) host.panel.onSearchEdited(host.panel.searchTextValue())
      }
    }
  }

  // Inline scripts refresh while the launcher is open, respecting refreshTime.
  function refreshInline() {
    for (var i = 0; i < host.scripts.length; i++) {
      var sc = host.scripts[i]
      if (sc.header.mode !== "inline" || sc.macOnly) continue
      var last = host.inlineResults[sc.path]
      var due = !last || (Date.now() - last.at) >= Math.max(10, sc.header.refreshTime || 60) * 1000
      if (due && !runner.running) { runner.mode = "inline"; runner.title = sc.header.title; runner.path = sc.path; startRunner(sc, {}) }
    }
  }

  function onWindowOpened() {
    if (Date.now() - host.lastScan > 30000) scan()
    else refreshInline()
  }

  Process {
    id: scanner
    stdout: StdioCollector { onStreamFinished: host.parseScan(text) }
  }

  Component.onCompleted: Qt.callLater(scan)
}
