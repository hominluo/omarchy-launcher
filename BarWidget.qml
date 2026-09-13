import QtQuick
import qs.Ui

// Bar button: left click opens the launcher, right click opens the stock
// Omarchy menu so the system menu stays one click away.
BarWidget {
  id: root
  moduleName: "io.github.hominluo.launcher"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: String(root.setting("icon", "󱓞"))
    horizontalMargin: 7.5
    tooltipText: "Launcher"
    onPressed: function(mouseButton) {
      if (!root.bar) return
      if (mouseButton === Qt.RightButton) root.bar.run("omarchy-menu toggle")
      else root.bar.run("omarchy-shell shell toggle io.github.hominluo.launcher")
    }
  }
}
