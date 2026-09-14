import QtQuick
import Quickshell

// Fallback commands: what a root query can be handed to when nothing
// matches well ("Use “foo” with…"). The candidates are quicklinks with a
// {query} placeholder, Ask AI, Search Files, Run Shell Command, Search
// Snippets and scripts that take a text argument. settings.fallbackCommands
// keeps the enabled ids in order; unset means the quicklinks flagged
// `fallback` plus Ask AI, which is what shipped before the picker.
BuiltinHost {
  id: host

  function settingsList() {
    var s = service ? service.settings : null
    return s && Array.isArray(s.fallbackCommands) ? s.fallbackCommands.map(String) : null
  }

  // [{ id, title, icon, kind, run(query, win) }] in a stable order.
  function candidates() {
    var out = []
    var self = host
    var entries = service ? service.entries : []
    var byId = {}
    for (var i = 0; i < entries.length; i++) byId[entries[i].id] = entries[i]
    var add = function(id, title, icon, label, run) { out.push({ id: id, title: title, icon: icon, label: label, run: run }) }
    var ai = service ? service.ai : null
    if (ai && ai.available) add("cmd:ai-ask", "Ask AI", "󰚩", "AI", function(q, win) { ai.panel = win; ai.ask(q, null); return true })
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j]
      if (e.kind === "quicklink" && typeof e.runWithArgument === "function") {
        (function(en) { add(en.id, en.title, en.icon, "Quicklink", function(q, win) { return en.runWithArgument(en, win, q) === true }) })(e)
      }
    }
    if (byId["cmd:files"]) add("cmd:files", "Search Files", "󰱽", "Command", function(q, win) { service.runCommandId("cmd:files", win, { query: q }); return true })
    if (byId["cmd:shell"]) add("cmd:shell", "Run Shell Command", "󰆍", "Command", function(q, win) { service.runCommandId("cmd:shell", win, { query: q }); return true })
    if (byId["cmd:snippets"]) add("cmd:snippets", "Search Snippets", "󰧭", "Command", function(q, win) { service.runCommandId("cmd:snippets", win, { query: q }); return true })
    for (var k = 0; k < entries.length; k++) {
      var sc = entries[k]
      if (sc.kind === "script" && typeof sc.runWithArgument === "function") {
        (function(en) { add(en.id, en.title, en.icon, "Script", function(q, win) { return en.runWithArgument(en, win, q) === true }) })(sc)
      }
    }
    return out
  }

  function enabledIds() {
    var l = settingsList()
    if (l) return l
    // Legacy default: quicklinks flagged `fallback` (Google, DuckDuckGo…) and Ask AI.
    var out = []
    var ai = service ? service.ai : null
    if (ai && ai.available) out.push("cmd:ai-ask")
    var entries = service ? service.entries : []
    for (var i = 0; i < entries.length; i++) if (entries[i].kind === "quicklink" && entries[i].link && entries[i].link.fallback && typeof entries[i].runWithArgument === "function") out.push(entries[i].id)
    out.push("cmd:files")
    return out
  }

  // Rows for the root's "Use “q” with…" section, in the user's order.
  function items(query) {
    var q = String(query || "")
    var cands = candidates()
    var byId = {}
    for (var i = 0; i < cands.length; i++) byId[cands[i].id] = cands[i]
    var ids = enabledIds()
    var out = []
    for (var j = 0; j < ids.length; j++) {
      var c = byId[ids[j]]
      if (!c) continue
      (function(cand) {
        out.push({
          id: "fallback:" + cand.id,
          title: cand.id === "cmd:ai-ask" ? "Ask AI: " + q : (cand.label === "Quicklink" ? cand.title.replace(/^Search /, "Search ") + " for “" + q + "”" : cand.title + " “" + q + "”"),
          icon: cand.icon,
          accessories: [{ text: cand.label }],
          data: { query: q, fallbackId: cand.id },
          actions: { sections: [{ actions: [
            { id: "open", title: cand.id === "cmd:ai-ask" ? "Ask AI" : "Open", icon: cand.icon, run: function(item, win) { return cand.run(item.data.query, win) } }
          ] }] }
        })
      })(c)
    }
    return out
  }

  // ---- picker view: ✓ toggles, ⌃⇧↑/↓ reorders

  function pickerView() {
    var self = host
    var cands = candidates()
    var enabled = enabledIds()
    var rows = []
    var order = enabled.slice()
    for (var i = 0; i < cands.length; i++) if (order.indexOf(cands[i].id) < 0) order.push(cands[i].id)
    var byId = {}
    for (var c = 0; c < cands.length; c++) byId[cands[c].id] = cands[c]
    for (var j = 0; j < order.length; j++) {
      var cand = byId[order[j]]
      if (!cand) continue
      var on = enabled.indexOf(cand.id) >= 0
      rows.push({
        id: cand.id,
        title: cand.title,
        subtitle: on ? "" : "Off",
        icon: cand.icon,
        accessories: on ? [{ icon: "✓" }, { text: cand.label }] : [{ text: cand.label }],
        data: { fallbackId: cand.id, on: on },
        actions: { sections: [{ actions: [
          { id: "toggle", title: on ? "Disable" : "Enable", icon: on ? "󰄱" : "󰄲", run: function(item) { self.toggle(item.data.fallbackId); return true } },
          { id: "up", title: "Move Up", icon: "󰁝", shortcut: { modifiers: ["ctrl", "shift"], key: "arrowUp", label: "⌃⇧↑" }, run: function(item) { self.move(item.data.fallbackId, -1); return true } },
          { id: "down", title: "Move Down", icon: "󰁅", shortcut: { modifiers: ["ctrl", "shift"], key: "arrowDown", label: "⌃⇧↓" }, run: function(item) { self.move(item.data.fallbackId, 1); return true } },
          { id: "reset", title: "Reset to Defaults", icon: "󰑓", style: "destructive", run: function() { service.setSetting("fallbackCommands", undefined); self.rerender(); return true } }
        ] }] }
      })
    }
    return {
      id: "fallbacks",
      type: "list",
      navigationTitle: "Fallback Commands",
      searchBarPlaceholder: "Fallback commands…",
      filtering: true,
      items: rows,
      emptyView: { icon: "󰍉", title: "No fallback candidates", description: "Add a quicklink with {query} or set up AI" }
    }
  }

  function toggle(id) {
    var l = enabledIds().slice()
    var i = l.indexOf(id)
    if (i >= 0) l.splice(i, 1); else l.push(id)
    service.setSetting("fallbackCommands", l)
    rerender()
  }

  function move(id, delta) {
    var l = enabledIds().slice()
    var i = l.indexOf(id)
    if (i < 0) return
    var j = i + delta
    if (j < 0 || j >= l.length) return
    var t = l[i]; l[i] = l[j]; l[j] = t
    service.setSetting("fallbackCommands", l)
    rerender()
  }

  function rerender() { if (host.activeViewId === "fallbacks") host.render(pickerView()) }

  function open(win, args) {
    host.panel = win
    host.push(pickerView())
  }
}
