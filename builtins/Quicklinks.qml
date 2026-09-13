import QtQuick
import Quickshell
import Quickshell.Io

// Quicklinks: saved URLs with an optional {query} placeholder. Each one is a
// root entry; links with a placeholder open a query view first. Links
// flagged as fallbacks show at the bottom of root search as "Search X for…".
BuiltinHost {
  id: host

  readonly property string linksPath: service ? service.configDir + "/quicklinks.json" : ""
  property var links: []
  property var pendingLink: null

  readonly property var defaults: [
    { id: "google", name: "Search Google", link: "https://www.google.com/search?q={query}", icon: "󰖟", fallback: true },
    { id: "duckduckgo", name: "Search DuckDuckGo", link: "https://duckduckgo.com/?q={query}", icon: "󰖟", fallback: true },
    { id: "github", name: "Search GitHub", link: "https://github.com/search?q={query}", icon: "󰊤", fallback: true },
    { id: "archwiki", name: "Search Arch Wiki", link: "https://wiki.archlinux.org/index.php?search={query}", icon: "󰣇", fallback: true },
    { id: "aur", name: "Search AUR", link: "https://aur.archlinux.org/packages?K={query}", icon: "󰣇", fallback: false },
    { id: "youtube", name: "Search YouTube", link: "https://www.youtube.com/results?search_query={query}", icon: "󰗃", fallback: false },
    { id: "wikipedia", name: "Search Wikipedia", link: "https://en.wikipedia.org/w/index.php?search={query}", icon: "󰖬", fallback: false }
  ]

  function hasQuery(link) { return /\{query(?::raw)?\}|\{argument[^}]*\}/i.test(String(link.link || "")) }

  function resolve(link, query) {
    var q = String(query || "")
    return String(link.link || "")
      .replace(/\{query:raw\}/gi, q)
      .replace(/\{query\}/gi, encodeURIComponent(q))
      .replace(/\{argument[^}]*\}/gi, encodeURIComponent(q))
  }

  function openLink(link, query) {
    var url = resolve(link, query)
    if (link.openWith) Quickshell.execDetached(["bash", "-lc", "uwsm-app -- gtk-launch " + JSON.stringify(String(link.openWith) + ".desktop") + " " + JSON.stringify(url)])
    else Quickshell.execDetached(["xdg-open", url])
  }

  function rootEntries() {
    var out = []
    for (var i = 0; i < host.links.length; i++) {
      var l = host.links[i]
      out.push({
        id: "ql:" + l.id,
        kind: "quicklink",
        title: l.name,
        subtitle: hasQuery(l) ? "" : String(l.link).replace(/^https?:\/\//, "").slice(0, 60),
        keywords: ["quicklink", String(l.link)],
        aliases: [],
        baseAliases: [],
        icon: l.icon || "󰌹",
        accessoryText: "Quicklink",
        enabled: true,
        favorite: false,
        primaryTitle: hasQuery(l) ? "Search" : "Open",
        link: l,
        run: function(e, win) {
          if (hasQuery(e.link)) { host.openQueryView(win, e.link); return true }
          host.openLink(e.link, "")
        }
      })
    }
    return out
  }

  // Fallback rows for a root query with weak matches.
  function fallbackItems(query) {
    var out = []
    for (var i = 0; i < host.links.length; i++) {
      var l = host.links[i]
      if (!l.fallback || !hasQuery(l)) continue
      out.push({
        id: "fallback:" + l.id,
        title: l.name.replace(/^Search /, "Search ") + " for “" + query + "”",
        icon: l.icon || "󰌹",
        accessories: [{ text: "Quicklink" }],
        data: { fallbackLink: l, query: query },
        actions: { sections: [{ actions: [
          { id: "open", title: "Open", icon: "󰏌", run: function(item) { host.openLink(item.data.fallbackLink, item.data.query); return false } }
        ] }] }
      })
    }
    return out
  }

  function openQueryView(win, link) {
    host.panel = win
    host.pendingLink = link
    host.push(queryView(link, ""))
  }

  function queryView(link, query) {
    var self = host
    var items = query ? [{
      id: "go",
      title: link.name.replace(/^Search /, "") + ": " + query,
      subtitle: resolve(link, query),
      icon: link.icon || "󰌹",
      data: { query: query },
      actions: { sections: [{ actions: [
        { id: "open", title: "Open", icon: "󰏌", run: function(item) { self.openLink(link, item.data.query); return false } },
        { id: "copy", title: "Copy URL", icon: "󰆏", run: function(item) { self.copyText(self.resolve(link, item.data.query)); return false } }
      ] }] }
    }] : []
    return {
      id: "quicklink-query",
      type: "list",
      navigationTitle: link.name,
      searchBarPlaceholder: "Type to " + link.name.toLowerCase() + "…",
      filtering: false,
      searchText: query,
      items: items,
      emptyView: { icon: link.icon || "󰌹", title: "Type your search", description: String(link.link) }
    }
  }

  function searchText(viewId, text) {
    if (viewId !== "quicklink-query" || !host.pendingLink) return
    host.render(queryView(host.pendingLink, text))
  }

  function buildView() {
    var items = []
    for (var i = 0; i < host.links.length; i++) {
      var l = host.links[i]
      var self = host
      items.push({
        id: l.id, title: l.name, subtitle: String(l.link), icon: l.icon || "󰌹",
        data: { link: l },
        actions: { sections: [{ actions: [
          { id: "open", title: hasQuery(l) ? "Search" : "Open", icon: "󰏌", run: function(item, win) { if (self.hasQuery(item.data.link)) { self.openQueryView(win, item.data.link); return true } self.openLink(item.data.link, ""); return false } },
          { id: "copy", title: "Copy Link", icon: "󰆏", run: function(item) { self.copyText(item.data.link.link); return false } },
          { id: "edit", title: "Edit quicklinks.json", icon: "󰲶", run: function() { Quickshell.execDetached(["xdg-open", self.linksPath]); return false } }
        ] }] }
      })
    }
    return { id: "quicklinks", type: "list", navigationTitle: "Quicklinks", searchBarPlaceholder: "Search quicklinks…", filtering: true, items: items,
      emptyView: { icon: "󰌹", title: "No quicklinks", description: "Add entries to ~/.config/omarchy-launcher/quicklinks.json" } }
  }

  function reload() { file.reload() }

  function open(win, args) { host.panel = win; host.push(buildView()) }

  function load(raw) {
    var data = null
    try { data = JSON.parse(raw) } catch (e) { data = null }
    var list = data && Array.isArray(data.items) ? data.items : []
    var out = []
    for (var i = 0; i < list.length; i++) {
      var l = list[i]
      if (!l || !l.link) continue
      out.push({ id: String(l.id || ("link-" + i)), name: String(l.name || l.link), link: String(l.link), icon: l.icon ? String(l.icon) : "", openWith: l.openWith ? String(l.openWith) : "", fallback: l.fallback === true })
    }
    host.links = out
    if (service) service.rebuildIndex()
    if (host.activeViewId === "quicklinks") host.render(buildView())
  }

  FileView {
    id: file
    path: host.linksPath
    watchChanges: true
    printErrors: false
    onLoaded: host.load(text())
    onLoadFailed: {
      var seed = { version: 1, items: host.defaults }
      setText(JSON.stringify(seed, null, 2) + "\n")
      host.load(JSON.stringify(seed))
    }
    onFileChanged: reload()
  }
}
