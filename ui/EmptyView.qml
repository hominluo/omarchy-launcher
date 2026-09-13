import QtQuick
import qs.Commons

Item {
  id: root
  property string icon: "󰍉"
  property string title: "No results"
  property string description: ""
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily

  Column {
    anchors.centerIn: parent
    spacing: Style.space(8)
    width: Math.min(parent.width - Style.space(40), Style.space(420))

    Text {
      width: parent.width
      text: root.icon
      color: root.foreground
      opacity: 0.5
      font.family: root.fontFamily
      font.pixelSize: Style.font.displayLarge
      horizontalAlignment: Text.AlignHCenter
      textFormat: Text.PlainText
    }
    Text {
      width: parent.width
      text: root.title
      color: root.foreground
      opacity: 0.75
      font.family: root.fontFamily
      font.pixelSize: Style.font.title
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.Wrap
      textFormat: Text.PlainText
    }
    Text {
      width: parent.width
      visible: root.description.length > 0
      text: root.description
      color: root.foreground
      opacity: 0.5
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.Wrap
      textFormat: Text.PlainText
    }
  }
}
