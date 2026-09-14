import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/Files.js" as Files

// Search Files: `fd` over the configured roots (names) or `rg` (contents),
// ranked for relevance in lib/Files.js, with a preview pane that shows
// type, size and modification time. The empty state lists recently
// modified files. Root queries that start with ~ or / browse that folder
// inline, and weak root matches get a short "Files" section.
BuiltinHost {
  id: host

  readonly property string home: Quickshell.env("HOME")
  property var results: []          // ranked rows: { path, isDir, mtime, size, hits? }
  property string query: ""
  property string mode: "name"      // "name" | "content"
  property int serial: 0

  function now() { return Math.floor(Date.now() / 1000) }

  function roots() {
    var s = service && service.settings && service.settings.fileSearchRoots
    var list = Array.isArray(s) && s.length ? s : ["~"]
    var out = []
    for (var i = 0; i < list.length; i++) out.push(String(list[i]).replace(/^~/, host.home))
    return out
  }

  function excludes() {
    var s = service && service.settings && service.settings.fileSearchExcludes
    return Array.isArray(s) ? s : Files.defaultExcludes()
  }

  function hidden() { return !!(service && service.settings && service.settings.fileSearchHidden === true) }
  function searchOpts(extra) {
    var o = { roots: roots(), excludes: excludes(), hidden: hidden() }
    if (extra) for (var k in extra) o[k] = extra[k]
    return o
  }

  function isImage(path) { return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(path) }

  // A result row (ranked candidate) -> list item with the preview detail.
  function itemFor(row) {
    var self = host
    var p = String(row.path || "")
    var dir = row.isDir === true
    var display = Files.tildify(p, host.home)
    var meta = [{ kind: "label", title: "Type", text: dir ? "Folder" : Files.kindOf(p, false).replace(/^\w/, function(c) { return c.toUpperCase() }) }]
    if (!dir && row.size !== undefined) meta.push({ kind: "label", title: "Size", text: Files.formatSize(row.size) })
    if (row.mtime) meta.push({ kind: "label", title: "Modified", text: Files.formatAge(row.mtime, host.now()) })
    meta.push({ kind: "label", title: "Path", text: display })
    var md = "**" + Files.fileName(p) + "**\n\n`" + display + "`"
    if (row.hits && row.hits.length) {
      md += "\n\n"
      for (var h = 0; h < row.hits.length; h++) md += "`" + row.hits[h].line + "`  " + String(row.hits[h].text).replace(/[`*_]/g, " ").slice(0, 160) + "\n\n"
    }
    var subtitle = row.hits && row.hits.length ? Files.dirName(display) + "  ·  line " + row.hits[0].line : Files.dirName(display)
    var acc = []
    if (!dir && row.size !== undefined && !(row.hits && row.hits.length)) acc.push({ text: Files.formatSize(row.size) })
    return {
      id: "file:" + p,
      title: Files.fileName(p),
      subtitle: subtitle,
      icon: dir ? "󰉖" : (isImage(p) ? { kind: "image", value: "file://" + p } : Files.iconFor(p, false)),
      keywords: [display],
      accessories: acc,
      detail: isImage(p) ? { image: "file://" + p, metadata: meta } : { markdown: md, metadata: meta },
      data: { path: p, dir: dir },
      actions: { sections: [
        { actions: [
          { id: "open", title: dir ? "Open Folder" : "Open", icon: "󰏌", run: function(item) { Quickshell.execDetached(["xdg-open", item.data.path]); return false } },
          { id: "reveal", title: "Show in File Manager", icon: "󰉖", run: function(item) { Quickshell.execDetached(["bash", "-lc", "nautilus --select " + Files.shellQuote(item.data.path) + " 2>/dev/null || xdg-open " + Files.shellQuote(Files.dirName(item.data.path))]); return false } },
          { id: "terminal", title: "Open in Terminal", icon: "󰆍", run: function(item) { Quickshell.execDetached(["bash", "-lc", "cd " + Files.shellQuote(item.data.dir ? item.data.path : Files.dirName(item.data.path)) + " && xdg-terminal-exec"]); return false } },
          { id: "editor", title: "Open in Editor", icon: "󰷈", run: function(item) { Quickshell.execDetached(["bash", "-lc", "xdg-terminal-exec -- \"$(omarchy-default-editor 2>/dev/null || echo nvim)\" " + Files.shellQuote(item.data.path)]); return false } }
        ] },
        { actions: [
          { id: "copy-path", title: "Copy Path", icon: "󰆏", shortcut: { modifiers: ["ctrl", "shift"], key: "c", label: "⌃⇧C" }, run: function(item) { self.copyText(item.data.path); return false } },
          { id: "copy-file", title: "Copy File", icon: "󰆏", run: function(item) { Quickshell.execDetached(["bash", "-c", "printf 'file://%s' \"$1\" | wl-copy --type text/uri-list", "--", item.data.path]); return false } },
          { id: "trash", title: "Move to Trash", icon: "󰧧", style: "destructive", run: function(item) { self.confirm("Move " + Files.fileName(item.data.path) + " to the trash?", "Trash", function() { Quickshell.execDetached(["gio", "trash", item.data.path]); self.search(self.query) }); return true } }
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
    var content = host.mode === "content"
    return {
      id: "files",
      type: "list",
      navigationTitle: "Search Files",
      searchBarPlaceholder: content ? "Search file contents…" : "Search files and folders…",
      searchBarAccessory: { id: "mode", value: host.mode, sections: [{ items: [ { title: "File names", value: "name" }, { title: "File contents", value: "content" } ] }] },
      filtering: false,
      isShowingDetail: true,
      isLoading: !!loading || (host.query.length < 2 && recentFinder.running),
      searchText: host.query,
      sections: sections,
      emptyView: host.query.length < 2
        ? { icon: "󰱽", title: content ? "Type to search inside files" : "Type to search files", description: "Paths starting with ~ or / browse that folder · Alt+↓ switches names / contents" }
        : { icon: "󰱽", title: loading ? "Searching…" : "No " + (content ? "files contain" : "files match") + " “" + host.query + "”" }
    }
  }

  function open(win, args) {
    host.panel = win
    host.query = args && args.query ? String(args.query) : ""
    host.mode = args && args.mode === "content" ? "content" : "name"
    host.results = []
    host.push(buildView(false))
    if (host.query.length >= 2) debounce.restart()
    else loadRecent()
  }

  function searchText(viewId, text) {
    if (viewId !== "files") return
    host.query = text
    if (text.length < 2) { host.results = []; host.render(buildView(false)); loadRecent(); return }
    host.render(buildView(true))
    debounce.restart()
  }

  function dropdown(viewId, dropdownId, value) {
    if (viewId !== "files" || dropdownId !== "mode") return
    host.mode = value === "content" ? "content" : "name"
    host.results = []
    host.render(buildView(host.query.length >= 2))
    if (host.query.length >= 2) debounce.restart()
  }

  function search(q) {
    host.serial += 1
    finder.serial = host.serial
    var cmd = host.mode === "content" ? Files.contentCommand(q, searchOpts({ maxLines: 400 })) : Files.nameCommand(q, searchOpts({ maxResults: 600 }))
    if (finder.running) finder.running = false
    finder.mode = host.mode
    finder.command = ["bash", "-c", cmd]
    finder.running = true
  }

  Timer { id: debounce; interval: 160; onTriggered: host.search(host.query) }

  Process {
    id: finder
    property int serial: 0
    property string mode: "name"
    stdout: StdioCollector {
      onStreamFinished: {
        if (finder.serial !== host.serial) return
        if (finder.mode === "content") {
          var groups = Files.parseContentHits(text)
          var rows = []
          for (var g = 0; g < groups.length && g < 80; g++) rows.push({ path: groups[g].path, isDir: false, mtime: 0, size: undefined, hits: groups[g].hits })
          host.results = rows
        } else {
          host.results = Files.rank(Files.parseStat(text), host.query, 60, host.now())
        }
        host.render(host.buildView(false))
      }
    }
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
    var cmd = args.map(Files.shellQuote).join(" ")
    recentFinder.command = ["bash", "-c", cmd + " 2>/dev/null | xargs -0 -r stat --printf '%Y\\t%s\\t%F\\t%n\\n' 2>/dev/null | sort -rn | head -20"]
    recentFinder.running = true
  }
  Process {
    id: recentFinder
    stdout: StdioCollector {
      onStreamFinished: {
        host.recentResults = Files.parseStat(text)
        host.recentLoadedAt = Date.now()
        if (host.activeViewId === "files" && host.query.length < 2) host.render(host.buildView(false))
      }
    }
  }

  // ---- root queries: "~/Doc" or "/usr/sh" browse that folder inline, any
  // other query with weak matches gets a few ranked files. The service
  // re-renders the root when results land.
  property string rootQuery: ""
  property var rootResults: []
  property bool rootPending: false
  property int rootSerial: 0
  function rootRows(q, limit) {
    var query = String(q || "")
    if (query !== host.rootQuery) {
      host.rootQuery = query
      host.rootResults = []
      host.rootPending = true
      rootDebounce.restart()
    }
    var out = []
    for (var i = 0; i < host.rootResults.length && i < (limit || 12); i++) out.push(itemFor(host.rootResults[i]))
    return out
  }
  Timer { id: rootDebounce; interval: 160; onTriggered: host.runRootSearch(host.rootQuery) }
  function runRootSearch(q) {
    host.rootSerial += 1
    rootFinder.serial = host.rootSerial
    var opts = searchOpts({ maxResults: 400 })
    var pattern = q
    var m = q.match(/^(~|\/)([^\s]*)$/)
    if (m) {
      var full = (m[1] === "~" ? host.home : "") + (m[1] === "~" ? m[2] : "/" + m[2])
      var slash = full.lastIndexOf("/")
      opts.roots = [full.slice(0, slash + 1) || "/"]
      opts.maxDepth = 1
      pattern = full.slice(slash + 1)
    }
    rootFinder.browse = !!m
    rootFinder.pattern = pattern
    if (rootFinder.running) rootFinder.running = false
    rootFinder.command = ["bash", "-c", Files.nameCommand(pattern, opts)]
    rootFinder.running = true
  }
  Process {
    id: rootFinder
    property int serial: 0
    property bool browse: false
    property string pattern: ""
    stdout: StdioCollector {
      onStreamFinished: {
        if (rootFinder.serial !== host.rootSerial) return
        var cands = Files.parseStat(text)
        if (rootFinder.browse && !rootFinder.pattern.length) {
          cands.sort(function(a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0 })
          host.rootResults = cands.slice(0, 40)
        } else host.rootResults = Files.rank(cands, rootFinder.pattern, 40, host.now())
        host.rootPending = false
        if (service) service.indexChanged()
      }
    }
  }
}
