import QtQuick
import qs.Commons

// Bottom strip: what is open on the left, the primary action and the
// action-panel hint on the right, Raycast style.
Item {
  id: bar
  property string glyph: "󱓞"
  property string title: "Launcher"
  property string primaryTitle: "Open"
  property bool primaryVisible: true
  property bool leadingVisible: true
  property bool actionsVisible: true
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily

  signal actionsClicked()
  signal primaryClicked()

  Row {
    visible: bar.leadingVisible
    anchors.left: parent.left
    anchors.leftMargin: Style.space(16)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(8)
    Text {
      text: bar.glyph
      color: bar.foreground
      opacity: 0.7
      font.family: bar.fontFamily
      font.pixelSize: Style.font.title
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
    }
    Text {
      text: bar.title
      color: bar.foreground
      opacity: 0.7
      font.family: bar.fontFamily
      font.pixelSize: Style.font.bodySmall
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      elide: Text.ElideRight
      width: Math.min(implicitWidth, bar.width * 0.4)
    }
  }

  Row {
    anchors.right: parent.right
    anchors.rightMargin: Style.space(12)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(6)

    Item {
      visible: bar.primaryVisible
      width: primaryRow.width
      height: primaryRow.height
      anchors.verticalCenter: parent.verticalCenter
      Row {
        id: primaryRow
        spacing: Style.space(6)
        Text {
          text: bar.primaryTitle
          color: bar.foreground
          opacity: 0.75
          font.family: bar.fontFamily
          font.pixelSize: Style.font.bodySmall
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
        }
        KeyCap { text: "↵"; foreground: bar.foreground; fontFamily: bar.fontFamily; anchors.verticalCenter: parent.verticalCenter }
      }
      MouseArea { anchors.fill: parent; onClicked: bar.primaryClicked() }
    }

    Rectangle {
      visible: bar.primaryVisible && bar.actionsVisible
      width: Style.spacing.hairline
      height: Style.space(16)
      color: Util.alpha(bar.foreground, 0.2)
      anchors.verticalCenter: parent.verticalCenter
    }

    Item {
      visible: bar.actionsVisible
      width: actionsRow.width
      height: actionsRow.height
      anchors.verticalCenter: parent.verticalCenter
      Row {
        id: actionsRow
        spacing: Style.space(6)
        Text {
          text: "Actions"
          color: bar.foreground
          opacity: 0.75
          font.family: bar.fontFamily
          font.pixelSize: Style.font.bodySmall
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
        }
        KeyCap { text: "⌃K"; foreground: bar.foreground; fontFamily: bar.fontFamily; anchors.verticalCenter: parent.verticalCenter }
      }
      MouseArea { anchors.fill: parent; onClicked: bar.actionsClicked() }
    }
  }
}
