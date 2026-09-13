import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/OmarchyMenu.js" as Menu

// The stock Omarchy menu, embedded: every action becomes a root entry with
// its breadcrumb, and the "Omarchy Menu" command browses the tree as nested
// lists. `when:` guards are evaluated in one batched bash call when a
// submenu opens; `checked:` guards add a ✓.
BuiltinHost {
  id: host

  readonly property string home: Quickshell.env("HOME")
  readonly property string defaultPath: service ? service.omarchyPath + "/default/omarchy/omarchy-menu.jsonc" : ""
  readonly property string userPath: home + "/.config/omarchy/extensions/omarchy-menu.jsonc"
  property var defaultItems: []
  property var userItems: []
  property var items: ({})
  property var order: []
  property var guardResults: ({})   // id -> { when: bool, checked: bool }
  property var navStack: []
  property string currentMenu: "root"

  function rebuild() {
    var merged = Menu.merge(host.defaultItems, host.userItems)
    host.items = merged.items
    host.order = merged.order
    if (service) service.rebuildIndex()
    if (host.activeViewId) host.render(menuView(host.currentMenu))
  }

  function runAction(entry) {
    if (!entry || !entry.action) return
    Quickshell.execDetached(["bash", "-lc", entry.action])
  }

  function rootEntries() {
    var out = []
    var acts = Menu.actions(host.items, host.order)
    var self = host
    for (var i = 0; i < acts.length; i++) {
      var e = acts[i].entry
      // Skip rows the launcher already covers natively.
      if (e.id === "apps" || e.parent === "apps") continue
      out.push({
        id: "omenu:" + e.id,
        kind: "omarchy-menu",
        title: e.label,
        subtitle: acts[i].path.join(" › "),
        keywords: [e.description || "", "omarchy menu"].concat(acts[i].path),
        aliases: [], baseAliases: [],
        icon: e.icon || "󰍜",
        accessoryText: "Omarchy",
        enabled: true, favorite: false,
        primaryTitle: "Run",
        menuEntry: e,
        run: function(en) { self.runAction(en.menuEntry) }
      })
    }
    return out
  }

  function isVisible(entry) {
    if (!entry.when) return true
    var g = host.guardResults[entry.id]
    return g === undefined ? true : g.when !== false
  }

  function isChecked(entry) {
    if (!entry.checked) return false
    var g = host.guardResults[entry.id]
    return !!(g && g.checked)
  }

  function menuView(menuId) {
    var kids = Menu.children(host.items, host.order, menuId)
    var itemsOut = []
    var self = host
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i]
      if (e.provider === "apps" || e.id === "apps") continue
      if (e.provider) continue        // dynamic providers belong to the stock menu
      if (!isVisible(e)) continue
      var isMenu = e.kind === "menu" || e.kind === "link"
      var targetId = e.kind === "link" ? e.target : e.id
      itemsOut.push({
        id: e.id,
        title: e.label + (isChecked(e) ? "  ✓" : ""),
        subtitle: e.description || "",
        icon: e.icon || (isMenu ? "󰍜" : "󰐊"),
        accessories: isMenu ? [{ text: "›" }] : [],
        data: { entryId: e.id, targetId: targetId, isMenu: isMenu },
        actions: { sections: [{ actions: isMenu
          ? [ { id: "open", title: "Open", icon: "󰍜", run: function(item) { self.enter(item.data.targetId); return true } } ]
          : [ { id: "run", title: "Run", icon: "󰐊", run: function(item) { self.runAction(self.items[item.data.entryId]); return false } },
              { id: "copy", title: "Copy Command", icon: "󰆏", run: function(item) { self.copyText(self.items[item.data.entryId].action); return false } } ]
        }] }
      })
    }
    var me = host.items[menuId]
    return {
      id: "omenu-" + menuId,
      type: "list",
      navigationTitle: me ? (me.title || me.label) : "Omarchy Menu",
      searchBarPlaceholder: (me ? (me.title || me.label) : "Omarchy") + "…",
      filtering: true,
      items: itemsOut,
      emptyView: { icon: "󰍜", title: "Nothing here" }
    }
  }

  function enter(menuId) {
    host.currentMenu = menuId
    host.push(menuView(menuId))
    evaluateGuards(menuId)
  }

  function viewPopped(viewId) {
    // Back to the parent menu: keep currentMenu pointing at what is shown.
    var m = viewId.match(/^omenu-(.*)$/)
    if (m) {
      var e = host.items[m[1]]
      host.currentMenu = e && e.parent ? e.parent : "root"
    }
  }

  function open(win, args) {
    host.panel = win
    host.enter(args && args.menu ? String(args.menu) : "root")
  }

  // Run every when/checked guard of a submenu in a single bash so the menu
  // never spawns a process per row.
  function evaluateGuards(menuId) {
    var kids = Menu.children(host.items, host.order, menuId)
    var script = ""
    var count = 0
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i]
      if (e.when) { script += "if ( " + e.when + " ) >/dev/null 2>&1; then echo 'W " + e.id + " 1'; else echo 'W " + e.id + " 0'; fi\n"; count++ }
      if (e.checked) { script += "if ( " + e.checked + " ) >/dev/null 2>&1; then echo 'C " + e.id + " 1'; else echo 'C " + e.id + " 0'; fi\n"; count++ }
    }
    if (!count) return
    if (guardProc.running) guardProc.running = false
    guardProc.menuId = menuId
    guardProc.command = ["bash", "-lc", script]
    guardProc.running = true
  }

  Process {
    id: guardProc
    property string menuId: ""
    stdout: StdioCollector {
      onStreamFinished: {
        var lines = String(text || "").split("\n")
        var next = {}
        for (var k in host.guardResults) next[k] = host.guardResults[k]
        for (var i = 0; i < lines.length; i++) {
          var m = lines[i].match(/^([WC]) (\S+) ([01])$/)
          if (!m) continue
          var g = next[m[2]] || {}
          if (m[1] === "W") g.when = m[3] === "1"; else g.checked = m[3] === "1"
          next[m[2]] = g
        }
        host.guardResults = next
        if (host.activeViewId === "omenu-" + guardProc.menuId) host.render(host.menuView(guardProc.menuId))
      }
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
