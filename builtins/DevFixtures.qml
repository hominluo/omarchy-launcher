import QtQuick
import Quickshell
import Quickshell.Io

// Hidden developer command: renders view-model fixtures from tests/fixtures
// so every renderer can be checked by eye without a producer behind it.
BuiltinHost {
  id: host

  readonly property string dir: service ? service.pluginDir + "/tests/fixtures" : ""
  property var names: []

  function open(win, args) {
    host.panel = win
    lister.running = true
    host.push(listView())
  }

  function listView() {
    var self = host
    return {
      id: "fixtures",
      type: "list",
      navigationTitle: "Dev: Render Fixture",
      searchBarPlaceholder: "Pick a fixture…",
      filtering: true,
      items: host.names.map(function(n) {
        return { id: n, title: n, icon: "󰨰", data: { name: n },
          actions: { sections: [{ actions: [ { id: "render", title: "Render", run: function(item) { self.load(item.data.name); return true } } ] }] } }
      }),
      emptyView: { icon: "󰨰", title: "No fixtures", description: host.dir }
    }
  }

  function load(name) {
    reader.path = host.dir + "/" + name
    reader.reload()
  }

  function invoke(viewId, actionId, ctx) {
    host.toast("success", "Fixture action", actionId + (ctx && ctx.itemId ? " on " + ctx.itemId : ""))
  }
  function formSubmit(viewId, actionId, values) {
    host.toast("success", "Form submitted", JSON.stringify(values).slice(0, 80))
  }
  function searchText(viewId, text) {}

  Process {
    id: lister
    command: ["bash", "-c", "ls " + host.dir + " 2>/dev/null"]
    stdout: StdioCollector { onStreamFinished: { host.names = String(text || "").split("\n").filter(function(l) { return /\.json$/.test(l) }); if (host.activeViewId === "fixtures") host.render(host.listView()) } }
  }

  FileView {
    id: reader
    printErrors: false
    onLoaded: {
      try { var v = JSON.parse(text()); host.push(v) } catch (e) { host.toast("failure", "Bad fixture", String(e)) }
    }
    onLoadFailed: host.toast("failure", "Cannot read fixture")
  }
}
