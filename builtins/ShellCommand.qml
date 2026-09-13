import QtQuick
import Quickshell
import Quickshell.Io

// Run Shell Command: type a command; Enter runs it in a floating terminal,
// Ctrl+Enter runs it silently and shows the output here.
BuiltinHost {
  id: host

  property string query: ""
  property string output: ""
  property bool running: false

  function buildView() {
    var self = host
    var items = host.query.trim() ? [{
      id: "run",
      title: host.query.trim(),
      subtitle: host.running ? "Running…" : (host.output ? "" : "Enter: run in a terminal · Ctrl+Enter: run here"),
      icon: "󰆍",
      detail: host.output ? { markdown: "```\n" + host.output + "\n```" } : null,
      data: { cmd: host.query.trim() },
      actions: { sections: [{ actions: [
        { id: "terminal", title: "Run in Terminal", icon: "󰆍", run: function(item) { Quickshell.execDetached(["bash", "-lc", "omarchy-launch-floating-terminal-with-presentation " + JSON.stringify(item.data.cmd)]); return false } },
        { id: "silent", title: "Run and Show Output", icon: "󰆍", run: function(item) { self.runSilent(item.data.cmd); return true } },
        { id: "copy", title: "Copy Output", icon: "󰆏", run: function() { self.copyText(self.output); return false } }
      ] }] }
    }] : []
    return {
      id: "shell",
      type: "list",
      navigationTitle: "Run Shell Command",
      searchBarPlaceholder: "Enter a shell command…",
      filtering: false,
      isShowingDetail: !!host.output,
      isLoading: host.running,
      searchText: host.query,
      items: items,
      emptyView: { icon: "󰆍", title: "Type a command", description: "Enter runs it in a floating terminal. Ctrl+Enter runs it quietly and shows the output." }
    }
  }

  function open(win, args) {
    host.panel = win
    host.query = args && args.query ? String(args.query) : ""
    host.output = ""
    host.push(buildView())
  }

  function searchText(viewId, text) {
    if (viewId !== "shell") return
    host.query = text
    host.output = ""
    host.render(buildView())
  }

  function runSilent(cmd) {
    host.running = true
    host.output = ""
    runner.command = ["bash", "-lc", cmd + " 2>&1 | head -c 20000"]
    runner.running = true
    host.render(buildView())
  }

  Process {
    id: runner
    stdout: StdioCollector {
      onStreamFinished: {
        host.running = false
        host.output = String(text || "").replace(/\s+$/, "") || "(no output)"
        host.render(host.buildView())
      }
    }
  }
}
