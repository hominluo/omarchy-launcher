import QtQuick
import Quickshell
import Quickshell.Io

// Clipboard History: reads the history the shell's own clipboard plugin
// captures (so nothing is captured twice) and layers pins on top.
BuiltinHost {
  id: host

  readonly property string home: Quickshell.env("HOME")
  readonly property string historyPath: home + "/.local/state/omarchy/clipboard-history.json"
  readonly property string indexPath: service ? service.stateDir + "/clipboard-index.json" : ""
  property var history: []
  property var index: ({ version: 1, entries: {} })
  property bool indexDirty: false

  function entryKey(e) { return e.type === "image" ? "image:" + String(e.path || "") : "text:" + String(e.text || "") }

  function previewText(e) {
    if (e.type === "image") return "Image" + (e.capturedAt ? " · " + e.capturedAt : "")
    var lines = String(e.text || "").split("\n")
    var first = ""
    for (var i = 0; i < lines.length; i++) { if (lines[i].trim()) { first = lines[i].trim(); break } }
    if (first.length > 90) first = first.slice(0, 90) + "…"
    return first
  }

  function subtitleFor(e) {
    if (e.type === "image") return ""
    var text = String(e.text || "")
    var lines = text.split("\n").length
    if (lines > 1) return lines + " lines"
    if (/^https?:\/\//.test(text.trim())) return "Link"
    if (/^#[0-9a-fA-F]{6}$/.test(text.trim())) return "Color"
    return ""
  }

  function detailFor(e) {
    if (e.type === "image") {
      return { image: "file://" + e.path, metadata: [
        { kind: "label", title: "Type", text: String(e.mime || "image/png") },
        { kind: "label", title: "Captured", text: String(e.capturedAt || "") }
      ] }
    }
    var text = String(e.text || "")
    var fence = text.indexOf("```") >= 0 ? "````" : "```"
    var capped = text.length > 20000 ? text.slice(0, 20000) + "\n…" : text
    return {
      markdown: fence + "\n" + capped + "\n" + fence,
      metadata: [
        { kind: "label", title: "Characters", text: String(text.length) },
        { kind: "label", title: "Words", text: String(text.trim() ? text.trim().split(/\s+/).length : 0) },
        { kind: "label", title: "Lines", text: String(text.split("\n").length) }
      ]
    }
  }

  function isPinned(key) { return !!(host.index.entries[key] && host.index.entries[key].pinned) }

  function buildView() {
    var pinned = [], rest = []
    for (var i = 0; i < host.history.length; i++) {
      var e = host.history[i]
      if (!e) continue
      var key = entryKey(e)
      var item = {
        id: key,
        title: previewText(e),
        subtitle: subtitleFor(e),
        icon: e.type === "image" ? { kind: "image", value: "file://" + e.path } : "󰨸",
        keywords: e.type === "text" ? [String(e.text || "").slice(0, 4000)] : ["image"],
        accessories: isPinned(key) ? [{ text: "󰤱" }] : [],
        detail: detailFor(e),
        data: { historyIndex: i, key: key, type: e.type, path: e.path || "", mime: e.mime || "", text: e.text || "" },
        actions: actionsFor(e, i, key)
      }
      if (isPinned(key)) pinned.push(item); else rest.push(item)
    }
    var sections = []
    if (pinned.length) sections.push({ id: "pinned", title: "Pinned", items: pinned })
    sections.push({ id: "history", title: pinned.length ? "History" : "", items: rest })
    return {
      id: "clipboard",
      type: "list",
      navigationTitle: "Clipboard History",
      searchBarPlaceholder: "Search clipboard history…",
      filtering: true,
      isShowingDetail: true,
      sections: sections,
      emptyView: { icon: "󰨸", title: "Clipboard history is empty", description: "Copy something and it will show up here." }
    }
  }

  function actionsFor(e, historyIndex, key) {
    var self = host
    var pinned = isPinned(key)
    return { sections: [
      { actions: [
        { id: "paste", title: "Paste", icon: "󰆒", run: function(item) { self.pasteEntry(item.data); return false } },
        { id: "copy", title: "Copy to Clipboard", icon: "󰆏", run: function(item) { self.copyEntry(item.data); return false } }
      ] },
      { actions: [
        { id: "pin", title: pinned ? "Unpin" : "Pin", icon: "󰤱", shortcut: { modifiers: ["ctrl"], key: "p", label: "⌃P" }, run: function(item) { self.togglePin(item.data.key); return true } },
        { id: "open", title: "Open", icon: "󰏌", run: function(item) { self.openEntry(item.data); return false } },
        { id: "delete", title: "Delete Entry", icon: "󰧧", style: "destructive", shortcut: { modifiers: ["ctrl"], key: "d", label: "⌃D" }, run: function(item) { self.deleteEntry(item.data.historyIndex); return true } },
        { id: "clear", title: "Clear History", icon: "󰧧", style: "destructive", run: function(item) { self.confirm("Clear the whole clipboard history?", "Clear", function() { self.clearHistory() }); return true } }
      ] }
    ] }
  }

  function pasteEntry(data) {
    var bin = service ? service.omarchyPath + "/bin/" : ""
    if (host.panel) host.panel.dismiss()
    if (data.type === "image") Quickshell.execDetached([bin + "omarchy-clipboard-paste-file", data.mime, data.path])
    else Quickshell.execDetached([bin + "omarchy-clipboard-paste-text", "--shift-insert", "--history-index", String(data.historyIndex)])
  }

  function copyEntry(data) {
    var bin = service ? service.omarchyPath + "/bin/" : ""
    if (data.type === "image") Quickshell.execDetached([bin + "omarchy-clipboard-paste-file", "--copy-only", data.mime, data.path])
    else Quickshell.execDetached(["wl-copy", "--", String(data.text)])
  }

  function openEntry(data) {
    if (data.type === "image") Quickshell.execDetached(["xdg-open", data.path])
    else {
      var t = String(data.text || "").trim()
      if (/^https?:\/\//.test(t)) Quickshell.execDetached(["xdg-open", t])
      else Quickshell.execDetached([service.omarchyPath + "/bin/omarchy-clipboard-open", "--history-index", String(data.historyIndex)])
    }
  }

  function togglePin(key) {
    var entries = host.index.entries || {}
    var cur = entries[key] || {}
    cur.pinned = !cur.pinned
    entries[key] = cur
    host.index = { version: 1, entries: entries }
    host.indexDirty = true
    saveIndexTimer.restart()
    refresh()
    host.toast("success", cur.pinned ? "Pinned" : "Unpinned")
  }

  function deleteEntry(historyIndex) {
    var next = host.history.slice()
    next.splice(historyIndex, 1)
    host.history = next
    historyFile.setText(JSON.stringify(next, null, 2) + "\n")
    refresh()
  }

  function clearHistory() {
    host.history = []
    historyFile.setText("[]\n")
    refresh()
  }

  function refresh() { if (host.activeViewId) host.render(buildView()) }

  function open(win, args) {
    host.panel = win
    host.push(buildView())
  }

  function loadHistory(raw) {
    var data = null
    try { data = JSON.parse(raw) } catch (e) { data = null }
    var list = []
    if (Array.isArray(data)) {
      for (var i = 0; i < data.length; i++) {
        var v = data[i]
        if (typeof v === "string") { if (v.trim()) list.push({ type: "text", text: v }); continue }
        if (!v || typeof v !== "object") continue
        if (v.type === "text" && String(v.text || "").trim()) list.push({ type: "text", text: String(v.text) })
        else if (v.type === "image" && v.path) list.push({ type: "image", path: String(v.path), mime: String(v.mime || "image/png"), capturedAt: v.capturedAt ? String(v.capturedAt) : "" })
      }
    }
    host.history = list
    refresh()
  }

  FileView {
    id: historyFile
    path: host.historyPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: host.loadHistory(text())
    onLoadFailed: host.loadHistory("[]")
    onFileChanged: reload()
  }

  FileView {
    id: indexFile
    path: host.indexPath
    atomicWrites: true
    printErrors: false
    onLoaded: {
      var data = null
      try { data = JSON.parse(text()) } catch (e) { data = null }
      host.index = data && data.entries ? data : { version: 1, entries: {} }
    }
    onLoadFailed: host.index = { version: 1, entries: {} }
  }

  Timer {
    id: saveIndexTimer
    interval: 300
    onTriggered: { if (host.indexDirty) { host.indexDirty = false; indexFile.setText(JSON.stringify(host.index) + "\n") } }
  }
}
