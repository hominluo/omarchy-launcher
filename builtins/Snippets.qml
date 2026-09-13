import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/Snippets.js" as Expand

// Search Snippets: a searchable list of text snippets with dynamic
// placeholders, stored in ~/.config/omarchy-launcher/snippets.json.
BuiltinHost {
  id: host

  readonly property string snippetsPath: service ? service.configDir + "/snippets.json" : ""
  property var snippets: []
  property string clipboardText: ""

  // Root entries: every snippet is searchable directly ("sig" -> paste).
  function rootEntries() {
    var out = []
    for (var i = 0; i < host.snippets.length; i++) {
      var s = host.snippets[i]
      out.push({
        id: "snip:" + s.id,
        kind: "snippet",
        title: s.name,
        subtitle: firstLine(s.text),
        keywords: [s.keyword || "", "snippet"],
        aliases: s.keyword ? [s.keyword] : [],
        baseAliases: s.keyword ? [s.keyword] : [],
        icon: "󰧭",
        accessoryText: "Snippet",
        enabled: true,
        favorite: false,
        primaryTitle: "Paste",
        snippet: s,
        run: function(e) { host.pasteSnippet(e.snippet) }
      })
    }
    return out
  }

  function firstLine(text) {
    var t = String(text || "").trim().split("\n")[0]
    return t.length > 80 ? t.slice(0, 80) + "…" : t
  }

  function expanded(s, args) {
    return Expand.expand(s.text, { clipboard: host.clipboardText, args: args || {} })
  }

  function pasteSnippet(s) {
    var r = expanded(s)
    if (host.panel) host.panel.dismiss()
    var script = service.pluginDir + "/bin/paste.sh"
    Quickshell.execDetached(["bash", "-c",
      "bash " + JSON.stringify(script) + " \"$1\"; n=$2; if (( n > 0 )); then sleep 0.05; for ((i=0;i<n;i++)); do wtype -k Left; done; fi",
      "--", r.text, String(r.cursor >= 0 ? r.text.length - r.cursor : 0)])
  }

  function copySnippet(s) {
    Quickshell.execDetached(["wl-copy", "--", expanded(s).text])
  }

  function buildView() {
    var items = []
    for (var i = 0; i < host.snippets.length; i++) {
      var s = host.snippets[i]
      var self = host
      items.push({
        id: String(s.id),
        title: s.name,
        subtitle: s.keyword ? s.keyword : "",
        icon: "󰧭",
        keywords: [s.text],
        detail: { markdown: "```\n" + String(s.text || "") + "\n```", metadata: s.keyword ? [{ kind: "label", title: "Keyword", text: s.keyword }] : [] },
        data: { snippet: s },
        actions: { sections: [ { actions: [
          { id: "paste", title: "Paste", icon: "󰆒", run: function(item) { self.pasteSnippet(item.data.snippet); return false } },
          { id: "copy", title: "Copy to Clipboard", icon: "󰆏", run: function(item) { self.copySnippet(item.data.snippet); return false } }
        ] }, { actions: [
          { id: "edit", title: "Edit Snippet", icon: "󰲶", shortcut: { modifiers: ["ctrl"], key: "e", label: "⌃E" }, run: function(item) { self.editSnippet(item.data.snippet); return true } },
          { id: "create", title: "Create Snippet", icon: "󰐕", shortcut: { modifiers: ["ctrl"], key: "n", label: "⌃N" }, run: function() { self.editing = null; self.push(self.formView(null, {})); return true } },
          { id: "delete", title: "Delete Snippet", icon: "󰧧", style: "destructive", shortcut: { modifiers: ["ctrl"], key: "d", label: "⌃D" }, run: function(item) { self.deleteSnippet(item.data.snippet); return true } },
          { id: "file", title: "Edit snippets.json", icon: "󰈤", run: function() { self.openEditor(); return false } }
        ] } ] }
      })
    }
    return {
      id: "snippets",
      type: "list",
      navigationTitle: "Snippets",
      searchBarPlaceholder: "Search snippets…",
      filtering: true,
      isShowingDetail: true,
      items: items,
      emptyView: { icon: "󰧭", title: "No snippets yet", description: "Press Enter to create one" },
      actions: { sections: [ { actions: [ { id: "create", title: "Create Snippet", icon: "󰐕", run: function() { host.editing = null; host.push(host.formView(null, {})); return true } } ] } ] }
    }
  }

  function openEditor() {
    Quickshell.execDetached(["bash", "-lc", "xdg-open " + JSON.stringify(host.snippetsPath)])
  }

  function reload() { file.reload() }

  function open(win, args) {
    host.panel = win
    clipboardProbe.running = true
    if (args && args.mode === "create") { host.push(formView(null, {})); return }
    host.push(buildView())
  }

  // ---- create / edit

  function formView(existing, errors) {
    var e = errors || {}
    return {
      id: existing ? "snippet-edit" : "snippet-create",
      type: "form",
      navigationTitle: existing ? "Edit Snippet" : "Create Snippet",
      fields: [
        { id: "name", field: "text", title: "Name", placeholder: "Signature", autoFocus: true, value: existing ? existing.name : undefined, error: e.name || "" },
        { id: "keyword", field: "text", title: "Keyword", placeholder: "sig", info: "Optional. Type it in root search to paste the snippet.", value: existing ? existing.keyword : undefined, error: e.keyword || "" },
        { id: "text", field: "textarea", title: "Snippet", placeholder: "Best,\n{cursor}", info: "Placeholders: {clipboard} {date} {time} {datetime} {day} {uuid} {cursor} {argument name=\"x\"}", value: existing ? existing.text : undefined, error: e.text || "" }
      ],
      actions: { actions: [
        { id: "save", title: existing ? "Save Snippet" : "Create Snippet", icon: "󰆓", kind: "submitForm" },
        { id: "cancel", title: "Cancel", kind: "pop" }
      ] }
    }
  }

  property var editing: null

  function formSubmit(viewId, actionId, values) {
    if (viewId !== "snippet-create" && viewId !== "snippet-edit") return
    var errors = {}
    if (!String(values.name || "").trim()) errors.name = "A name is required"
    if (!String(values.text || "").trim()) errors.text = "The snippet cannot be empty"
    var kw = String(values.keyword || "").trim()
    for (var i = 0; i < host.snippets.length; i++) {
      var s = host.snippets[i]
      if (kw && s.keyword === kw && (!host.editing || s.id !== host.editing.id)) errors.keyword = "Keyword already used by “" + s.name + "”"
    }
    if (Object.keys(errors).length) { host.render(formView(host.editing ? Object.assign({}, host.editing, values) : null, errors)); return }
    var list = host.snippets.slice()
    if (host.editing) {
      for (var j = 0; j < list.length; j++) if (list[j].id === host.editing.id) list[j] = { id: list[j].id, name: String(values.name).trim(), keyword: kw, text: String(values.text) }
    } else {
      list.push({ id: "snippet-" + Date.now().toString(36), name: String(values.name).trim(), keyword: kw, text: String(values.text) })
    }
    saveAll(list)
    host.toast("success", host.editing ? "Snippet saved" : "Snippet created", String(values.name).trim())
    host.editing = null
    host.pop()
  }

  function saveAll(list) {
    host.snippets = list
    file.setText(JSON.stringify({ version: 1, items: list }, null, 2) + "\n")
    if (service) service.rebuildIndex()
    if (host.activeViewId === "snippets") host.render(buildView())
  }

  function editSnippet(s) { host.editing = s; host.push(formView(s, {})) }

  function deleteSnippet(s) {
    var self = host
    host.confirm("Delete snippet “" + s.name + "”?", "Delete", function() {
      self.saveAll(self.snippets.filter(function(x) { return x.id !== s.id }))
      self.toast("success", "Deleted " + s.name)
    })
  }

  function load(raw) {
    var data = null
    try { data = JSON.parse(raw) } catch (e) { data = null }
    var list = data && Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])
    var out = []
    for (var i = 0; i < list.length; i++) {
      var s = list[i]
      if (!s || !s.text) continue
      out.push({ id: String(s.id || ("snippet-" + i)), name: String(s.name || firstLine(s.text)), keyword: String(s.keyword || ""), text: String(s.text) })
    }
    host.snippets = out
    if (service) service.rebuildIndex()
    if (host.activeViewId) host.render(buildView())
  }

  FileView {
    id: file
    path: host.snippetsPath
    watchChanges: true
    printErrors: false
    onLoaded: host.load(text())
    onLoadFailed: {
      // Seed an example so the file exists and the format is discoverable.
      var seed = { version: 1, items: [
        { id: "example-date", name: "Today's date", keyword: "today", text: "{date format=\"dddd, MMMM d, yyyy\"}" },
        { id: "example-signature", name: "Signature", keyword: "sig", text: "Best,\n{cursor}" }
      ] }
      setText(JSON.stringify(seed, null, 2) + "\n")
      host.load(JSON.stringify(seed))
    }
    onFileChanged: reload()
  }

  Process {
    id: clipboardProbe
    command: ["wl-paste", "--no-newline", "--type", "text"]
    stdout: StdioCollector { onStreamFinished: host.clipboardText = text }
  }
}
