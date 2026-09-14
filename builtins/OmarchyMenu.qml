import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/OmarchyMenu.js" as Menu
import "../lib/Score.js" as Score
import "../lib/Frecency.js" as Frecency

// The stock Omarchy menu, embedded. The merged tree (default jsonc + the
// user's ~/.config/omarchy/extensions/omarchy-menu.jsonc) feeds the root in
// two ways: every root child becomes an "omarchy-category" row (Apps, Learn,
// Trigger, … System) and every action becomes an "omarchy-menu" leaf with
// its breadcrumb. Categories open as nested lists; `when:` guards hide rows
// and empty submenus, `checked:` guards add a ✓, and provider submenus
// (fonts, power profiles) enumerate their rows through one bash call.
BuiltinHost {
  id: host

  readonly property string home: Quickshell.env("HOME")
  readonly property string defaultPath: service ? service.omarchyPath + "/default/omarchy/omarchy-menu.jsonc" : ""
  readonly property string userPath: home + "/.config/omarchy/extensions/omarchy-menu.jsonc"
  property var defaultItems: []
  property var userItems: []
  property var items: ({})
  property var order: []
  property var guardResults: ({})   // menu id -> { when: bool, checked: bool }
  property string currentMenu: "root"
  property string currentQuery: ""
  property var providerRows: ({})   // menu id -> [{ label, value, current }] | { error }
  property bool guardsPending: false

  // Each known provider is a bash one-liner printing `label\tvalue\tcurrent`
  // per row (same scripts as the stock menu). `volatile` providers re-run on
  // every visit so a font installed a minute ago shows up.
  readonly property var providers: ({
    "fonts": {
      tool: "omarchy-font-list",
      script: "current=$(omarchy-font-current 2>/dev/null); omarchy-font-list 2>/dev/null | while read -r f; do [[ -z $f ]] && continue; printf '%s\\t%s\\t%s\\n' \"$f\" \"$f\" \"$current\"; done",
      icon: "",
      volatile: true,
      actionFor: function(value) { return "omarchy-font-set " + shellQuote(value) }
    },
    "power-profiles": {
      tool: "omarchy-powerprofiles-list",
      script: "current=$(powerprofilesctl get 2>/dev/null); omarchy-powerprofiles-list 2>/dev/null | while read -r p; do [[ -z $p ]] && continue; printf '%s\\t%s\\t%s\\n' \"$p\" \"$p\" \"$current\"; done",
      icon: "󰐋",
      volatile: false,
      actionFor: function(value) { return "omarchy-powerprofiles-set autodetect " + shellQuote(value) }
    }
  })

  function shellQuote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'" }

  function rebuild() {
    var merged = Menu.merge(host.defaultItems, host.userItems)
    host.items = merged.items
    host.order = merged.order
    host.providerRows = ({})
    if (service) service.rebuildIndex()
    if (host.activeViewId && host.activeViewId === "omenu-" + host.currentMenu) host.render(menuView(host.currentMenu, host.currentQuery))
  }

  // id -> bool for entries whose `when:` has been evaluated.
  function whenResults() {
    var out = {}
    for (var id in host.guardResults) {
      var g = host.guardResults[id]
      if (g && g.when !== undefined) out[id] = g.when
    }
    return out
  }

  function isVisible(entry) { return Menu.isVisible(host.items, host.order, whenResults(), entry, 0) }

  function isChecked(entry) {
    if (!entry || !entry.checked) return false
    var g = host.guardResults[entry.id]
    return !!(g && g.checked)
  }

  // Power actions ask first (Raycast does; a stray Enter or click must not
  // end the session).
  function confirmMessage(entry) {
    var a = String(entry && entry.action || "")
    if (/omarchy-system-shutdown|systemctl\s+poweroff/.test(a)) return "Shut down the computer?"
    if (/omarchy-system-reboot|systemctl\s+reboot/.test(a)) return "Restart the computer?"
    if (/omarchy-system-logout|hyprctl\s+dispatch\s+exit/.test(a)) return "Log out and close all windows?"
    if (/systemctl\s+hibernate/.test(a)) return "Hibernate now?"
    return ""
  }

  // Returns true when the launcher should stay open (a confirmation is up).
  function runAction(entry, win) {
    if (!entry || !entry.action) return false
    var exec = function() { Quickshell.execDetached(["bash", "-lc", entry.action]) }
    var msg = confirmMessage(entry)
    var w = win || host.panel
    if (msg && w) { w.confirm(msg, entry.label || "Confirm", function() { exec(); w.dismiss() }); return true }
    exec()
    return false
  }

  function categorySubtitle(e) {
    if (e.provider === "apps" || e.id === "apps") return "Browse " + (service ? service.appEntries.length : 0) + " applications"
    if (e.kind === "action") return e.description || ""
    return Menu.categorySubtitle(host.items, host.order, e, whenResults(), 3)
  }

  // ------------------------------------------------------------- root entries

  function rootEntries() {
    var out = []
    var self = host
    var roots = Menu.rootChildren(host.items, host.order)
    var rootIds = {}
    for (var r = 0; r < roots.length; r++) {
      var e = roots[r]
      rootIds[e.id] = true
      var isAction = e.kind === "action"
      var split = Menu.splitAliases(e)
      var kids = isAction ? [] : Menu.children(host.items, host.order, e.kind === "link" ? e.target : e.id)
      var kw = [e.label, e.description || "", "omarchy", "menu"].concat(Menu.idTokens(e.id), split.keywords)
      for (var k = 0; k < kids.length && k < 12; k++) kw.push(kids[k].label)
      out.push({
        id: "omenu-cat:" + e.id,
        kind: "omarchy-category",
        title: e.label,
        subtitle: categorySubtitle(e),
        keywords: kw,
        aliases: [], baseAliases: split.aliases.slice(),
        icon: e.icon || (isAction ? "󰐊" : "󰍜"),
        accessoryText: isAction ? "Omarchy" : "Menu",
        accessoryIcon: isAction ? "" : "›",
        enabled: true, favorite: false,
        primaryTitle: isAction ? "Run" : "Open",
        raw: { when: e.when || "", checked: e.checked || "" },
        dedupeKey: isAction ? String(e.action || "") : "",
        menuEntry: e,
        run: function(en, win) {
          var me = en.menuEntry
          if (win) self.panel = win
          if (me.provider === "apps" || me.id === "apps") { self.openApps(); return true }
          if (me.kind === "action") { return self.runAction(me, win) || !!me.checked }
          self.enter(me.kind === "link" ? me.target : me.id)
          return true
        }
      })
    }
    var acts = Menu.actions(host.items, host.order)
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i].entry
      if (rootIds[a.id] || a.id === "apps" || a.parent === "apps") continue
      var sp = Menu.splitAliases(a)
      out.push({
        id: "omenu:" + a.id,
        kind: "omarchy-menu",
        title: a.label,
        subtitle: acts[i].path.join(" › "),
        keywords: [a.description || "", "omarchy menu"].concat(acts[i].path, Menu.idTokens(a.id), sp.keywords),
        aliases: [], baseAliases: sp.aliases.slice(),
        icon: a.icon || "󰍜",
        accessoryText: "Omarchy",
        accessoryIcon: "",
        enabled: true, favorite: false,
        primaryTitle: "Run",
        raw: { when: a.when || "", checked: a.checked || "" },
        dedupeKey: String(a.action || ""),
        menuEntry: a,
        run: function(en, win) { return self.runAction(en.menuEntry, win) || !!en.menuEntry.checked }
      })
    }
    return out
  }

  // Guard lines the service batches when the window opens: root categories
  // and their direct children decide what the root shows (visibility and the
  // child previews). Ids carry the entry prefix so the service can keep one
  // result map; mergeGuards() strips it again.
  function shallowGuardEntries() {
    var out = []
    var roots = Menu.rootChildren(host.items, host.order)
    for (var i = 0; i < roots.length; i++) {
      var e = roots[i]
      if (e.when || e.checked) out.push({ id: "omenu-cat:" + e.id, when: e.when, checked: e.checked })
      if (e.kind === "action") continue
      var kids = Menu.children(host.items, host.order, e.kind === "link" ? e.target : e.id)
      for (var j = 0; j < kids.length; j++) if (kids[j].when || kids[j].checked) out.push({ id: "omenu:" + kids[j].id, when: kids[j].when, checked: kids[j].checked })
    }
    return out
  }

  // Every guarded action not covered by shallowGuardEntries(): the deep
  // batch the service runs after the shallow one has landed.
  function deepGuardEntries() {
    var shallow = {}
    var s = shallowGuardEntries()
    for (var i = 0; i < s.length; i++) shallow[s[i].id] = true
    var out = []
    var acts = Menu.actions(host.items, host.order)
    for (var j = 0; j < acts.length; j++) {
      var e = acts[j].entry
      if (!(e.when || e.checked) || e.parent === "apps") continue
      var id = host.indexIdFor(e.id)
      if (shallow[id]) continue
      out.push({ id: id, when: e.when, checked: e.checked })
    }
    return out
  }

  // Guard lines for specific root entries (favorites / suggestions leaves).
  function guardLinesFor(entryIds) {
    var out = []
    for (var i = 0; i < entryIds.length; i++) {
      var id = String(entryIds[i])
      var raw = id.indexOf("omenu:") === 0 ? id.slice(6) : (id.indexOf("omenu-cat:") === 0 ? id.slice(10) : "")
      var e = raw ? host.items[raw] : null
      if (e && (e.when || e.checked)) out.push({ id: id, when: e.when, checked: e.checked })
    }
    return out
  }

  // Results from the service batch, keyed by prefixed entry id.
  function mergeGuards(map) {
    var next = {}
    for (var k in host.guardResults) next[k] = host.guardResults[k]
    for (var id in map) {
      var raw = id.indexOf("omenu:") === 0 ? id.slice(6) : (id.indexOf("omenu-cat:") === 0 ? id.slice(10) : "")
      if (!raw) continue
      var g = next[raw] || {}
      if (map[id].when !== undefined) g.when = map[id].when
      if (map[id].checked !== undefined) g.checked = map[id].checked
      next[raw] = g
    }
    host.guardResults = next
  }

  // ------------------------------------------------------------- browsing

  function rowFor(e) {
    var self = host
    var isMenu = e.kind === "menu" || e.kind === "link"
    var targetId = e.kind === "link" ? e.target : e.id
    var isApps = e.provider === "apps" || e.id === "apps"
    var acc = []
    if (isChecked(e)) acc.push({ icon: "✓" })
    if (isMenu) { acc.push({ text: "Menu" }); acc.push({ icon: "›" }) } else acc.push({ text: "Omarchy" })
    var actions
    if (isApps) actions = [ { id: "open", title: "Open", icon: "󰀻", run: function() { self.openApps(); return true } } ]
    else if (isMenu) actions = [ { id: "open", title: "Open", icon: "󰍜", run: function(item) { self.enter(item.data.targetId); return true } } ]
    else {
      var indexEntry = service ? service.entryById(host.indexIdFor(e.id)) : null
      actions = [
        { id: "run", title: "Run", icon: "󰐊", run: function(item) { return self.runLeaf(item.data.entryId) } },
        { id: "copy", title: "Copy Command", icon: "󰆏", run: function(item) { self.copyText(self.items[item.data.entryId].action); return false } },
        { id: "favorite", title: indexEntry && indexEntry.favorite ? "Remove from Favorites" : "Add to Favorites", icon: indexEntry && indexEntry.favorite ? "󰓎" : "󰓒", shortcut: { modifiers: ["ctrl", "shift"], key: "f", label: "⌃⇧F" },
          run: function(item, win) { if (service) service.toggleFavorite(self.indexIdFor(item.data.entryId), win); self.render(self.menuView(self.currentMenu, self.currentQuery)); return true } }
      ]
    }
    return {
      id: e.id,
      title: e.label,
      subtitle: e.description || "",
      icon: e.icon || (isMenu ? "󰍜" : "󰐊"),
      keywords: [e.description || ""].concat(e.aliases || [], Menu.idTokens(e.id)),
      accessories: acc,
      data: { entryId: e.id, targetId: targetId, isMenu: isMenu },
      actions: { sections: [{ actions: actions }] }
    }
  }

  // Root-level actions (About) are indexed as categories, everything else as leaves.
  function indexIdFor(menuId) {
    var e = host.items[menuId]
    return (e && e.parent === "root" ? "omenu-cat:" : "omenu:") + menuId
  }

  // Run a leaf; toggles (rows with `checked:`) stay open and refresh.
  function runLeaf(entryId) {
    var e = host.items[entryId]
    if (!e) return false
    if (service) service.recordUse(host.indexIdFor(entryId))
    if (host.runAction(e, host.panel)) return true
    if (!e.checked) return false
    recheckTimer.restart()
    return true
  }

  Timer {
    id: recheckTimer
    interval: 600
    onTriggered: host.evaluateGuards(host.currentMenu)
  }

  function providerRowsFor(menuId) {
    var self = host
    var me = host.items[menuId]
    var spec = me && me.provider ? host.providers[me.provider] : null
    var rows = host.providerRows[menuId]
    var out = []
    if (!spec) {
      out.push({ id: "provider-missing", title: "Provider ‘" + (me ? me.provider : "?") + "’ is not available", icon: "󰀦", accessories: [{ text: "Unsupported" }], data: {}, actions: { sections: [] } })
      return out
    }
    if (rows && rows.error) {
      out.push({ id: "provider-error", title: rows.error, subtitle: "Install " + spec.tool + " to enable this menu", icon: "󰀦", accessories: [{ text: "Unavailable" }], data: {}, actions: { sections: [] } })
      return out
    }
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i]
      out.push({
        id: "prov:" + i,
        title: r.label,
        icon: spec.icon || me.icon || "󰍜",
        keywords: [r.value],
        accessories: (r.current && r.value === r.current) ? [{ icon: "✓" }, { text: "Omarchy" }] : [{ text: "Omarchy" }],
        data: { value: r.value, action: spec.actionFor(r.value) },
        actions: { sections: [{ actions: [
          { id: "run", title: "Select", icon: "󰐊", run: function(item) { Quickshell.execDetached(["bash", "-lc", item.data.action]); return false } },
          { id: "copy", title: "Copy Command", icon: "󰆏", run: function(item) { self.copyText(item.data.action); return false } }
        ] }] }
      })
    }
    return out
  }

  function tempEntry(row, extraKeywords) {
    return Score.prepare({ id: row.id, title: row.title, subtitle: row.subtitle || "", keywords: (row.keywords || []).concat(extraKeywords || []), aliases: [], enabled: true, favorite: false, kind: "row" })
  }

  function menuView(menuId, query) {
    var q = String(query || "").trim()
    var me = host.items[menuId]
    var isProvider = !!(me && me.provider && me.provider !== "apps")
    var rows = []
    if (isProvider) rows = providerRowsFor(menuId)
    else {
      var kids = Menu.children(host.items, host.order, menuId)
      for (var i = 0; i < kids.length; i++) {
        var e = kids[i]
        if (e.parent === "apps") continue
        if (!isVisible(e)) continue
        rows.push(rowFor(e))
      }
    }
    var sections = []
    if (!q) sections.push({ id: "level", title: "", items: rows })
    else {
      var byId = {}
      var pool = []
      for (var p = 0; p < rows.length; p++) { byId[rows[p].id] = rows[p]; pool.push(tempEntry(rows[p])) }
      var ranked = Score.rank(pool, q, {}, 0)
      var hits = []
      for (var h = 0; h < ranked.length; h++) hits.push(byId[ranked[h].entry.id])
      if (hits.length) sections.push({ id: "level", title: "", items: hits })
      if (q.length >= 2 && !isProvider) {
        var desc = Menu.descendants(host.items, host.order, menuId, whenResults())
        var dpool = [], dById = {}
        for (var d = 0; d < desc.length; d++) {
          var de = desc[d].entry
          if (de.parent === menuId || de.parent === "apps") continue
          var row = rowFor(de)
          row.id = "deep:" + de.id
          row.subtitle = desc[d].path.join(" › ")
          dById[row.id] = row
          dpool.push(tempEntry(row, desc[d].path))
        }
        var dranked = Score.rank(dpool, q, {}, 40)
        var dhits = []
        for (var x = 0; x < dranked.length; x++) dhits.push(dById[dranked[x].entry.id])
        if (dhits.length) sections.push({ id: "inside", title: "Inside " + (me ? (me.title || me.label) : "Omarchy"), items: dhits })
      }
    }
    var label = me ? (me.title || me.label) : "Omarchy Menu"
    return {
      id: "omenu-" + menuId,
      type: "list",
      navigationTitle: label,
      searchBarPlaceholder: menuId === "root" ? "Go…" : label + "…",
      searchText: q,
      filtering: false,
      isLoading: isProvider && host.providerRows[menuId] === undefined,
      sections: sections,
      emptyView: { icon: "󰍜", title: q ? "No results for “" + q + "”" : "Nothing here" }
    }
  }

  function enter(menuId) {
    var id = String(menuId || "root")
    if (id !== "root" && !host.items[id]) { host.toast("failure", "Unknown menu", id); return }
    host.currentMenu = id
    host.currentQuery = ""
    var me = host.items[id]
    if (me && me.provider && me.provider !== "apps") loadProvider(id)
    host.push(menuView(id, ""))
    evaluateGuards(id)
  }

  function searchText(viewId, text) {
    if (viewId !== "omenu-" + host.currentMenu) return
    host.currentQuery = String(text || "")
    host.render(menuView(host.currentMenu, host.currentQuery))
  }

  function viewPopped(viewId) {
    if (viewId === "omenu-apps") { host.currentMenu = "root" }
    else {
      var m = String(viewId || "").match(/^omenu-(.*)$/)
      if (m) {
        var e = host.items[m[1]]
        host.currentMenu = e && e.parent ? e.parent : "root"
        host.currentQuery = ""
      }
    }
    if (viewId === host.activeViewId) host.activeViewId = ""
  }

  // args: { menu: "<id|alias>", query: "<text typed into that level>" }
  function open(win, args) {
    host.panel = win
    var target = "root"
    if (args && args.menu) {
      var name = String(args.menu)
      target = Menu.resolveAlias(host.items, host.order, name) || name
      if (target === "apps") { host.openApps(); if (args.query && win) win.setSearchText(String(args.query)); return }
    }
    host.enter(target)
    if (args && args.query && win) win.setSearchText(String(args.query))
  }

  // ------------------------------------------------------------- apps browser

  function openApps() {
    host.currentMenu = "apps"
    host.push(appsView())
  }

  function appsView() {
    if (!service) return { id: "omenu-apps", type: "list", items: [] }
    var apps = service.appEntries.slice()
    var scores = Frecency.scores(service.frecencyData, service.now())
    var recent = apps.filter(function(a) { return (scores[a.id] || 0) > 0 && a.enabled !== false })
    recent.sort(function(a, b) { return scores[b.id] - scores[a.id] })
    recent = recent.slice(0, 10)
    var seen = {}
    for (var i = 0; i < recent.length; i++) seen[recent[i].id] = true
    var rest = apps.filter(function(a) { return !seen[a.id] && a.enabled !== false })
    rest.sort(function(a, b) { var an = String(a.title).toLowerCase(), bn = String(b.title).toLowerCase(); return an < bn ? -1 : an > bn ? 1 : 0 })
    var sections = []
    if (recent.length) sections.push({ id: "recent", title: "Recently Used", items: recent.map(function(a) { return service.entryRow(a) }) })
    sections.push({ id: "az", title: recent.length ? "A–Z" : "", items: rest.map(function(a) { return service.entryRow(a) }) })
    return {
      id: "omenu-apps",
      type: "list",
      navigationTitle: "Apps",
      searchBarPlaceholder: "Apps…",
      filtering: true,
      sections: sections,
      emptyView: { icon: "󰀻", title: "No applications" }
    }
  }

  // ------------------------------------------------------------- providers

  function loadProvider(menuId) {
    var me = host.items[menuId]
    var spec = me && me.provider ? host.providers[me.provider] : null
    if (!spec) return
    if (host.providerRows[menuId] !== undefined && !spec.volatile) return
    if (providerProc.running) { providerProc.queued = menuId; return }
    providerProc.menuId = menuId
    providerProc.collected = ""
    providerProc.command = ["bash", "-lc", "command -v " + shellQuote(spec.tool) + " >/dev/null 2>&1 || exit 3\n" + spec.script]
    providerProc.running = true
  }

  Process {
    id: providerProc
    property string menuId: ""
    property string queued: ""
    property string collected: ""
    stdout: SplitParser { onRead: function(line) { providerProc.collected += line + "\n" } }
    onExited: function(exitCode, exitStatus) {
      var next = {}
      for (var k in host.providerRows) next[k] = host.providerRows[k]
      if (exitCode === 3) next[providerProc.menuId] = { error: "Provider is not available on this system" }
      else {
        var rows = []
        var lines = providerProc.collected.split("\n")
        for (var i = 0; i < lines.length; i++) {
          if (!lines[i].trim()) continue
          var parts = lines[i].split("\t")
          rows.push({ label: parts[0] || "", value: parts[1] !== undefined ? parts[1] : parts[0], current: parts[2] || "" })
        }
        next[providerProc.menuId] = rows
      }
      host.providerRows = next
      if (host.activeViewId === "omenu-" + providerProc.menuId) host.render(host.menuView(providerProc.menuId, host.currentQuery))
      var q = providerProc.queued
      providerProc.queued = ""
      if (q) Qt.callLater(function() { host.loadProvider(q) })
    }
  }

  // ------------------------------------------------------------- guards

  // Every when/checked guard of a submenu, one bash call, through the same
  // prelude the stock menu uses (package cache, reader slots). Grandchildren's
  // `when:` come along because a submenu hides when nothing under it shows.
  function evaluateGuards(menuId) {
    var kids = Menu.children(host.items, host.order, menuId)
    var list = []
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i]
      if (e.when || e.checked) list.push({ id: e.id, when: e.when, checked: e.checked })
      if (e.kind === "menu" || e.kind === "link") {
        var sub = Menu.children(host.items, host.order, e.kind === "link" ? e.target : e.id)
        for (var j = 0; j < sub.length; j++) if (sub[j].when) list.push({ id: sub[j].id, when: sub[j].when })
      }
    }
    var script = Menu.guardScript(list)
    if (!script) return
    if (guardProc.running) { host.guardsPending = true; return }
    host.guardsPending = false
    guardProc.menuId = menuId
    guardProc.collected = ""
    guardProc.command = ["bash", "-lc", script]
    guardProc.running = true
  }

  Process {
    id: guardProc
    property string menuId: ""
    property string collected: ""
    stdout: SplitParser { onRead: function(line) { guardProc.collected += line + "\n" } }
    onExited: function(exitCode, exitStatus) {
      if (exitCode !== 0 || exitStatus !== 0) {
        if (host.guardsPending) Qt.callLater(function() { host.evaluateGuards(host.currentMenu) })
        return
      }
      var lines = guardProc.collected.split("\n")
      var next = {}
      for (var k in host.guardResults) next[k] = host.guardResults[k]
      var any = false
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^([WC]) (\S+) ([01])$/)
        if (!m) continue
        any = true
        var g = next[m[2]] || {}
        if (m[1] === "W") g.when = m[3] === "1"; else g.checked = m[3] === "1"
        next[m[2]] = g
      }
      if (any) host.guardResults = next
      if (host.activeViewId === "omenu-" + guardProc.menuId) host.render(host.menuView(guardProc.menuId, host.currentQuery))
      if (host.guardsPending) Qt.callLater(function() { host.evaluateGuards(host.currentMenu) })
    }
  }

  FileView {
    path: host.defaultPath
    watchChanges: true
    printErrors: false
    onLoaded: { host.defaultItems = Menu.parse(text()); host.rebuild() }
    onLoadFailed: { host.defaultItems = []; host.rebuild() }
    onFileChanged: reload()
  }

  FileView {
    path: host.userPath
    watchChanges: true
    printErrors: false
    onLoaded: { host.userItems = Menu.parse(text()); host.rebuild() }
    onLoadFailed: { host.userItems = []; host.rebuild() }
    onFileChanged: reload()
  }
}
