import QtQuick
import Quickshell
import Quickshell.Io

// Color Picker: hyprpicker on screen, history as a grid of swatches with
// every format one action away.
BuiltinHost {
  id: host

  readonly property string historyPath: service ? service.stateDir + "/colors.json" : ""
  property var history: []      // ["#rrggbb", ...] newest first

  function hexToRgb(hex) {
    var m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2
    if (max !== min) {
      var d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h *= 60
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
  }

  function formats(hex) {
    var rgb = hexToRgb(hex), hsl = rgbToHsl(rgb[0], rgb[1], rgb[2])
    return [
      { title: "HEX", value: hex.toLowerCase() },
      { title: "RGB", value: "rgb(" + rgb.join(", ") + ")" },
      { title: "HSL", value: "hsl(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%)" },
      { title: "QML", value: "Qt.rgba(" + (rgb[0] / 255).toFixed(3) + ", " + (rgb[1] / 255).toFixed(3) + ", " + (rgb[2] / 255).toFixed(3) + ", 1)" },
      { title: "Hex (no #)", value: hex.replace("#", "").toLowerCase() }
    ]
  }

  function pick(win) {
    host.panel = win
    if (win) win.dismiss()
    picker.running = true
  }

  function remember(hex) {
    var next = [hex].concat(host.history.filter(function(h) { return h !== hex })).slice(0, 60)
    host.history = next
    historyFile.setText(JSON.stringify({ version: 1, items: next }) + "\n")
  }

  function gridView() {
    var self = host
    var items = host.history.map(function(hex) {
      return { id: hex, title: hex, content: { color: hex }, keywords: [hex],
        actions: { sections: [ { actions: self.formats(hex).map(function(f) {
          return { id: "copy-" + f.title, title: "Copy " + f.title + "  " + f.value, icon: "󰆏", run: function() { self.copyText(f.value); self.toast("success", "Copied " + f.value); return true } }
        }) }, { actions: [
          { id: "pick", title: "Pick New Color", icon: "󰈊", shortcut: { modifiers: ["ctrl"], key: "n", label: "⌃N" }, run: function(item, w) { self.pick(w); return false } },
          { id: "remove", title: "Remove from History", icon: "󰧧", style: "destructive", run: function(item) { self.history = self.history.filter(function(h) { return h !== item.id }); historyFile.setText(JSON.stringify({ version: 1, items: self.history }) + "\n"); self.render(self.gridView()); return true } }
        ] } ] } }
    })
    return { id: "colors", type: "grid", columns: 8, aspectRatio: "1", inset: "medium", navigationTitle: "Color History", searchBarPlaceholder: "Search colors…", filtering: true, items: items,
      emptyView: { icon: "󰈊", title: "No colors yet", description: "Run “Pick Color” to sample the screen" },
      actions: { actions: [ { id: "pick", title: "Pick Color", icon: "󰈊", run: function(item, w) { host.pick(w); return false } } ] } }
  }

  function open(win, args) {
    host.panel = win
    if (args && args.mode === "pick") { pick(win); return }
    host.push(gridView())
  }

  Process {
    id: picker
    command: ["bash", "-c", "sleep 0.2; hyprpicker -f hex -n 2>/dev/null"]
    stdout: StdioCollector {
      onStreamFinished: {
        var hex = String(text || "").trim().toLowerCase()
        if (!/^#[0-9a-f]{6}$/.test(hex)) return
        host.remember(hex)
        Quickshell.execDetached(["wl-copy", "--", hex])
        Quickshell.execDetached(["omarchy-notification-send", "-g", "󰈊", "Picked " + hex, "Copied to clipboard"])
      }
    }
  }

  FileView {
    id: historyFile
    path: host.historyPath
    printErrors: false
    atomicWrites: true
    onLoaded: { try { var d = JSON.parse(text()); host.history = d && Array.isArray(d.items) ? d.items : [] } catch (e) { host.history = [] } }
    onLoadFailed: host.history = []
  }
}
