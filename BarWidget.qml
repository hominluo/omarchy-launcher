import QtQuick
import qs.Commons
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
  readonly property bool focusActive: service ? service.focusActive === true : false
  readonly property var menubars: service && service.menubars ? service.menubars : []
  readonly property string focusText: service && service.focusActive ? String(service.focusRemaining) : ""

  implicitWidth: button.implicitWidth + (focusLabel.visible ? focusLabel.implicitWidth + Style.space(4) : 0) + menubarRow.width
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    width: implicitWidth
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

  // One button per active extension menu-bar command; click opens its items.
  Row {
    id: menubarRow
    anchors.left: focusLabel.visible ? focusLabel.right : button.right
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    spacing: 0
    Repeater {
      model: root.menubars.length
      delegate: WidgetButton {
        required property int index
        readonly property var mb: root.menubars[index] || ({})
        readonly property var iconSpec: mb.icon ? root.iconSpecOf(mb.icon) : null
        bar: root.bar
        height: parent.height
        text: (iconSpec && (iconSpec.kind === "glyph" || iconSpec.kind === "emoji" || iconSpec.kind === "raycast-icon") ? (iconSpec.kind === "raycast-icon" ? root.service.raycastGlyph(iconSpec.value) : iconSpec.value) : "󰑣") + (mb.title ? " " + mb.title : "")
        fontFamily: bar ? bar.fontFamily : Style.font.family
        horizontalMargin: 6
        tooltipText: String(mb.tooltip || "")
        dimmed: mb.isLoading === true
        onPressed: function(mouseButton) {
          if (!root.bar) return
          root.bar.run("omarchy-shell shell summon " + root.pluginId + " " + JSON.stringify(JSON.stringify({ menubar: mb.key })))
        }
      }
    }
  }

  function iconSpecOf(icon) {
    if (!icon) return null
    if (typeof icon === "object" && icon.source !== undefined) icon = icon.source
    var s = String(icon)
    if (s.indexOf("icon://") === 0) return { kind: "raycast-icon", value: s.slice(7) }
    if (/^(file|https?|data):/.test(s) || s.charAt(0) === "/") return { kind: "image", value: s }
    var cp = s.codePointAt(0)
    if ((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0x10FFFF)) return { kind: "glyph", value: s }
    return { kind: "emoji", value: s }
  }

  Text {
    id: focusLabel
    visible: root.focusActive
    anchors.left: button.right
    anchors.verticalCenter: parent.verticalCenter
    text: "󰔛 " + root.focusText
    color: bar ? bar.barForeground : Color.foreground
    font.family: bar ? bar.fontFamily : Style.font.family
    font.pixelSize: Style.font.bodySmall
    textFormat: Text.PlainText
  }
}
