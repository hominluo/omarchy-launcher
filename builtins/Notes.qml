import QtQuick
import Quickshell
import Quickshell.Io

// Floating Notes: notes live as Markdown files under the state dir; the
// index (titles, updated times) is notes.json. The window itself belongs to
// Launcher.qml and registers here as service.notesWindow.
BuiltinHost {
  id: host

  readonly property string dir: service ? service.stateDir + "/notes" : ""
  readonly property string indexPath: service ? service.stateDir + "/notes.json" : ""
  property var notes: []             // [{ id, title, updated }]
  property var previews: ({})        // id -> first lines

  function windowRef() { return service ? service.notesWindow : null }

  function titleFrom(text, fallback) {
    var first = String(text || "").split("\n").map(function(l) { return l.trim() }).filter(function(l) { return l })[0] || ""
    first = first.replace(/^#+\s*/, "").replace(/[*_`]/g, "")
    return first ? first.slice(0, 60) : fallback
  }

  // Called by the window after each save.
  function noteSaved(id, text) {
    var list = host.notes.slice()
    var found = false
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { list[i] = { id: id, title: titleFrom(text, list[i].title), updated: Date.now() }; found = true }
    if (!found) list.push({ id: id, title: titleFrom(text, "Note"), updated: Date.now() })
    list.sort(function(a, b) { return b.updated - a.updated })
    host.notes = list
    var p = {}
    for (var k in host.previews) p[k] = host.previews[k]
    p[id] = String(text || "").slice(0, 2000)
    host.previews = p
    indexFile.setText(JSON.stringify({ version: 1, items: list }, null, 2) + "\n")
    var w = windowRef()
    if (w && w.noteId === id) w.noteTitle = titleFrom(text, "Note")
    if (host.activeViewId === "notes") host.render(buildView())
  }

  function newNote() {
    var id = "note-" + Date.now().toString(36)
    host.notes = [{ id: id, title: "New Note", updated: Date.now() }].concat(host.notes)
    indexFile.setText(JSON.stringify({ version: 1, items: host.notes }, null, 2) + "\n")
    return id
  }

  function openNote(id, title) {
    var w = windowRef()
    if (!w) { host.toast("failure", "Notes window unavailable"); return }
    if (host.panel) host.panel.dismiss()
    w.show(id, title || "Note")
  }

  function buildView() {
    var self = host
    var items = []
    for (var i = 0; i < host.notes.length; i++) {
      var n = host.notes[i]
      var body = host.previews[n.id] || ""
      items.push({
        id: n.id, title: n.title, subtitle: new Date(n.updated).toLocaleString(Qt.locale(), "MMM d, HH:mm"), icon: "󰎞",
        keywords: [body],
        detail: { markdown: body || "_Empty note_" },
        data: { id: n.id, title: n.title },
        actions: { sections: [ { actions: [
          { id: "open", title: "Open in Floating Window", icon: "󰎞", run: function(item) { self.openNote(item.data.id, item.data.title); return false } },
          { id: "copy", title: "Copy Note", icon: "󰆏", run: function(item) { self.copyText(self.previews[item.data.id] || ""); return false } }
        ] }, { actions: [
          { id: "editor", title: "Open in Editor", icon: "󰲶", run: function(item) { Quickshell.execDetached(["bash", "-lc", "omarchy-launch-editor " + JSON.stringify(self.dir + "/" + item.data.id + ".md")]); return false } },
          { id: "new", title: "New Note", icon: "󰐕", shortcut: { modifiers: ["ctrl"], key: "n", label: "⌃N" }, run: function() { self.openNote(self.newNote(), "New Note"); return false } },
          { id: "delete", title: "Delete Note", icon: "󰧧", style: "destructive", shortcut: { modifiers: ["ctrl"], key: "d", label: "⌃D" }, run: function(item) { self.deleteNote(item.data.id); return true } }
        ] } ] }
      })
    }
    return { id: "notes", type: "list", navigationTitle: "Notes", searchBarPlaceholder: "Search notes…", filtering: true, isShowingDetail: true, items: items,
      emptyView: { icon: "󰎞", title: "No notes yet", description: "Press Enter to create one" },
      actions: { sections: [ { actions: [ { id: "new", title: "New Note", icon: "󰐕", run: function() { host.openNote(host.newNote(), "New Note"); return false } } ] } ] } }
  }

  function deleteNote(id) {
    var self = host
    host.confirm("Delete this note?", "Delete", function() {
      var w = self.windowRef()
      if (w && w.noteId === id) { w.noteId = ""; w.hide() }
      self.notes = self.notes.filter(function(n) { return n.id !== id })
      indexFile.setText(JSON.stringify({ version: 1, items: self.notes }, null, 2) + "\n")
      Quickshell.execDetached(["rm", "-f", self.dir + "/" + id + ".md"])
      self.render(self.buildView())
    })
  }

  function open(win, args) {
    host.panel = win
    var mode = args && args.mode ? String(args.mode) : "search"
    if (mode === "toggle") {
      var w = windowRef()
      if (w && w.shown) { w.hide(); if (host.panel) host.panel.dismiss(); return }
      var id = host.notes.length ? host.notes[0].id : newNote()
      openNote(id, host.notes.length ? host.notes[0].title : "New Note")
      return
    }
    if (mode === "new") { openNote(newNote(), "New Note"); return }
    loader.running = true
    host.push(buildView())
  }

  FileView {
    id: indexFile
    path: host.indexPath
    printErrors: false
    atomicWrites: true
    onLoaded: { try { var d = JSON.parse(text()); host.notes = d && Array.isArray(d.items) ? d.items : [] } catch (e) { host.notes = [] } }
    onLoadFailed: host.notes = []
  }

  // Load note bodies for previews/search in one pass.
  Process {
    id: loader
    command: ["bash", "-c", "mkdir -p " + JSON.stringify(host.dir) + "; cd " + JSON.stringify(host.dir) + " && for f in *.md; do [[ -f $f ]] || continue; printf '===%s===\\n' \"${f%.md}\"; head -c 2000 \"$f\"; printf '\\n=== EOM ===\\n'; done"]
    stdout: StdioCollector {
      onStreamFinished: {
        var p = {}
        var blocks = String(text || "").split("=== EOM ===")
        for (var i = 0; i < blocks.length; i++) {
          var m = blocks[i].match(/===(.+?)===\n([\s\S]*)$/)
          if (m) p[m[1]] = m[2].replace(/\n$/, "")
        }
        host.previews = p
        if (host.activeViewId === "notes") host.render(host.buildView())
      }
    }
  }

  Component.onCompleted: Qt.callLater(function() { mkdir.running = true })
  Process { id: mkdir; command: ["mkdir", "-p", host.dir]; onExited: indexFile.reload() }
}
