import QtQuick
import Quickshell
import "ui" as Ui

// Menu entry point: the summonable launcher surface. The host loads this once
// (keepLoaded) and calls open(payloadJson) / close(); everything stateful
// lives in Service.qml, which the host injects as `service`.
Item {
  id: root
  width: 0
  height: 0

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null
  property var service: null

  readonly property string pluginId: manifest && manifest.id ? String(manifest.id) : "io.github.hominluo.launcher"
  // The host injects `service` after load; fall back to a lookup so an
  // out-of-order load still works.
  readonly property var core: service ? service : (shell && typeof shell.serviceFor === "function" ? shell.serviceFor(pluginId) : null)
  readonly property bool opened: window.opened


  // Payload routes:
  //   {}                                  root search
  //   {"query": "..."}                    root search, prefilled
  //   {"command": "<id>"}                 run/push a command directly
  //   {"extension": "...", "command": ""} extension command (runtime, later)
  function open(payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (e) { payload = {} }
    window.summon(payload)
  }

  function close() { window.opened = false }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  // Close from inside the window and tell the host so its open-state map
  // stays in sync with ours.
  function dismiss() {
    window.opened = false
    if (root.shell && typeof root.shell.hide === "function") root.shell.hide(root.pluginId)
  }

  Ui.LauncherWindow {
    id: window
    launcher: root
  }
}
