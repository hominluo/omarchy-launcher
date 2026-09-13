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
          { id: "copy", title: "Copy to Clipboard", icon: "󰆏", run: function(item) { self.copySnippet(item.data.snippet); return false } },
          { id: "edit", title: "Edit snippets.json", icon: "󰲶", run: function() { self.openEditor(); return false } }
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
      emptyView: { icon: "󰧭", title: "No snippets yet", description: "Add entries to ~/.config/omarchy-launcher/snippets.json" },
      actions: { sections: [ { actions: [ { id: "edit", title: "Edit snippets.json", icon: "󰲶", run: function() { host.openEditor(); return false } } ] } ] }
    }
  }

  function openEditor() {
    Quickshell.execDetached(["bash", "-lc", "xdg-open " + JSON.stringify(host.snippetsPath)])
  }

  function reload() { file.reload() }

  function open(win, args) {
    host.panel = win
    clipboardProbe.running = true
    host.push(buildView())
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
