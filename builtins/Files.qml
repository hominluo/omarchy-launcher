import QtQuick
import Quickshell
import Quickshell.Io

// Search Files: fd over the configured roots, debounced, with a preview
// pane. Also answers root queries that start with ~ or /.
BuiltinHost {
  id: host

  readonly property string home: Quickshell.env("HOME")
  property var results: []
  property string query: ""
  property int serial: 0
  property int applied: 0
  property string collected: ""

  function roots() {
    var s = service && service.settings && service.settings.fileSearchRoots
    var list = Array.isArray(s) && s.length ? s : ["~"]
    var out = []
    for (var i = 0; i < list.length; i++) out.push(String(list[i]).replace(/^~/, host.home))
    return out
  }

  function excludes() {
    var s = service && service.settings && service.settings.fileSearchExcludes
    return Array.isArray(s) ? s : [".git", "node_modules", ".cache", "__pycache__", ".local/share/Trash"]
  }

  function fileName(path) { var i = path.lastIndexOf("/"); return i >= 0 ? path.slice(i + 1) : path }
  function dirName(path) { var i = path.lastIndexOf("/"); return i > 0 ? path.slice(0, i) : "/" }
  function isImage(path) { return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path) }
  function isDir(path) { return path.length > 1 && path.charAt(path.length - 1) === "/" }

  function itemFor(path) {
    var self = host
    var dir = isDir(path)
    var p = dir ? path.slice(0, -1) : path
    var display = p.indexOf(host.home) === 0 ? "~" + p.slice(host.home.length) : p
    return {
      id: "file:" + p,
      title: fileName(p),
      subtitle: dirName(display),
      icon: dir ? "󰉖" : (isImage(p) ? { kind: "image", value: "file://" + p } : "󰈤"),
      keywords: [display],
      detail: isImage(p) ? { image: "file://" + p, metadata: [{ kind: "label", title: "Path", text: display }] }
                         : { markdown: "**" + fileName(p) + "**\n\n`" + display + "`", metadata: [{ kind: "label", title: "Type", text: dir ? "Folder" : "File" }] },
      data: { path: p, dir: dir },
      actions: { sections: [
        { actions: [
          { id: "open", title: dir ? "Open Folder" : "Open", icon: "󰏌", run: function(item) { Quickshell.execDetached(["xdg-open", item.data.path]); return false } },
          { id: "reveal", title: "Show in File Manager", icon: "󰉖", run: function(item) { Quickshell.execDetached(["bash", "-lc", "nautilus --select " + JSON.stringify(item.data.path) + " 2>/dev/null || xdg-open " + JSON.stringify(self.dirName(item.data.path))]); return false } },
          { id: "terminal", title: "Open in Terminal", icon: "󰆍", run: function(item) { Quickshell.execDetached(["bash", "-lc", "cd " + JSON.stringify(item.data.dir ? item.data.path : self.dirName(item.data.path)) + " && xdg-terminal-exec"]); return false } }
        ] },
        { actions: [
          { id: "copy-path", title: "Copy Path", icon: "󰆏", shortcut: { modifiers: ["ctrl", "shift"], key: "c", label: "⌃⇧C" }, run: function(item) { self.copyText(item.data.path); return false } },
          { id: "copy-file", title: "Copy File", icon: "󰆏", run: function(item) { Quickshell.execDetached(["bash", "-c", "printf 'file://%s' \"$1\" | wl-copy --type text/uri-list", "--", item.data.path]); return false } },
          { id: "trash", title: "Move to Trash", icon: "󰧧", style: "destructive", run: function(item) { self.confirm("Move " + self.fileName(item.data.path) + " to the trash?", "Trash", function() { Quickshell.execDetached(["gio", "trash", item.data.path]); self.search(self.query) }); return true } }
        ] }
      ] }
    }
  }

  function buildView(loading) {
    var items = []
    for (var i = 0; i < host.results.length; i++) items.push(itemFor(host.results[i]))
    var sections = []
    if (host.query.length < 2) {
      var recent = []
      for (var r = 0; r < host.recentResults.length; r++) recent.push(itemFor(host.recentResults[r]))
      if (recent.length) sections.push({ id: "recent", title: "Recently Modified", items: recent })
    } else sections.push({ id: "results", title: "", items: items })
    return {
      id: "files",
      type: "list",
      navigationTitle: "Search Files",
      searchBarPlaceholder: "Search files and folders…",
      filtering: false,
      isShowingDetail: true,
      isLoading: !!loading || (host.query.length < 2 && recentFinder.running),
      searchText: host.query,
      sections: sections,
      emptyView: host.query.length < 2 ? { icon: "󰱽", title: "Type to search files", description: "Paths starting with ~ or / browse that folder" } : { icon: "󰱽", title: loading ? "Searching…" : "No files match “" + host.query + "”" }
    }
  }

  function open(win, args) {
    host.panel = win
    host.query = args && args.query ? String(args.query) : ""
    host.results = []
    host.push(buildView(false))
    if (host.query.length >= 2) debounce.restart()
    else loadRecent()
  }

  function searchText(viewId, text) {
    if (viewId !== "files") return
    host.query = text
    if (text.length < 2) { host.results = []; host.render(buildView(false)); return }
    host.render(buildView(true))
    debounce.restart()
  }

  // ---- files changed in the last week, newest first (the empty state)
  property var recentResults: []
  property double recentLoadedAt: 0
  function loadRecent() {
    if (recentFinder.running) return
    if (Date.now() - host.recentLoadedAt < 60 * 1000 && host.recentResults.length) return
    var ex = excludes()
    var args = ["fd", "--type", "f", "--changed-within", "7d", "--one-file-system", "--max-results", "400", "--color", "never"]
    for (var i = 0; i < ex.length; i++) args.push("--exclude", ex[i])
    args.push("-0", ".")
    var rs = roots()
    for (var r = 0; r < rs.length; r++) args.push(rs[r])
    var cmd = args.map(function(a) { return "'" + String(a).replace(/'/g, "'\\''") + "'" }).join(" ")
    recentFinder.command = ["bash", "-c", cmd + " 2>/dev/null | xargs -0 -r stat -c '%Y %n' 2>/dev/null | sort -rn | head -20 | cut -d' ' -f2-"]
    recentFinder.running = true
  }
  Process {
    id: recentFinder
    stdout: StdioCollector {
      onStreamFinished: {
        host.recentResults = String(text || "").split("\n").filter(function(l) { return l.length > 0 })
        host.recentLoadedAt = Date.now()
        if (host.activeViewId === "files" && host.query.length < 2) host.render(host.buildView(false))
      }
    }
  }

  // ---- root queries: "~/Doc" or "/usr/sh" typed at the root list files
  // inline. The service re-renders the root when results land.
  property string rootQuery: ""
  property var rootResults: []
  property bool rootPending: false
  function rootRows(q) {
    var query = String(q || "")
    if (query !== host.rootQuery) {
      host.rootQuery = query
      host.rootResults = []
      host.rootPending = true
      rootDebounce.restart()
    }
    var out = []
    for (var i = 0; i < host.rootResults.length && i < 12; i++) out.push(itemFor(host.rootResults[i]))
    return out
  }
  Timer { id: rootDebounce; interval: 160; onTriggered: host.runRootSearch(host.rootQuery) }
  function runRootSearch(q) {
    host.rootSerial += 1
    rootFinder.serial = host.rootSerial
    var argv = ["fd", "--color", "never", "--max-results", "40", "--one-file-system"]
    if (service && service.settings && service.settings.fileSearchHidden === true) argv.push("--hidden")
    var ex = excludes()
    for (var i = 0; i < ex.length; i++) argv.push("--exclude", ex[i])
    var pattern = q
    var searchRoots = roots()
    var m = q.match(/^(~|\/)([^\s]*)$/)
    if (m) {
      var full = (m[1] === "~" ? host.home : "") + (m[1] === "~" ? m[2] : "/" + m[2])
      var slash = full.lastIndexOf("/")
      searchRoots = [full.slice(0, slash + 1) || "/"]
      pattern = full.slice(slash + 1)
      argv.push("--max-depth", "1")
    }
    argv.push("--", pattern.length ? pattern : ".")
    for (var r = 0; r < searchRoots.length; r++) argv.push(searchRoots[r])
    if (rootFinder.running) rootFinder.running = false
    rootFinder.command = argv
    rootFinder.running = true
  }
  property int rootSerial: 0
  Process {
    id: rootFinder
    property int serial: 0
    stdout: StdioCollector {
      onStreamFinished: {
        if (rootFinder.serial !== host.rootSerial) return
        host.rootResults = String(text || "").split("\n").filter(function(l) { return l.length > 0 })
        host.rootPending = false
        if (service) service.indexChanged()
      }
    }
  }

  function search(q) {
    host.serial += 1
    finder.serial = host.serial
    host.collected = ""
    // --one-file-system keeps fd out of FUSE mounts (a cloud drive under ~
    // turned a 0.2 s search into a 40 s one).
    var argv = ["fd", "--color", "never", "--max-results", "60", "--one-file-system"]
    if (service && service.settings && service.settings.fileSearchHidden === true) argv.push("--hidden")
    var ex = excludes()
    for (var i = 0; i < ex.length; i++) argv.push("--exclude", ex[i])
    var pattern = q
    var searchRoots = roots()
    // "~/Doc" or "/usr/sh" searches inside that directory prefix.
    var m = q.match(/^(~|\/)([^\s]*)$/)
    if (m) {
      var full = (m[1] === "~" ? host.home : "") + (m[1] === "~" ? m[2] : "/" + m[2])
      var slash = full.lastIndexOf("/")
      searchRoots = [full.slice(0, slash + 1) || "/"]
      pattern = full.slice(slash + 1)
      argv.push("--max-depth", "1")
    }
    argv.push("--", pattern.length ? pattern : ".")
    for (var r = 0; r < searchRoots.length; r++) argv.push(searchRoots[r])
    if (finder.running) finder.running = false
    finder.command = argv
    finder.running = true
  }

  Timer { id: debounce; interval: 160; onTriggered: host.search(host.query) }

  Process {
    id: finder
    property int serial: 0
    stdout: StdioCollector {
      onStreamFinished: {
        if (finder.serial !== host.serial) return
        var lines = String(text || "").split("\n").filter(function(l) { return l.length > 0 })
        host.results = lines
        host.render(host.buildView(false))
      }
    }
  }
}
