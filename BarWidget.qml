import QtQuick
import qs.Ui

// Bar button: a visible way in for anyone who forgot the shortcut. Left
// click toggles the launcher, right click opens the stock Omarchy menu, and
// the tooltip spells out the configured hotkey. The icon lights up while
// the launcher is open.
BarWidget {
  id: root
  moduleName: "io.github.hominluo.launcher"

  readonly property string pluginId: "io.github.hominluo.launcher"
  // The plugin's own service, reached through the bar host's shell facade.
  readonly property var service: {
    var host = bar && bar.shell ? bar.shell : null
    if (!host || typeof host.serviceFor !== "function") return null
    return host.serviceFor(root.pluginId)
  }
  readonly property string hotkey: service && service.settings && service.settings.hotkey ? String(service.settings.hotkey) : "SUPER + D"
  readonly property bool launcherOpen: service ? service.windowOpen === true : false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: String(root.setting("icon", "󱓞"))
    horizontalMargin: 7.5
    active: root.launcherOpen
    useActiveColor: true
    tooltipText: "Launcher  ·  " + root.hotkey
    onPressed: function(mouseButton) {
      if (!root.bar) return
      if (mouseButton === Qt.RightButton) root.bar.run("omarchy-menu toggle")
      else root.bar.run("omarchy-shell shell toggle " + root.pluginId)
    }
  }
}
