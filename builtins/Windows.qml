import QtQuick
import Quickshell
import Quickshell.Hyprland

// Switch Windows: every open Hyprland window, focus on Enter. Also feeds
// root search with window rows for queries of two or more characters.
BuiltinHost {
  id: host

  function toplevels() {
    var out = []
    try {
      var values = Hyprland.toplevels.values || []
      for (var i = 0; i < values.length; i++) if (values[i]) out.push(values[i])
    } catch (e) {}
    return out
  }

  function className(t) {
    try { if (t.lastIpcObject && t.lastIpcObject["class"]) return String(t.lastIpcObject["class"]) } catch (e) {}
    try { if (t.wayland && t.wayland.appId) return String(t.wayland.appId) } catch (e) {}
    return ""
  }

  function iconFor(cls) {
    if (!cls) return "󰖯"
    var entry = null
    try { entry = DesktopEntries.heuristicLookup(cls) } catch (e) { entry = null }
    if (entry && entry.icon) return { kind: "app", value: String(entry.icon) }
    return "󰖯"
  }

  function describe(t) {
    var ws = ""
    try { ws = t.workspace ? String(t.workspace.name || t.workspace.id) : "" } catch (e) {}
    var mon = ""
    try { mon = t.monitor ? String(t.monitor.name) : "" } catch (e) {}
    return { cls: className(t), ws: ws, mon: mon }
  }

  function itemFor(t, idx) {
    var d = describe(t)
    var title = String(t.title || d.cls || "Window")
    var self = host
    var addr = String(t.address || "")
    return {
      id: "win:" + addr,
      title: title,
      subtitle: [d.cls, d.ws ? "Workspace " + d.ws : ""].filter(function(v) { return v }).join(" · "),
      icon: iconFor(d.cls),
      keywords: [d.cls, d.ws],
      accessories: t.activated ? [{ text: "Active" }] : [],
      data: { address: addr },
      actions: { sections: [
        { actions: [ { id: "focus", title: "Switch to Window", icon: "󰖯", run: function(item) { self.focusWindow(item.data.address); return false } } ] },
        { actions: [
          { id: "close", title: "Close Window", icon: "󰅖", style: "destructive", shortcut: { modifiers: ["ctrl"], key: "w", label: "⌃W" }, run: function(item) { self.dispatch("closewindow address:" + item.data.address); return true } },
          { id: "float", title: "Toggle Floating", icon: "󰖯", run: function(item) { self.dispatch("togglefloating address:" + item.data.address); return false } },
          { id: "here", title: "Move to Current Workspace", icon: "󰁍", run: function(item) { self.moveHere(item.data.address); return false } }
        ] }
      ] }
    }
  }

  function dispatch(request) { try { Hyprland.dispatch(request) } catch (e) {} }

  function focusWindow(address) { host.dispatch("focuswindow address:" + address) }

  function moveHere(address) {
    var ws = ""
    try { ws = Hyprland.focusedWorkspace ? String(Hyprland.focusedWorkspace.id) : "" } catch (e) {}
    if (ws) host.dispatch("movetoworkspace " + ws + ",address:" + address)
    host.focusWindow(address)
  }

  // Root-search entries (kind "window", ranked below apps/commands).
  function rootEntries() {
    var out = []
    var list = toplevels()
    for (var i = 0; i < list.length; i++) {
      var t = list[i]
      var d = describe(t)
      var addr = String(t.address || "")
      out.push({
        id: "win:" + addr,
        kind: "window",
        title: String(t.title || d.cls || "Window"),
        subtitle: d.cls,
        keywords: [d.cls, "window"],
        aliases: [], baseAliases: [],
        icon: iconFor(d.cls),
        accessoryText: "Window",
        enabled: true, favorite: false,
        primaryTitle: "Switch to Window",
        address: addr,
        run: function(e) { host.focusWindow(e.address) }
      })
    }
    return out
  }

  function buildView() {
    var list = toplevels()
    var items = []
    for (var i = 0; i < list.length; i++) items.push(itemFor(list[i], i))
    return { id: "windows", type: "list", navigationTitle: "Switch Windows", searchBarPlaceholder: "Search open windows…", filtering: true, items: items,
      emptyView: { icon: "󰖯", title: "No open windows" } }
  }

  function open(win, args) {
    host.panel = win
    try { Hyprland.refreshToplevels() } catch (e) {}
    host.push(buildView())
  }

  Connections {
    target: Hyprland.toplevels
    ignoreUnknownSignals: true
    function onValuesChanged() {
      if (service) service.rebuildIndex()
      if (host.activeViewId === "windows") host.render(host.buildView())
    }
  }
}
