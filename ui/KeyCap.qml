import QtQuick
import qs.Commons

// A small rounded key label, e.g. "↵" or "⌃K", for the status bar and the
// action panel.
Rectangle {
  id: root
  property string text: ""
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily

  implicitWidth: Math.max(label.implicitWidth + Style.space(10), Style.space(20))
  implicitHeight: Style.space(20)
  radius: Math.min(Style.cornerRadius, Style.space(5))
  color: Util.alpha(foreground, 0.10)

  Text {
    id: label
    anchors.centerIn: parent
    text: root.text
    color: root.foreground
    opacity: 0.85
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    textFormat: Text.PlainText
  }
}
