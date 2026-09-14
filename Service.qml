import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "lib/Score.js" as Score
import "lib/Frecency.js" as Frecency
import "lib/ViewModel.js" as VM
import "lib/Apps.js" as Apps
import "lib/Calc.js" as Calc
import "lib/Units.js" as Units
import "lib/RootPage.js" as RootPage
import "lib/OmarchyMenu.js" as Menu
import "lib/Inline.js" as Inline
import "builtins" as Builtins
import "ext" as Ext

// Headless core of the launcher, mounted once at shell start and kept alive
// while the window is hidden. Owns the search index (apps, commands, and
// everything else that shows up in root search), usage history, on-disk
// state, the built-in commands, and the IPC target other tools use to
// summon the launcher.
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
  //     enabled, favorite, primaryTitle, run(entry, window) }
  // run() returns true to keep the launcher open.
  property var entries: []
  property var appEntries: []
  property var commandEntries: []
  property int indexRevision: 0

  property var frecencyData: Frecency.empty()
  property bool frecencyDirty: false
  property var settings: ({ version: 1, commands: {}, favoritesOrder: [] })
  property var guardResults: ({})          // entry id -> { when, checked }
  property string lastCalcResult: ""       // `ans` for the inline calculator
  property var searchHistoryList: []       // newest first

  // Mirrors the window state for the bar button.
  property bool windowOpen: false

  property var builtinCatalog: []
  property var systemCatalog: []
  property var windowCatalog: []

  signal indexChanged()

  function now() { return Math.floor(Date.now() / 1000) }

  readonly property var handlers: ({
    "clipboard": clipboardBuiltin,
    "snippets": snippetsBuiltin,
    "quicklinks": quicklinksBuiltin,
    "windows": windowsBuiltin,
    "processes": processesBuiltin,
    "files": filesBuiltin,
    "shell": shellBuiltin,
    "omarchy-menu": omarchyMenuBuiltin,
    "emoji": emojiBuiltin,
    "dev-fixtures": devFixturesBuiltin,
    "preferences": preferencesBuiltin,
    "scripts": scriptsBuiltin,
    "notes": notesBuiltin,
    "focus": focusBuiltin,
    "reminders": remindersBuiltin,
    "colors": colorsBuiltin,
    "ai": aiBuiltin,
    "fallbacks": fallbacksBuiltin,
    "calculator": null
  })

  function catalogEntry(raw, kind, accessory) {
    var e = {
      id: "cmd:" + String(raw.id),
      kind: kind,
      title: String(raw.title || raw.id),
      subtitle: String(raw.subtitle || ""),
      keywords: (raw.keywords || []).slice(),
      aliases: [],
      baseAliases: (raw.aliases || []).slice(),
      icon: raw.icon || "󰘔",
      accessoryText: accessory,
      enabled: true,
      favorite: false,
      primaryTitle: raw.primaryTitle || (raw.handler ? "Open" : "Run"),
      raw: raw
    }
    if (raw.aliases) e.aliases = raw.aliases.slice()
    e.run = function(entry, win) { return root.runCatalogEntry(entry, win) }
    return e
  }

  function runCatalogEntry(entry, win) {
    var raw = entry.raw
    if (raw.handler) {
      if (raw.handler === "calculator") { if (win) win.setSearchText("1+1"); return true }
      var h = root.handlers[raw.handler]
      if (!h) return false
      h.open(win, raw.args || {})
      return true
    }
    var commandLine = raw.exec ? String(raw.exec) : (raw.action ? root.pluginDir + "/bin/wm.sh " + raw.action : "")
    if (!commandLine) return false
    var exec = function() {
      if (raw.delayMs) Quickshell.execDetached(["bash", "-lc", "sleep " + (Number(raw.delayMs) / 1000) + "; " + commandLine])
      else Quickshell.execDetached(["bash", "-lc", commandLine])
    }
    if (raw.confirm && win) {
      win.confirm(String(raw.confirm), String(raw.confirmText || entry.title), function() { exec(); win.dismiss() })
      return true
    }
    exec()
    // Toggles stay open and re-read their state so the ✓ follows.
    if (raw.keepOpen === true && raw.checked) recheckTimer.restart()
    return raw.keepOpen === true
  }

  Timer {
    id: recheckTimer
    interval: 700
    onTriggered: root.evaluateGuards()
  }

  function rebuildCommands() {
    var out = []
    for (var i = 0; i < root.builtinCatalog.length; i++) out.push(catalogEntry(root.builtinCatalog[i], "command", "Command"))
    for (var j = 0; j < root.systemCatalog.length; j++) out.push(catalogEntry(root.systemCatalog[j], "command", "System"))
    for (var k = 0; k < root.windowCatalog.length; k++) out.push(catalogEntry(root.windowCatalog[k], "command", "Window"))
    root.commandEntries = out
    root.rebuildIndex()
  }

  function rebuildIndex() {
    var all = root.appEntries.concat(root.commandEntries)
    var providers = [snippetsBuiltin, quicklinksBuiltin, windowsBuiltin, omarchyMenuBuiltin, scriptsBuiltin, aiBuiltin]
    for (var p = 0; p < providers.length; p++) {
      if (providers[p] && typeof providers[p].rootEntries === "function") {
        try { all = all.concat(providers[p].rootEntries()) } catch (e) { console.warn("launcher: provider failed", e) }
      }
    }
    try { all = all.concat(root.extensionEntries()) } catch (e2) { console.warn("launcher: extension entries failed", e2) }
    var overrides = root.settings && root.settings.commands ? root.settings.commands : {}
    var favs = root.favoritesOrder()
    var favSet = {}
    for (var f = 0; f < favs.length; f++) favSet[favs[f]] = true
    for (var i = 0; i < all.length; i++) {
      var e = all[i]
      e.enabled = true
      e.favorite = !!favSet[e.id]
      e.hotkey = ""
      e.aliases = (e.baseAliases || []).slice()
      if (e.accessoryIcon === undefined) e.accessoryIcon = ""
      if (e.dedupeKey === undefined) e.dedupeKey = e.raw && e.raw.exec ? String(e.raw.exec) : ""
      var o = overrides[e.id]
      if (o) {
        if (o.enabled === false) e.enabled = false
        if (o.alias) e.aliases = [String(o.alias)].concat(e.aliases)
        if (o.favorite === true && !Array.isArray(root.settings.favoritesOrder)) e.favorite = true
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

  function guardOk(entry) {
    var raw = entry.raw
    if (!raw || !raw.when) return true
    var g = root.guardResults[entry.id]
    return g === undefined ? true : g.when !== false
  }

  function isChecked(entry) {
    var raw = entry ? entry.raw : null
    if (!raw || !raw.checked) return false
    var g = root.guardResults[entry.id]
    return !!(g && g.checked)
  }

  // Ranked [{ entry, score }] for a query.
  function search(query, limit) {
    var scores = Frecency.scores(root.frecencyData, root.now())
    var q = String(query || "").trim()
    var pool = root.entries
    // Categories stay in the pool at every length (cheap, and their aliases
    // are what "settings"/"power-menu" should hit); leaves and windows need
    // two characters so single letters stay about apps and commands.
    if (q.length < 2) pool = pool.filter(function(e) { return e.kind !== "window" && e.kind !== "omarchy-menu" })
    pool = pool.filter(guardOk)
    return Score.rank(pool, q, scores, limit === undefined || limit === null ? 50 : limit)
  }

  // Frecency-ordered entries, minus windows, categories and excludeIds.
  function suggestions(limit, excludeIds) {
    var cap = limit || 8
    var skip = {}
    for (var x = 0; x < (excludeIds || []).length; x++) skip[excludeIds[x]] = true
    var ids = Frecency.top(root.frecencyData, root.now(), cap * 3)
    var out = []
    for (var i = 0; i < ids.length && out.length < cap; i++) {
      var e = root.entryById(ids[i])
      if (e && e.enabled !== false && e.kind !== "window" && e.kind !== "omarchy-category" && !skip[e.id] && guardOk(e)) out.push(e)
    }
    return out
  }

  // ------------------------------------------------------------- favorites

  function favoritesOrder() {
    var l = root.settings && Array.isArray(root.settings.favoritesOrder) ? root.settings.favoritesOrder : []
    return l.map(String)
  }

  function setFavoritesOrder(list) {
    root.setSetting("favoritesOrder", list)
  }

  function moveFavorite(entryId, delta) {
    var l = root.favoritesOrder()
    var i = l.indexOf(String(entryId))
    if (i < 0) return false
    var j = i + (delta < 0 ? -1 : 1)
    if (j < 0 || j >= l.length) return false
    var tmp = l[i]; l[i] = l[j]; l[j] = tmp
    root.setFavoritesOrder(l)
    return true
  }

  function recordUse(id) {
    root.frecencyData = Frecency.record(root.frecencyData, id, root.now())
    root.frecencyDirty = true
    saveTimer.restart()
  }

  // ------------------------------------------------------------- root view

  // Row anatomy: [icon] title subtitle … [alias pill] [hotkey] [✓] [type label] [›]
  function entryRow(e, opts) {
    var acc = []
    var userAlias = e.aliases && e.aliases.length && e.aliases[0] !== (e.baseAliases || [])[0] ? e.aliases[0] : ""
    if (userAlias) acc.push({ tag: userAlias })
    if (e.hotkey) acc.push({ hotkey: e.hotkey })
    if (root.isChecked(e)) acc.push({ icon: "✓" })
    if (e.accessoryText && !(opts && opts.compact)) acc.push({ text: e.accessoryText })
    if (e.accessoryIcon === "›") acc.push({ icon: "›" })
    return {
      id: e.id,
      title: e.title,
      subtitle: e.subtitle,
      icon: e.icon,
      keywords: e.keywords,
      accessories: acc,
      data: { entryId: e.id }
    }
  }

  // "alias text": an entry that takes a text argument, invoked with the
  // rest of the query (quicklinks with {query}, scripts and extension
  // commands with arguments).
  function argumentRow(q) {
    var sp = q.indexOf(" ")
    if (sp <= 0) return null
    var head = q.slice(0, sp).toLowerCase()
    var rest = q.slice(sp + 1).trim()
    if (!rest) return null
    var self = root
    for (var i = 0; i < root.entries.length; i++) {
      var e = root.entries[i]
      if (e.enabled === false || typeof e.runWithArgument !== "function") continue
      var match = false
      for (var a = 0; a < (e._aliases || []).length; a++) if (e._aliases[a] === head) match = true
      if (!match && e._name === head) match = true
      if (!match) continue
      return {
        id: "arg:" + e.id,
        title: e.title,
        subtitle: "with “" + rest + "”",
        icon: e.icon,
        accessories: [{ text: e.accessoryText || "" }],
        data: { entryId: e.id, argument: rest },
        actions: { sections: [{ actions: [
          { id: "run", title: e.primaryTitle || "Run", icon: "󰐊", run: function(item, win) { var en = self.entryById(item.data.entryId); if (!en) return false; self.recordUse(en.id); return en.runWithArgument(en, win, item.data.argument) === true } }
        ] }] }
      }
    }
    return null
  }

  // Rows for what the text *is*: a URL or a colour.
  function inlineRows(q) {
    var out = []
    var self = root
    var url = Inline.detectUrl(q)
    if (url) {
      out.push({
        id: "inline:url",
        title: "Open " + Inline.hostOf(url),
        subtitle: url,
        icon: "󰖟",
        accessories: [{ text: "URL" }],
        data: { url: url },
        actions: { sections: [{ actions: [
          { id: "open", title: "Open in Browser", icon: "󰖟", run: function(item) { Qt.openUrlExternally(item.data.url); return false } },
          { id: "copy", title: "Copy URL", icon: "󰆏", run: function(item) { Quickshell.execDetached(["wl-copy", "--", item.data.url]); return false } },
          { id: "quicklink", title: "Create Quicklink…", icon: "󰌹", run: function(item, win) { self.runCommandId("cmd:quicklinks-create", win, { mode: "create", name: Inline.hostOf(item.data.url), link: item.data.url }); return true } }
        ] }] }
      })
    }
    var color = Inline.parseColor(q)
    if (color) {
      var copyAction = function(id, label, text) {
        return { id: id, title: "Copy " + label, icon: "󰆏", run: function() { Quickshell.execDetached(["wl-copy", "--", text]); return false } }
      }
      out.push({
        id: "inline:color",
        title: color.formats.hex,
        subtitle: color.formats.rgb + "  ·  " + color.formats.hsl,
        icon: { kind: "swatch", value: color.hex },
        accessories: [{ text: "Color" }],
        data: { color: color },
        actions: { sections: [{ actions: [
          copyAction("hex", "HEX", color.formats.hex),
          copyAction("rgb", "RGB", color.formats.rgb),
          copyAction("hsl", "HSL", color.formats.hsl),
          copyAction("qml", "QML", color.formats.qml),
          { id: "paste-hex", title: "Paste HEX", icon: "󰆒", run: function(item, win) { win.dismiss(); Quickshell.execDetached(["bash", self.pluginDir + "/bin/paste.sh", item.data.color.formats.hex]); return false } }
        ] }] }
      })
    }
    return out
  }

  function calculatorRow(q) {
    var opts = { angle: root.settings && root.settings.calculator ? root.settings.calculator.angle : "deg" }
    var expr = q
    if (root.lastCalcResult && /\bans\b/i.test(expr)) expr = expr.replace(/\bans\b/gi, "(" + root.lastCalcResult + ")")
    var r = Calc.evaluate(expr, opts)
    var display, subtitle
    if (r.ok) { display = r.grouped; subtitle = q + " ="; root.lastCalcResult = String(r.value) }
    else {
      var u = Units.convert(q)
      if (!u.ok) return null
      display = u.display; subtitle = u.from + " ="
    }
    var self = root
    return {
      id: "calc:result",
      title: display,
      subtitle: subtitle,
      icon: "󰃬",
      accessories: [{ text: "Calculator" }],
      data: { result: display, expression: q },
      actions: { sections: [{ actions: [
        { id: "copy", title: "Copy Result", icon: "󰆏", run: function(item) { Quickshell.execDetached(["wl-copy", "--", String(item.data.result)]); return false } },
        { id: "paste", title: "Paste Result", icon: "󰆒", run: function(item, win) { win.dismiss(); Quickshell.execDetached(["bash", self.pluginDir + "/bin/paste.sh", String(item.data.result)]); return false } },
        { id: "copy-both", title: "Copy Expression and Result", icon: "󰆏", run: function(item) { Quickshell.execDetached(["wl-copy", "--", item.data.expression + " = " + item.data.result]); return false } }
      ] }] }
    }
  }

  // The root list is produced here, not by a builtin, because it must be
  // synchronous on every keystroke. `filtering: false` tells the pane that
  // the owner already applied the query.
  function pageSettings() {
    var s = root.settings || {}
    var sec = function(key, def) { var v = s[key]; var out = {}; for (var k in def) out[k] = v && v[k] !== undefined ? v[k] : def[k]; return out }
    return {
      suggestionsCap: s.suggestionsCap === undefined || s.suggestionsCap === null ? 5 : Math.max(0, Math.min(8, Number(s.suggestionsCap) || 0)),
      favoritesSection: sec("favoritesSection", { show: true }),
      suggestionsSection: sec("suggestionsSection", { show: true }),
      omarchySection: sec("omarchySection", { show: true, apps: true }),
      commandsSection: sec("commandsSection", { show: true, apps: true })
    }
  }

  // The empty page: Favorites → Suggestions → Omarchy → Commands (lib/RootPage.js).
  function emptyPageSections() {
    var scripts = 0
    try { scripts = scriptsBuiltin.rootEntries().length } catch (e) { scripts = 0 }
    var built = RootPage.buildRoot({
      entries: root.entries,
      favoritesOrder: root.favoritesOrder(),
      frecencyTop: Frecency.top(root.frecencyData, root.now(), 40),
      guardOk: root.guardOk,
      isChecked: root.isChecked,
      settings: root.pageSettings(),
      aiAvailable: aiBuiltin.available,
      extensionsCount: root.extensions.length,
      scriptsCount: scripts,
      row: root.entryRow
    })
    return built.sections
  }

  function rootView(query) {
    var sections = []
    var loading = false
    var q = String(query || "").trim()
    if (!q) {
      sections = root.emptyPageSections()
    } else if (/^(~\/?|\/)/.test(q)) {
      // Paths browse the file system inline; Enter on the last row opens the
      // full file search with the preview pane.
      var self = root
      var frows = filesBuiltin.rootRows(q)
      frows.push({ id: "files:open", title: "Search Files for “" + q + "”", icon: "󰱽", accessories: [{ text: "Command" }], data: {},
        actions: { sections: [{ actions: [ { id: "open", title: "Open", icon: "󰱽", run: function(item, win) { self.runCommandId("cmd:files", win, { query: q }); return true } } ] }] } })
      sections.push({ id: "files", title: "Files", items: frows })
      loading = filesBuiltin.rootPending
    } else {
      var inline = root.inlineRows(q)
      var calc = root.calculatorRow(q)
      if (calc) inline.unshift(calc)
      var withArg = root.argumentRow(q)
      if (withArg) inline.unshift(withArg)
      if (inline.length) sections.push({ id: "inline", title: "", items: inline })
      var ranked = root.search(q, 50)
      var rows = []
      for (var r = 0; r < ranked.length; r++) rows.push(entryRow(ranked[r].entry))
      if (rows.length) sections.push({ id: "results", title: inline.length ? "Results" : "", items: rows })
      var strong = ranked.length && ranked[0].score >= 9000
      if (!strong || rows.length < 3) {
        // Spotlight-style: a few ranked files when the index has little to say.
        if (q.length >= 3) {
          var frows = filesBuiltin.rootRows(q, 5)
          if (frows.length) sections.push({ id: "files", title: "Files", items: frows })
          loading = loading || filesBuiltin.rootPending
        }
        var fb = fallbacksBuiltin.items(q)
        if (fb.length) sections.push({ id: "fallback", title: rows.length ? "Use “" + q + "” with…" : "", accessory: { text: "Edit" }, items: fb })
      }
    }
    var placeholder = root.settings && root.settings.rootPlaceholder ? String(root.settings.rootPlaceholder) : "Search apps and commands…"
    return VM.normalizeView({
      id: "root",
      type: "list",
      filtering: false,
      searchBarPlaceholder: placeholder,
      searchText: q,
      isLoading: loading,
      sections: sections,
      emptyView: { icon: "󰍉", title: q ? "No results for “" + q + "”" : "Nothing here yet" }
    })
  }

  // Run an entry. Returns true when the launcher should close afterwards.
  function activateEntry(entry, win) {
    if (!entry) return false
    root.recordUse(entry.id)
    if (typeof entry.run === "function") {
      var keepOpen = entry.run(entry, win) === true
      return !keepOpen
    }
    return true
  }

  function runCommandId(commandId, win, args) {
    var id = String(commandId || "")
    var entry = root.entryById(id.indexOf(":") >= 0 ? id : "cmd:" + id)
    if (!entry) { if (win) win.showToast({ style: "failure", title: "Unknown command", message: id }); return }
    if (args && entry.raw && entry.raw.handler && root.handlers[entry.raw.handler]) {
      root.recordUse(entry.id)
      root.handlers[entry.raw.handler].open(win, Object.assign({}, entry.raw.args || {}, args))
      return
    }
    if (root.activateEntry(entry, win) && win) win.dismiss()
  }

  // Action panel for a root entry.
  function entryActions(entry) {
    var self = root
    var isCategory = entry.kind === "omarchy-category"
    var primary = { id: "primary", title: entry.primaryTitle || (entry.kind === "app" ? "Open" : "Run"), icon: entry.kind === "app" ? "󰏌" : (isCategory && entry.accessoryIcon ? "󰍜" : "󰐊"),
      run: function(item, win) { return !self.activateEntry(entry, win) } }
    var secondary = []
    if (entry.kind === "app" && entry.desktopActions && entry.desktopActions.length) {
      for (var d = 0; d < entry.desktopActions.length; d++) {
        (function(da) {
          secondary.push({ id: "desktop-action:" + da.id, title: da.name, icon: "󰏌", run: function(item, win) { self.recordUse(entry.id); self.launchDesktopAction(entry, da); return false } })
        })(entry.desktopActions[d])
      }
    }
    if (!isCategory || entry.accessoryIcon !== "›") {
      secondary.push({ id: "favorite", title: entry.favorite ? "Remove from Favorites" : "Add to Favorites", icon: entry.favorite ? "󰓎" : "󰓒",
        shortcut: { modifiers: ["ctrl", "shift"], key: "f", label: "⌃⇧F" },
        run: function(item, win) { self.toggleFavorite(entry.id, win); return true } })
    }
    if (entry.favorite) {
      var favs = self.favoritesOrder()
      var pos = favs.indexOf(entry.id)
      if (pos > 0) secondary.push({ id: "move-fav-up", title: "Move Favorite Up", icon: "󰁝", shortcut: { modifiers: ["ctrl", "shift"], key: "arrowUp", label: "⌃⇧↑" },
        run: function(item, win) { self.moveFavorite(entry.id, -1); if (win) win.onSearchEdited(win.searchTextValue()); return true } })
      if (pos >= 0 && pos < favs.length - 1) secondary.push({ id: "move-fav-down", title: "Move Favorite Down", icon: "󰁅", shortcut: { modifiers: ["ctrl", "shift"], key: "arrowDown", label: "⌃⇧↓" },
        run: function(item, win) { self.moveFavorite(entry.id, 1); if (win) win.onSearchEdited(win.searchTextValue()); return true } })
    }
    if (entry.kind === "app") {
      secondary.push({ id: "copy-name", title: "Copy Application Name", icon: "󰆏", run: function() { Quickshell.execDetached(["wl-copy", "--", entry.title]); return false } })
    } else if (entry.raw && (entry.raw.exec || entry.raw.action) && !isCategory) {
      secondary.push({ id: "copy-cmd", title: "Copy Command", icon: "󰆏", run: function() { Quickshell.execDetached(["wl-copy", "--", entry.raw.exec || (self.pluginDir + "/bin/wm.sh " + entry.raw.action)]); return false } })
    } else if (entry.menuEntry && entry.menuEntry.action) {
      secondary.push({ id: "copy-cmd", title: "Copy Command", icon: "󰆏", run: function() { Quickshell.execDetached(["wl-copy", "--", String(entry.menuEntry.action)]); return false } })
    }
    if (!isCategory) {
      secondary.push({ id: "configure", title: "Configure Command…", icon: "󰢻", shortcut: { modifiers: ["ctrl", "shift"], key: ",", label: "⌃⇧," },
        run: function(item, win) { preferencesBuiltin.configure(win, entry); return true } })
    }
    secondary.push({ id: "copy-deeplink", title: "Copy Deeplink", icon: "󰌹", run: function() {
      var link = isCategory && entry.menuEntry ? "omarchy-shell " + self.pluginId + " menu " + JSON.stringify(entry.menuEntry.id) : "omarchy-shell " + self.pluginId + " run " + JSON.stringify(entry.id)
      Quickshell.execDetached(["wl-copy", "--", link]); return false } })
    var danger = []
    if (Frecency.score(root.frecencyData, entry.id, root.now()) > 0) {
      danger.push({ id: "reset-ranking", title: "Reset Ranking", icon: "󰑓", shortcut: { modifiers: ["ctrl", "shift"], key: "r", label: "⌃⇧R" },
        run: function(item, win) { self.resetRanking(entry.id, win); return true } })
    }
    if (!isCategory) {
      danger.push({ id: "disable", title: entry.kind === "app" ? "Hide from Launcher" : "Disable Command", icon: "󰛑", style: "destructive", shortcut: { modifiers: ["ctrl", "shift"], key: "d", label: "⌃⇧D" },
        run: function(item, win) { self.disableEntry(entry.id, win); return true } })
    }
    if (entry.kind === "app") {
      danger.push({ id: "uninstall", title: "Uninstall Application", icon: "󰆴", style: "destructive", shortcut: { modifiers: [], key: "deleteForward", label: "⌦" },
        run: function(item, win) { self.uninstallApp(entry.id, win); return true } })
    }
    var sections = [{ actions: [primary] }, { actions: secondary }]
    if (danger.length) sections.push({ actions: danger })
    return { title: entry.title, sections: sections }
  }

  function resetRanking(entryId, win) {
    var e = root.entryById(entryId)
    root.frecencyData = Frecency.forget(root.frecencyData, String(entryId))
    root.frecencyDirty = true
    saveTimer.restart()
    root.indexRevision += 1
    root.indexChanged()
    if (win) win.showToast({ style: "success", title: "Ranking reset", message: e ? e.title : String(entryId) })
  }

  function disableEntry(entryId, win) {
    var e = root.entryById(entryId)
    if (!e) return
    var verb = e.kind === "app" ? "Hide " : "Disable "
    var doIt = function() {
      root.setCommandOverride(e.id, { enabled: false })
      if (win) win.showToast({ style: "success", title: (e.kind === "app" ? "Hidden " : "Disabled ") + e.title, message: "Re-enable it in Preferences › Commands" })
    }
    if (win) win.confirm(verb + e.title + (e.kind === "app" ? " from the launcher?" : "? It disappears from search until re-enabled."), e.kind === "app" ? "Hide" : "Disable", doIt)
    else doIt()
  }

  function uninstallApp(entryId, win) {
    var e = root.entryById(entryId)
    if (!e || e.kind !== "app") return
    var doIt = function() {
      Quickshell.execDetached([root.omarchyPath + "/bin/omarchy-remove-launcher-entry", String(e.desktopId), String(e.title)])
      if (win) win.dismiss()
    }
    if (win) win.confirm("Uninstall " + e.title + "? Omarchy removes the package or web app behind it.", "Uninstall", doIt)
    else doIt()
  }

  function setSetting(key, value) {
    var patch = {}
    patch[key] = value
    root.setSettings(patch)
  }

  // Assign several keys, write settings.json once, rebuild once.
  function setSettings(patch) {
    var s = root.settings && typeof root.settings === "object" ? root.settings : { version: 1 }
    for (var k in patch) { if (patch[k] === undefined) delete s[k]; else s[k] = patch[k] }
    s.version = 1
    root.settings = s
    settingsFile.setText(JSON.stringify(s, null, 2) + "\n")
    root.rebuildIndex()
  }

  function setCommandOverride(entryId, patch) {
    var s = root.settings && typeof root.settings === "object" ? root.settings : { version: 1 }
    if (!s.commands || typeof s.commands !== "object") s.commands = {}
    var cur = s.commands[entryId] || {}
    for (var k in patch) cur[k] = patch[k]
    s.commands[entryId] = cur
    s.version = 1
    root.settings = s
    settingsFile.setText(JSON.stringify(s, null, 2) + "\n")
    root.rebuildIndex()
  }

  function toggleFavorite(entryId, win) {
    var e = root.entryById(entryId)
    if (!e) return
    var next = !e.favorite
    var l = root.favoritesOrder().filter(function(id) { return id !== e.id })
    if (next) l.push(e.id)
    // Keep the legacy flag in sync so older settings readers agree.
    var s = root.settings && typeof root.settings === "object" ? root.settings : { version: 1 }
    if (!s.commands || typeof s.commands !== "object") s.commands = {}
    var cur = s.commands[e.id] || {}
    cur.favorite = next
    s.commands[e.id] = cur
    root.settings = s
    root.setFavoritesOrder(l)
    if (win) {
      win.showToast({ style: "success", title: next ? "Added to Favorites" : "Removed from Favorites", message: e.title })
      win.onSearchEdited(win.searchTextValue())
    }
  }

  // ------------------------------------------------------------- guards

  // Evaluate the when/checked guards that decide what the root shows, in one
  // bash call through the stock menu's prelude (package cache, reader slots):
  // every catalog command with a guard, the Omarchy categories and their
  // direct children, and the Omarchy leaves currently on the page. Runs when
  // the window opens; rows render from the previous answers meanwhile.
  property bool guardsPending: false
  property bool deepGuardsPending: false
  property double deepGuardsAt: 0
  function evaluateGuards() {
    var list = []
    var all = root.commandEntries
    for (var i = 0; i < all.length; i++) {
      var raw = all[i].raw
      if (raw && (raw.when || raw.checked)) list.push({ id: all[i].id, when: raw.when, checked: raw.checked })
    }
    try {
      list = list.concat(omarchyMenuBuiltin.shallowGuardEntries())
      var onPage = root.favoritesOrder().concat(Frecency.top(root.frecencyData, root.now(), 20))
      list = list.concat(omarchyMenuBuiltin.guardLinesFor(onPage))
    } catch (e) { console.warn("launcher: omarchy guard scope failed", e) }
    root.runGuardBatch(list, false)
  }

  // The rest of the tree (deeper Omarchy leaves such as Install › Browser ›
  // Chrome) is evaluated in a second batch after the shallow one lands, at
  // most every ten minutes: it costs ~2.5 s of pacman queries in the
  // background and only affects what typing can surface.
  function evaluateDeepGuards() {
    if (Date.now() - root.deepGuardsAt < 10 * 60 * 1000) return
    var list = []
    try { list = omarchyMenuBuiltin.deepGuardEntries() } catch (e) { list = [] }
    if (!list.length) return
    root.deepGuardsAt = Date.now()
    root.runGuardBatch(list, true)
  }

  function runGuardBatch(list, deep) {
    var seen = {}
    list = list.filter(function(g) { if (seen[g.id]) return false; seen[g.id] = true; return true })
    var script = Menu.guardScript(list)
    if (!script) return
    if (guardProc.running) { if (deep) root.deepGuardsPending = true; else root.guardsPending = true; return }
    if (deep) root.deepGuardsPending = false; else root.guardsPending = false
    guardProc.deep = deep
    guardProc.collected = ""
    guardProc.command = ["bash", "-lc", script]
    guardProc.running = true
  }

  Process {
    id: guardProc
    property string collected: ""
    property bool deep: false
    stdout: SplitParser { onRead: function(line) { guardProc.collected += line + "\n" } }
    onExited: function(exitCode, exitStatus) {
      var wasDeep = guardProc.deep
      var followUp = function() {
        if (root.guardsPending) root.evaluateGuards()
        else if (root.deepGuardsPending) root.evaluateDeepGuards()
        else if (!wasDeep) root.evaluateDeepGuards()
      }
      // A killed batch answered only for the rows it reached; keep the last
      // complete map rather than let half an answer through.
      if (exitCode !== 0 || exitStatus !== 0) {
        if (wasDeep) root.deepGuardsAt = 0
        Qt.callLater(followUp)
        return
      }
      var lines = guardProc.collected.split("\n")
      var next = {}
      var any = false
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^([WC]) (\S+) ([01])$/)
        if (!m) continue
        any = true
        var g = next[m[2]] || {}
        if (m[1] === "W") g.when = m[3] === "1"; else g.checked = m[3] === "1"
        next[m[2]] = g
      }
      if (any) {
        // The shallow batch is authoritative for what it covers; the deep
        // batch only adds ids the shallow one never answers.
        if (wasDeep) { var merged = {}; for (var k in root.guardResults) merged[k] = root.guardResults[k]; for (var d in next) merged[d] = next[d]; root.guardResults = merged }
        else { var kept = {}; for (var k2 in root.guardResults) if (String(k2).indexOf("omenu:") === 0 && next[k2] === undefined) kept[k2] = root.guardResults[k2]; for (var n in next) kept[n] = next[n]; root.guardResults = kept }
        try { omarchyMenuBuiltin.mergeGuards(next) } catch (e) {}
        // Category subtitles preview visible children, so rebuild the index
        // (it also emits indexChanged, which re-renders the root).
        root.rebuildIndex()
      }
      Qt.callLater(followUp)
    }
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
    root.beginLaunchFeedback(name)
    // Same launch path as the stock menu: uwsm-app scopes the app under
    // app-graphical.slice, gtk-launch resolves the desktop id.
    Quickshell.execDetached(["uwsm-app", "--", "gtk-launch", id + ".desktop"])
  }

  // A .desktop [Desktop Action] (e.g. "New Private Window"), scoped like the
  // app itself.
  function launchDesktopAction(entry, action) {
    var cmd = action && action.command ? Apps.listToArray(action.command) : []
    if (!cmd.length) return
    root.beginLaunchFeedback(action.name || entry.title)
    Quickshell.execDetached(["uwsm-app", "--"].concat(cmd))
  }

  // Launch feedback, as the stock launcher does it: if no new window shows
  // up within two seconds, an OSD says the app is starting; it closes when
  // a toplevel appears or after fifteen seconds.
  property int launchSerial: 0
  property int launchToplevelCount: 0
  property var launchActiveToplevel: null
  property string launchOsdMessage: ""
  property bool launchOsdOpen: false
  function toplevelCount() { try { return ToplevelManager.toplevels.values.length } catch (e) { return 0 } }
  function beginLaunchFeedback(name) {
    root.launchSerial += 1
    root.launchToplevelCount = root.toplevelCount()
    root.launchActiveToplevel = ToplevelManager.activeToplevel
    root.launchOsdMessage = "Launching " + String(name || "application") + "…"
    launchDelay.restart()
    launchTimeout.restart()
  }
  function closeLaunchFeedback() {
    launchDelay.stop()
    launchTimeout.stop()
    if (root.launchOsdOpen) {
      Quickshell.execDetached(["omarchy-shell", "osd", "close"])
      root.launchOsdOpen = false
    }
  }
  function maybeFinishLaunchFeedback() {
    if (!launchDelay.running && !launchTimeout.running && !root.launchOsdOpen) return
    if (root.toplevelCount() > root.launchToplevelCount || ToplevelManager.activeToplevel !== root.launchActiveToplevel) root.closeLaunchFeedback()
  }
  Connections {
    target: ToplevelManager.toplevels
    ignoreUnknownSignals: true
    function onValuesChanged() { root.maybeFinishLaunchFeedback() }
  }
  Connections {
    target: ToplevelManager
    ignoreUnknownSignals: true
    function onActiveToplevelChanged() { root.maybeFinishLaunchFeedback() }
  }
  Timer {
    id: launchDelay
    interval: 2000
    onTriggered: {
      if (root.toplevelCount() > root.launchToplevelCount || ToplevelManager.activeToplevel !== root.launchActiveToplevel) return
      root.launchOsdOpen = true
      Quickshell.execDetached(["omarchy-shell", "osd", "show", JSON.stringify({ icon: "󱓞", message: root.launchOsdMessage, duration: 0 })])
    }
  }
  Timer {
    id: launchTimeout
    interval: 15000
    onTriggered: root.closeLaunchFeedback()
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
      var dactions = []
      try {
        var acts = app.actions || []
        for (var a = 0; a < acts.length; a++) if (acts[a] && acts[a].name) dactions.push({ id: String(acts[a].id || a), name: String(acts[a].name), command: acts[a].command })
      } catch (e2) { dactions = [] }
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
        primaryTitle: "Open",
        desktopId: id,
        desktopActions: dactions,
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
  property double lastIconScan: 0
  function onWindowOpened() {
    var t = Date.now()
    if (t - root.lastIconScan > 10 * 60 * 1000 && !iconIndexScan.running) { root.lastIconScan = t; iconIndexScan.running = true }
    if (root.appEntries.length === 0) root.rebuildApps()
    root.evaluateGuards()
    scriptsBuiltin.onWindowOpened()
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
    onStarted: { root.pendingIconIndex = ({}); root.lastIconScan = Date.now() }
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

  // ------------------------------------------------------------- builtins

  Builtins.Clipboard { id: clipboardBuiltin; service: root }
  Builtins.Snippets { id: snippetsBuiltin; service: root }
  Builtins.Quicklinks { id: quicklinksBuiltin; service: root }
  Builtins.Windows { id: windowsBuiltin; service: root }
  Builtins.Processes { id: processesBuiltin; service: root }
  Builtins.Files { id: filesBuiltin; service: root }
  Builtins.ShellCommand { id: shellBuiltin; service: root }
  Builtins.OmarchyMenu { id: omarchyMenuBuiltin; service: root }
  Builtins.Emoji { id: emojiBuiltin; service: root }
  Builtins.DevFixtures { id: devFixturesBuiltin; service: root }
  Builtins.Preferences { id: preferencesBuiltin; service: root }
  Builtins.Scripts { id: scriptsBuiltin; service: root }
  Builtins.Notes { id: notesBuiltin; service: root }
  Builtins.Focus { id: focusBuiltin; service: root }
  Builtins.Reminders { id: remindersBuiltin; service: root }
  Builtins.Colors { id: colorsBuiltin; service: root }
  Builtins.Ai { id: aiBuiltin; service: root }
  Builtins.Arguments { id: argumentsBuiltin; service: root }
  Builtins.Fallbacks { id: fallbacksBuiltin; service: root }
  readonly property var ai: aiBuiltin

  // ------------------------------------------------------------- extensions

  Ext.ExtensionHost { id: extensionHost; service: root; aiChunkListener: function(id, text) { aiBuiltin.onChunk(id, text) } }
  readonly property var extHost: extensionHost
  property var extensions: []                 // from ~/.local/share/omarchy-launcher/extensions/index.json
  property var extensionSubtitles: ({})       // "ext/cmd" -> subtitle from updateCommandMetadata
  readonly property string extensionsIndexPath: home + "/.local/share/omarchy-launcher/extensions/index.json"

  FileView {
    id: extensionsIndex
    path: root.extensionsIndexPath
    watchChanges: true
    printErrors: false
    onLoaded: { try { var d = JSON.parse(text()); root.extensions = d && Array.isArray(d.extensions) ? d.extensions : [] } catch (e) { root.extensions = [] } root.rebuildIndex() }
    onLoadFailed: { root.extensions = []; root.rebuildIndex() }
    onFileChanged: reload()
  }

  function extensionEntries() {
    var out = []
    for (var i = 0; i < root.extensions.length; i++) {
      var ext = root.extensions[i]
      for (var j = 0; j < (ext.commands || []).length; j++) {
        var cmd = ext.commands[j]
        var compat = cmd.compat && cmd.compat.status ? cmd.compat.status : "full"
        var unsupported = compat === "unsupported"
        var subtitleKey = ext.id + "/" + cmd.name
        out.push({
          id: "ext:" + ext.id + "/" + cmd.name,
          kind: "extension",
          title: String(cmd.title || cmd.name),
          subtitle: unsupported ? "macOS only" : (cmd.mode === "menu-bar" ? (root.menuBarActive(ext.id + "/" + cmd.name) ? "In the bar" : "Menu-bar command") : String(root.extensionSubtitles[subtitleKey] || cmd.subtitle || "")),
          keywords: (cmd.keywords || []).concat([ext.title || "", ext.name || "", cmd.description || ""]),
          aliases: [], baseAliases: [],
          icon: cmd.icon ? { kind: "image", value: "file://" + cmd.icon } : (ext.icon ? { kind: "image", value: "file://" + ext.icon } : "󰑣"),
          accessoryText: String(ext.title || ext.name),
          enabled: !unsupported && cmd.disabledByDefault !== true,
          favorite: false,
          primaryTitle: cmd.mode === "no-view" ? "Run" : (cmd.mode === "menu-bar" ? (root.menuBarActive(ext.id + "/" + cmd.name) ? "Show Items" : "Add to Bar") : "Open"),
          extension: ext,
          command: cmd,
          acceptsArgument: (cmd.arguments || []).length > 0,
          run: function(e, win) { return root.runExtensionEntry(e, win, null) },
          runWithArgument: function(e, win, text) { return root.runExtensionEntry(e, win, text) }
        })
      }
    }
    return out
  }

  // Launch an extension command from its root entry. Commands that declare
  // `arguments` prompt for them first (or take the typed text as the first
  // one, Raycast's "alias text" contract).
  function runExtensionEntry(e, win, text) {
    if (root.missingRequiredPrefs(e.extension, e.command).length) { preferencesBuiltin.configureExtension(win, e.extension, e.command, true); return true }
    if (e.command.mode === "menu-bar") {
      var key = e.extension.id + "/" + e.command.name
      if (root.menuBarActive(key)) { win.pushView(root.menubarView(key), null); return true }
      root.setMenuBarActive(key, true)
      win.showToast({ style: "success", title: "Added to the bar", message: e.command.title })
      return true
    }
    var defs = e.command.arguments || []
    var values = {}
    if (defs.length && text !== null && text !== undefined && String(text).length) values[String(defs[0].name || "arg1")] = String(text)
    var missingRequired = defs.some(function(a, i) { return a.required && !values[String(a.name || ("arg" + (i + 1)))] })
    if (missingRequired && win) {
      argumentsBuiltin.prompt(win, e.command.title, defs, function(vals) { extensionHost.launch(e.extension, e.command, win, { arguments: vals }) })
      return true
    }
    extensionHost.launch(e.extension, e.command, win, { arguments: values })
    return true
  }

  // Ask for named arguments with a pushed form, then call onDone(values).
  function promptArguments(win, title, defs, onDone) { argumentsBuiltin.prompt(win, title, defs, onDone) }

  function findExtension(extId) {
    for (var i = 0; i < root.extensions.length; i++) if (root.extensions[i].id === extId || root.extensions[i].name === extId) return root.extensions[i]
    return null
  }

  function launchExtensionCommand(extId, commandName, win, args) {
    var ext = root.findExtension(String(extId))
    if (!ext) return false
    var cmd = null
    for (var j = 0; j < (ext.commands || []).length; j++) if (ext.commands[j].name === commandName) cmd = ext.commands[j]
    if (!cmd) return false
    if (!win) return false
    extensionHost.launch(ext, cmd, win, args || {})
    return true
  }

  function setExtensionSubtitle(extId, commandName, subtitle) {
    var next = ({})
    for (var k in root.extensionSubtitles) next[k] = root.extensionSubtitles[k]
    next[extId + "/" + commandName] = subtitle === null || subtitle === undefined ? "" : String(subtitle)
    root.extensionSubtitles = next
    root.rebuildIndex()
  }

  // Merged preference values: manifest defaults, extension-level values,
  // then command-level values from ~/.config/omarchy-launcher/prefs/<owner>.<name>.json
  property var extensionPrefs: ({})
  function extensionPreferences(ext, cmd) {
    var out = {}
    var stored = root.extensionPrefs[ext.id] || {}
    var apply = function(defs, values) {
      for (var i = 0; i < (defs || []).length; i++) {
        var d = defs[i]
        var v = values && values[d.name] !== undefined ? values[d.name] : d["default"]
        if (d.type === "checkbox") v = v === true || v === "true"
        if (v !== undefined) out[d.name] = v
      }
    }
    apply(ext.preferences, stored[""])
    apply(cmd.preferences, stored[cmd.name])
    return out
  }

  function missingRequiredPrefs(ext, cmd) {
    var values = root.extensionPreferences(ext, cmd)
    var missing = []
    var check = function(defs) { for (var i = 0; i < (defs || []).length; i++) { var d = defs[i]; if (d.required && (values[d.name] === undefined || values[d.name] === "")) missing.push(d) } }
    check(ext.preferences)
    check(cmd ? cmd.preferences : [])
    return missing
  }

  function saveExtensionPrefs(extId, data) {
    var next = ({})
    for (var k in root.extensionPrefs) next[k] = root.extensionPrefs[k]
    next[extId] = data
    root.extensionPrefs = next
    var file = root.configDir + "/prefs/" + String(extId).replace("/", ".") + ".json"
    Quickshell.execDetached(["bash", "-c", "mkdir -p \"$(dirname \"$1\")\" && printf '%s\n' \"$2\" > \"$1\" && chmod 600 \"$1\"", "--", file, JSON.stringify(data, null, 2)])
  }

  function loadExtensionPrefs() { prefsLoader.running = true }
  Process {
    id: prefsLoader
    command: ["bash", "-c", "cd " + JSON.stringify(root.configDir + "/prefs") + " 2>/dev/null || exit 0; for f in *.json; do [[ -f $f ]] || continue; printf '===%s===\n' \"${f%.json}\"; cat \"$f\"; printf '\n=== EOM ===\n'; done"]
    stdout: StdioCollector {
      onStreamFinished: {
        var out = {}
        var blocks = String(text || "").split("=== EOM ===")
        for (var i = 0; i < blocks.length; i++) {
          var m = blocks[i].match(/===(.+?)===\n([\s\S]*)$/)
          if (!m) continue
          try { out[m[1].replace(".", "/")] = JSON.parse(m[2]) } catch (e) {}
        }
        root.extensionPrefs = out
      }
    }
  }

  function onWindowClosed() { extensionHost.onWindowClosed() }

  // ---- menu-bar commands: which ones the user keeps in the bar (settings.menuBarCommands)
  readonly property var menubars: extensionHost.menubars
  function menuBarActive(key) { var l = root.settings && root.settings.menuBarCommands; return Array.isArray(l) && l.indexOf(key) >= 0 }
  function setMenuBarActive(key, active) {
    var l = (root.settings && Array.isArray(root.settings.menuBarCommands) ? root.settings.menuBarCommands : []).filter(function(k) { return k !== key })
    if (active) l.push(key)
    root.setSetting("menuBarCommands", l)
    var parts = key.split("/")
    var ext = root.findExtension(parts[0] + "/" + parts[1])
    var cmd = ext ? (ext.commands || []).filter(function(c) { return c.name === parts[2] })[0] : null
    if (active && ext && cmd) extensionHost.launchMenuBar(ext, cmd)
    if (!active) extensionHost.stopMenuBar(key)
  }
  function startMenuBars() {
    var l = root.settings && Array.isArray(root.settings.menuBarCommands) ? root.settings.menuBarCommands : []
    for (var i = 0; i < l.length; i++) {
      var parts = String(l[i]).split("/")
      var ext = root.findExtension(parts[0] + "/" + parts[1])
      var cmd = ext ? (ext.commands || []).filter(function(c) { return c.name === parts[2] })[0] : null
      if (ext && cmd && !extensionHost.menubarSession(l[i])) extensionHost.launchMenuBar(ext, cmd)
    }
  }
  property bool menuBarsStarted: false
  onExtensionsChanged: if (root.extensions.length && !root.menuBarsStarted && root.settings) { root.menuBarsStarted = true; Qt.callLater(root.startMenuBars) }

  // Items of a menu-bar command as a list view for the launcher window.
  function menubarView(key) {
    var mb = null
    for (var i = 0; i < root.menubars.length; i++) if (root.menubars[i].key === key) mb = root.menubars[i]
    var items = []
    var self = root
    var walk = function(list, section) {
      for (var j = 0; j < (list || []).length; j++) {
        var it = list[j]
        if (it.kind === "item") items.push({ id: "mb" + items.length, title: String(it.title || ""), subtitle: String(it.subtitle || ""), icon: it.icon || null, data: { cb: it.callbackId }, keywords: [section],
          actions: { sections: [{ actions: [ { id: "run", title: "Run", run: function(item) { self.extHost.menubarInvoke(key, item.data.cb); return false } } ] }] } })
        else if (it.kind === "submenu" || it.kind === "section") walk(it.items, String(it.title || section))
      }
    }
    if (mb) walk(mb.items, "")
    var parts = key.split("/")
    var cmdTitle = mb ? (mb.tooltip || mb.title || key) : key
    return { id: "menubar:" + key, type: "list", navigationTitle: cmdTitle, searchBarPlaceholder: "Search…", filtering: true, isLoading: mb ? mb.isLoading : true, items: items,
      emptyView: { icon: "󰍜", title: mb ? "No items" : "Not running" },
      actions: { actions: [ { id: "remove", title: "Remove from Bar", style: "destructive", run: function() { self.setMenuBarActive(key, false); return false } } ] } }
  }

  // Raycast icon names -> Nerd Font glyphs (data/icons.json).
  property var raycastIcons: ({})
  function raycastGlyph(name) {
    var g = root.raycastIcons[String(name)]
    return g ? g : "󰘔"
  }
  FileView {
    path: root.pluginDir + "/data/icons.json"
    printErrors: false
    onLoaded: { try { root.raycastIcons = JSON.parse(text()) || {} } catch (e) { root.raycastIcons = {} } }
  }

  // The floating notes window lives in Launcher.qml and registers itself here.
  property var notesWindow: null
  function noteSaved(id, text) { notesBuiltin.noteSaved(id, text) }
  readonly property bool focusActive: focusBuiltin.active
  readonly property string focusRemaining: focusBuiltin.active ? focusBuiltin.remainingText() : ""

  function parseCatalog(raw) {
    try { var d = JSON.parse(raw); return Array.isArray(d) ? d : [] } catch (e) { console.warn("launcher: bad catalog", e); return [] }
  }

  FileView {
    path: root.pluginDir + "/data/builtins.json"
    printErrors: false
    onLoaded: { root.builtinCatalog = root.parseCatalog(text()); root.rebuildCommands() }
  }
  FileView {
    path: root.pluginDir + "/data/system-commands.json"
    printErrors: false
    onLoaded: { root.systemCatalog = root.parseCatalog(text()); root.rebuildCommands() }
  }
  FileView {
    path: root.pluginDir + "/data/window-actions.json"
    printErrors: false
    onLoaded: { root.windowCatalog = root.parseCatalog(text()); root.rebuildCommands() }
  }

  // ------------------------------------------------------------- state files

  Process {
    id: mkdirProc
    command: ["mkdir", "-p", root.stateDir, root.configDir]
    onExited: { frecencyFile.reload(); settingsFile.reload(); historyFile.reload(); snippetsBuiltin.reload(); quicklinksBuiltin.reload() }
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
      var next = data && typeof data === "object" ? data : { version: 1, commands: {} }
      var migrated = RootPage.migrateFavorites(next)
      root.settings = migrated.settings
      if (migrated.migrated) settingsFile.setText(JSON.stringify(root.settings, null, 2) + "\n")
      root.rebuildIndex()
    }
    onLoadFailed: root.settings = { version: 1, commands: {}, favoritesOrder: [] }
    onFileChanged: reload()
  }

  // Root queries that led somewhere, newest first (↑ on the first row recalls them).
  FileView {
    id: historyFile
    path: root.stateDir + "/search-history.json"
    atomicWrites: true
    printErrors: false
    onLoaded: { try { var h = JSON.parse(text()); root.searchHistoryList = Array.isArray(h) ? h.map(String) : [] } catch (e) { root.searchHistoryList = [] } }
    onLoadFailed: root.searchHistoryList = []
  }
  function searchHistory() { return root.searchHistoryList }
  function recordSearch(query) {
    var q = String(query || "").trim()
    if (!q) return
    if (root.settings && root.settings.searchHistory && root.settings.searchHistory.enabled === false) return
    var l = [q].concat(root.searchHistoryList.filter(function(x) { return x !== q })).slice(0, 50)
    root.searchHistoryList = l
    historyFile.setText(JSON.stringify(l) + "\n")
  }
  function clearSearchHistory() {
    root.searchHistoryList = []
    historyFile.setText("[]\n")
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
    // omarchy-shell <plugin> menu settings   (menu id or jsonc alias, like `omarchy menu summon`)
    function menu(name: string): string {
      return root.shell && root.shell.summon(root.pluginId, JSON.stringify({ menu: name || "root" })) ? "ok" : "unavailable"
    }
    function reindex(): string { root.rebuildApps(); extensionsIndex.reload(); return "ok" }
    function oauth(payloadB64: string): string {
      var params = {}
      try { params = JSON.parse(Qt.atob(payloadB64 || "")) } catch (e) { return "bad payload" }
      return extensionHost.oauthCallback(params) ? "ok" : "no pending authorization"
    }
    function status(): string {
      return JSON.stringify({ entries: root.entries.length, apps: root.appEntries.length, commands: root.commandEntries.length,
        hasShell: !!root.shell, stateDir: root.stateDir })
    }
  }

  Component.onCompleted: {
    mkdirProc.running = true
    root.loadExtensionPrefs()
    hiddenScan.running = true
    iconIndexScan.running = true
    root.rebuildApps()
  }
}
