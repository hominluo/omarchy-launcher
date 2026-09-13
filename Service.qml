import QtQuick
import Quickshell
import Quickshell.Io
import "lib/Score.js" as Score
import "lib/Frecency.js" as Frecency
import "lib/ViewModel.js" as VM
import "lib/Apps.js" as Apps

// Headless core of the launcher, mounted once at shell start and kept alive
// while the window is hidden. Owns the search index (apps, commands, and
// everything else that shows up in root search), usage history, on-disk
// state, and the IPC target other tools use to summon the launcher.
//
// The window (Launcher.qml) is a thin view over this object: the host hands
// it this instance through its `service` property.
Item {
  id: root
  width: 0
  height: 0
  visible: false

  // Host-injected.
  property var shell: null
  property var manifest: null
  property var pluginRegistry: null
  property var barWidgetRegistry: null
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")

  readonly property string pluginId: manifest && manifest.id ? String(manifest.id) : "io.github.hominluo.launcher"
  readonly property string home: Quickshell.env("HOME")
  readonly property string configDir: home + "/.config/omarchy-launcher"
  readonly property string stateDir: home + "/.local/state/omarchy-launcher"
  // Absolute path of this plugin's folder, so helper scripts resolve
  // regardless of where the checkout lives.
  readonly property string pluginDir: decodeURIComponent(String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "")).replace(/\/$/, "")

  // ------------------------------------------------------------- index

  // Every searchable thing at the root. Entry shape (see lib/Score.js):
  //   { id, kind, title, subtitle, keywords[], aliases[], icon, accessoryText,
  //     enabled, favorite, run(entry) }
  property var entries: []
  property var appEntries: []
  property var commandEntries: []
  property int indexRevision: 0

  property var frecencyData: Frecency.empty()
  property bool frecencyDirty: false
  property var settings: ({ version: 1, commands: {} })

  signal indexChanged()

  function now() { return Math.floor(Date.now() / 1000) }

  function rebuildIndex() {
    var all = root.appEntries.concat(root.commandEntries)
    var overrides = root.settings && root.settings.commands ? root.settings.commands : {}
    for (var i = 0; i < all.length; i++) {
      var e = all[i]
      var o = overrides[e.id]
      if (o) {
        if (o.enabled === false) e.enabled = false
        if (o.alias) e.aliases = [String(o.alias)].concat(e.baseAliases || [])
        if (o.favorite === true) e.favorite = true
        if (o.hotkey) e.hotkey = String(o.hotkey)
      }
      Score.prepare(e)
    }
    root.entries = all
    root.indexRevision += 1
    root.indexChanged()
  }

  function entryById(id) {
    for (var i = 0; i < root.entries.length; i++) if (root.entries[i].id === id) return root.entries[i]
    return null
  }

  // Ranked [{ entry, score }] for a query.
  function search(query, limit) {
    return Score.rank(root.entries, query, Frecency.scores(root.frecencyData, root.now()), limit || 50)
  }

  function suggestions(limit) {
    var ids = Frecency.top(root.frecencyData, root.now(), (limit || 8) * 2)
    var out = []
    for (var i = 0; i < ids.length && out.length < (limit || 8); i++) {
      var e = root.entryById(ids[i])
      if (e && e.enabled !== false) out.push(e)
    }
    return out
  }

  function recordUse(id) {
    root.frecencyData = Frecency.record(root.frecencyData, id, root.now())
    root.frecencyDirty = true
    saveTimer.restart()
  }

  // ------------------------------------------------------------- root view

  function entryRow(e) {
    return {
      id: e.id,
      title: e.title,
      subtitle: e.subtitle,
      icon: e.icon,
      keywords: e.keywords,
      accessories: e.accessoryText ? [{ text: e.accessoryText }] : [],
      data: { entryId: e.id }
    }
  }

  // The root list is produced here, not by a builtin, because it must be
  // synchronous on every keystroke. `filtering: false` tells the pane that
  // the owner already applied the query.
  function rootView(query) {
    var sections = []
    var q = String(query || "").trim()
    if (!q) {
      var sug = root.suggestions(8)
      if (sug.length) sections.push({ id: "suggestions", title: "Suggestions", items: sug.map(entryRow) })
      var seen = {}
      for (var s = 0; s < sug.length; s++) seen[sug[s].id] = true
      var rest = Score.rank(root.entries, "", {}, 0)
      var items = []
      for (var i = 0; i < rest.length; i++) if (!seen[rest[i].entry.id]) items.push(entryRow(rest[i].entry))
      sections.push({ id: "all", title: sug.length ? "All" : "", items: items })
    } else {
      var ranked = root.search(q, 50)
      var rows = []
      for (var r = 0; r < ranked.length; r++) rows.push(entryRow(ranked[r].entry))
      sections.push({ id: "results", title: "", items: rows })
    }
    return VM.normalizeView({
      id: "root",
      type: "list",
      filtering: false,
      searchBarPlaceholder: "Search apps and commands…",
      searchText: q,
      sections: sections,
      emptyView: { icon: "󰍉", title: q ? "No results for “" + q + "”" : "Nothing here yet" }
    })
  }

  // Run an entry. Returns true when the launcher should close afterwards.
  function activateEntry(entry, launcher) {
    if (!entry) return false
    root.recordUse(entry.id)
    if (typeof entry.run === "function") {
      var keepOpen = entry.run(entry, launcher) === true
      return !keepOpen
    }
    return true
  }

  // ------------------------------------------------------------- apps

  // Read straight from DesktopEntries (what the shell's own launcher does
  // underneath), so the index works regardless of which host facade this
  // plugin happens to hold.
  property var iconIndex: ({})
  property var pendingIconIndex: ({})
  property var hiddenIds: ({})
  property var desktopHiddenIds: ({})

  function iconSource(icon) {
    var value = String(icon || "")
    if (value.length === 0) return Quickshell.iconPath("application-x-executable", true)
    if (value.indexOf("file://") === 0 || value.indexOf("image://") === 0) return value
    if (value.charAt(0) === "/") return "file://" + value
    var found = root.iconIndex[value]
    if (found) return "file://" + found
    var themed = Quickshell.iconPath(value, true)
    if (themed.length > 0) return themed
    return Quickshell.iconPath("application-x-executable", true)
  }

  function launchApp(desktopId, name) {
    var id = Apps.normalizeDesktopId(desktopId)
    if (!id) return
    // Same launch path as the stock menu: uwsm-app scopes the app under
    // app-graphical.slice, gtk-launch resolves the desktop id.
    Quickshell.execDetached(["uwsm-app", "--", "gtk-launch", id + ".desktop"])
  }

  function rebuildApps() {
    var values = []
    try { values = DesktopEntries.applications.values || [] } catch (e) { values = [] }
    var out = []
    for (var i = 0; i < values.length; i++) {
      var app = values[i]
      if (!app || app.noDisplay) continue
      var id = Apps.normalizeDesktopId(app.id)
      if (!id || root.hiddenIds[id] || root.desktopHiddenIds[id]) continue
      var name = String(app.name || id)
      var kw = Apps.listToArray(app.keywords)
      if (app.comment) kw.push(String(app.comment))
      if (app.genericName) kw.push(String(app.genericName))
      out.push({
        id: "app:" + id,
        kind: "app",
        title: name,
        subtitle: String(app.genericName || ""),
        keywords: kw,
        aliases: [],
        baseAliases: [],
        icon: { kind: "app", value: String(app.icon || "") },
        accessoryText: "Application",
        enabled: true,
        favorite: false,
        desktopId: id,
        run: function(e) { root.launchApp(e.desktopId, e.title) }
      })
    }
    root.appEntries = out
    root.rebuildIndex()
  }

  Connections {
    target: DesktopEntries.applications
    ignoreUnknownSignals: true
    function onValuesChanged() {
      hiddenScan.running = true
      iconIndexDebounce.restart()
      root.rebuildApps()
    }
  }

  // Icons may still be landing while the shell starts; refresh when the
  // window opens, exactly as the stock menu does.
  function onWindowOpened() {
    if (!iconIndexScan.running) iconIndexScan.running = true
    if (root.appEntries.length === 0) root.rebuildApps()
  }

  Process {
    id: iconIndexScan
    command: ["bash", "-c", Apps.iconIndexScanCommand()]
    stdout: SplitParser {
      onRead: function(line) {
        var name = Apps.iconNameFromPath(line)
        if (name && root.pendingIconIndex[name] === undefined) root.pendingIconIndex[name] = String(line).trim()
      }
    }
    onStarted: root.pendingIconIndex = ({})
    onExited: root.iconIndex = root.pendingIconIndex
  }

  Timer {
    id: iconIndexDebounce
    interval: 750
    onTriggered: if (!iconIndexScan.running) iconIndexScan.running = true
  }

  // The shell ships a script that evaluates OnlyShowIn/NotShowIn/Hidden for
  // the running desktop; reuse it when present.
  readonly property string hiddenScript: root.omarchyPath + "/shell/services/hidden-entries.sh"
  Process {
    id: hiddenScan
    property string collected: ""
    command: ["bash", "-c", "[[ -f " + root.hiddenScript + " ]] && bash " + root.hiddenScript + " \"$XDG_CURRENT_DESKTOP:$XDG_SESSION_DESKTOP:$DESKTOP_SESSION\" || true"]
    stdout: SplitParser { onRead: function(line) { hiddenScan.collected += line + "\n" } }
    onStarted: hiddenScan.collected = ""
    onExited: { root.desktopHiddenIds = Apps.parseIdList(hiddenScan.collected); root.rebuildApps() }
  }

  FileView {
    path: root.omarchyPath + "/default/omarchy/launcher.hides"
    watchChanges: true
    printErrors: false
    onLoaded: { root.hiddenIds = Apps.parseIdList(text()); root.rebuildApps() }
    onFileChanged: reload()
    onLoadFailed: root.hiddenIds = ({})
  }

  // ------------------------------------------------------------- state files

  Process {
    id: mkdirProc
    command: ["mkdir", "-p", root.stateDir, root.configDir]
    onExited: { frecencyFile.reload(); settingsFile.reload() }
  }

  FileView {
    id: frecencyFile
    path: root.stateDir + "/frecency.json"
    atomicWrites: true
    printErrors: false
    onLoaded: {
      var data = null
      try { data = JSON.parse(text()) } catch (e) { data = null }
      root.frecencyData = Frecency.prune(data || Frecency.empty(), root.now())
    }
    onLoadFailed: root.frecencyData = Frecency.empty()
  }

  FileView {
    id: settingsFile
    path: root.configDir + "/settings.json"
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: {
      var data = null
      try { data = JSON.parse(text()) } catch (e) { data = null }
      root.settings = data && typeof data === "object" ? data : { version: 1, commands: {} }
      root.rebuildIndex()
    }
    onLoadFailed: root.settings = { version: 1, commands: {} }
    onFileChanged: reload()
  }

  Timer {
    id: saveTimer
    interval: 400
    onTriggered: {
      if (!root.frecencyDirty) return
      root.frecencyDirty = false
      frecencyFile.setText(JSON.stringify(root.frecencyData) + "\n")
    }
  }

  // ------------------------------------------------------------- IPC

  // omarchy-shell io.github.hominluo.launcher <method> [arg]
  // JSON arguments travel base64-encoded: qs ipc splits arguments on commas.
  IpcHandler {
    target: root.pluginId

    function ping(): string { return "ok" }
    function toggle(): string {
      return root.shell && root.shell.toggle(root.pluginId, "{}") ? "ok" : "unavailable"
    }
    function open(payloadB64: string): string {
      var json = payloadB64 ? Qt.atob(payloadB64) : "{}"
      return root.shell && root.shell.summon(root.pluginId, json) ? "ok" : "unavailable"
    }
    function run(commandId: string): string {
      return root.shell && root.shell.summon(root.pluginId, JSON.stringify({ command: commandId })) ? "ok" : "unavailable"
    }
    function search(text: string): string {
      return root.shell && root.shell.summon(root.pluginId, JSON.stringify({ query: text })) ? "ok" : "unavailable"
    }
    function reindex(): string { root.rebuildApps(); return "ok" }
    function status(): string {
      return JSON.stringify({ entries: root.entries.length, apps: root.appEntries.length, commands: root.commandEntries.length,
        hasShell: !!root.shell, stateDir: root.stateDir })
    }
  }

  Component.onCompleted: {
    mkdirProc.running = true
    hiddenScan.running = true
    iconIndexScan.running = true
    root.rebuildApps()
  }
}
