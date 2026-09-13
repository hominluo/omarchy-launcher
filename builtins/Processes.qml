import QtQuick
import Quickshell
import Quickshell.Io

// Kill Process: live process table sorted by CPU, refreshed while open.
BuiltinHost {
  id: host

  property var rows: []
  property string sortKey: "cpu"
  property string collected: ""

  function parse(raw) {
    var lines = String(raw || "").split("\n")
    var out = []
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue
      var m = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s*(.*)$/)
      if (!m) continue
      out.push({ pid: m[1], cpu: parseFloat(m[2]) || 0, mem: parseFloat(m[3]) || 0, rss: parseInt(m[4], 10) || 0, comm: m[5], args: m[6] })
    }
    return out
  }

  function humanRss(kb) {
    if (kb > 1024 * 1024) return (kb / 1024 / 1024).toFixed(1) + " GB"
    if (kb > 1024) return Math.round(kb / 1024) + " MB"
    return kb + " KB"
  }

  function buildView() {
    var list = host.rows.slice()
    list.sort(function(a, b) { return host.sortKey === "mem" ? b.rss - a.rss : b.cpu - a.cpu })
    var items = []
    var self = host
    for (var i = 0; i < Math.min(list.length, 300); i++) {
      var p = list[i]
      items.push({
        id: "pid:" + p.pid,
        title: p.comm,
        subtitle: p.args.length > 70 ? p.args.slice(0, 70) + "…" : p.args,
        icon: "󰯈",
        keywords: [p.pid, p.args],
        accessories: [{ text: p.cpu.toFixed(1) + "% CPU" }, { text: humanRss(p.rss) }],
        data: { pid: p.pid, comm: p.comm },
        actions: { sections: [
          { actions: [
            { id: "kill", title: "Kill Process", icon: "󰯈", style: "destructive", run: function(item) { self.kill(item.data.pid, "TERM"); return true } },
            { id: "kill9", title: "Force Kill (SIGKILL)", icon: "󰯈", style: "destructive", run: function(item) { self.kill(item.data.pid, "KILL"); return true } },
            { id: "killall", title: "Kill All “" + p.comm + "”", icon: "󰯈", style: "destructive", run: function(item) { self.killAll(item.data.comm); return true } }
          ] },
          { actions: [
            { id: "copy-pid", title: "Copy PID", icon: "󰆏", run: function(item) { self.copyText(item.data.pid); return false } },
            { id: "sort", title: host.sortKey === "cpu" ? "Sort by Memory" : "Sort by CPU", icon: "󰓡", shortcut: { modifiers: ["ctrl"], key: "s", label: "⌃S" }, run: function() { self.sortKey = self.sortKey === "cpu" ? "mem" : "cpu"; self.refresh(); return true } }
          ] }
        ] }
      })
    }
    return { id: "processes", type: "list", navigationTitle: "Kill Process · by " + (host.sortKey === "cpu" ? "CPU" : "memory"), searchBarPlaceholder: "Search processes…", filtering: true, items: items,
      emptyView: { icon: "󰯈", title: "No processes" } }
  }

  function kill(pid, sig) {
    Quickshell.execDetached(["kill", "-" + sig, String(pid)])
    host.toast("success", "Sent SIG" + sig + " to " + pid)
    refreshTimer.restart()
  }

  function killAll(comm) {
    Quickshell.execDetached(["pkill", "-x", "--", String(comm)])
    host.toast("success", "Killed all " + comm)
    refreshTimer.restart()
  }

  function refresh() { if (host.activeViewId === "processes") host.render(buildView()) }

  function open(win, args) {
    host.panel = win
    host.push(buildView())
    sampler.running = true
    ticker.start()
  }

  function viewPopped(viewId) {
    if (viewId === "processes") { ticker.stop(); host.activeViewId = "" }
  }

  Process {
    id: sampler
    command: ["ps", "-eo", "pid,pcpu,pmem,rss,comm,args", "--no-headers", "--sort=-pcpu"]
    stdout: StdioCollector { onStreamFinished: { host.rows = host.parse(text); host.refresh() } }
  }

  Timer {
    id: ticker
    interval: 3000
    repeat: true
    onTriggered: { if (host.activeViewId === "processes" && host.panel && host.panel.opened) sampler.running = true; else ticker.stop() }
  }
  Timer { id: refreshTimer; interval: 400; onTriggered: sampler.running = true }
}
