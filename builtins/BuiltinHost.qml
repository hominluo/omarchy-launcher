import QtQuick
import Quickshell
import Quickshell.Io

// Base type for built-in commands. A built-in produces views through the
// same JSON view model the extension runtime uses, so the window renders
// both the same way. Subclasses override open() and, when they push views,
// searchText()/invoke()/viewPopped().
Item {
  id: host
  width: 0
  height: 0
  visible: false

  property var service: null
  // The LauncherWindow this built-in is currently driving; set by open().
  property var panel: null
  property string activeViewId: ""

  // ---- lifecycle hooks (override)
  function open(win, args) { host.panel = win }
  function searchText(viewId, text) {}
  function invoke(viewId, actionId, ctx) {}
  function viewPopped(viewId) { if (viewId === host.activeViewId) host.activeViewId = "" }

  // ---- helpers
  function push(view) {
    if (!host.panel) return null
    var pushed = host.panel.pushView(view, host)
    if (pushed) host.activeViewId = pushed.id
    return pushed
  }
  function render(view) { if (host.panel) host.panel.renderView(view) }
  function pop() { if (host.panel) host.panel.popView() }
  function close() { if (host.panel) host.panel.dismiss() }
  function toast(style, title, message) { if (host.panel) host.panel.showToast({ style: style, title: title, message: message || "" }) }
  function confirm(message, confirmText, onConfirmed) { if (host.panel) host.panel.confirm(message, confirmText, onConfirmed) }
  function setSearchText(text) { if (host.panel) host.panel.setSearchText(text) }

  function copyText(text) {
    Quickshell.execDetached(["wl-copy", "--", String(text)])
  }

  // Type into the previously focused window. The launcher hides first so
  // the paste lands in the app underneath (same dance as Omarchy's own
  // emoji insert), via the shipped paste helper.
  function pasteText(text) {
    var script = host.service ? host.service.pluginDir + "/bin/paste.sh" : ""
    if (host.panel) host.panel.dismiss()
    Quickshell.execDetached(["bash", script, String(text)])
  }

  // Run a command line detached (bash -lc so PATH matches a terminal).
  function runDetached(commandLine) {
    Quickshell.execDetached(["bash", "-lc", String(commandLine)])
  }

  function runArgv(argv) {
    Quickshell.execDetached(argv)
  }

  function action(id, title, opts) {
    var a = { id: id, title: title }
    if (opts) for (var k in opts) a[k] = opts[k]
    return a
  }
}
