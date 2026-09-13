import QtQuick
import Quickshell
import qs.Commons

// Renders any icon spec from lib/ViewModel.js iconSpec():
//   app   -> themed application icon via the shell's app library
//   glyph -> Nerd Font glyph
//   emoji -> emoji text
//   image -> any Image source
Item {
  id: root
  property string kind: ""
  property string value: ""
  property var iconResolver: null
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily
  property real size: Style.space(22)

  implicitWidth: size
  implicitHeight: size

  property string tint: ""
  property string mask: ""
  readonly property bool isImage: kind === "app" || kind === "image"
  readonly property string glyphText: kind === "raycast-icon" ? (root.iconResolver && typeof root.iconResolver.raycastGlyph === "function" ? root.iconResolver.raycastGlyph(root.value) : "󰘔") : root.value

  Image {
    id: image
    anchors.centerIn: parent
    visible: root.isImage && source !== ""
    width: root.size
    height: root.size
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    cache: true
    sourceSize.width: width * Screen.devicePixelRatio
    sourceSize.height: height * Screen.devicePixelRatio
    source: {
      if (root.kind === "app") return root.iconResolver ? root.iconResolver.iconSource(root.value) : ""
      if (root.kind === "image") return root.value
      return ""
    }
  }

  Text {
    anchors.centerIn: parent
    visible: !root.isImage
    text: root.glyphText
    color: root.tint ? root.tint : root.foreground
    font.family: root.kind === "emoji" ? "Noto Color Emoji" : root.fontFamily
    font.pixelSize: root.kind === "emoji" ? root.size * 0.78 : root.size * 0.86
    textFormat: Text.PlainText
    horizontalAlignment: Text.AlignHCenter
    verticalAlignment: Text.AlignVCenter
  }
}
