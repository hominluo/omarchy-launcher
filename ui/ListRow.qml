import QtQuick
import qs.Commons
import qs.Ui

// One result row: icon, title, dimmed subtitle, right-aligned accessory.
// Colors follow the single-cursor contract: visuals derive from hasCursor,
// never from containsMouse.
BorderSurface {
  id: row

  required property int index
  required property string itemId
  required property string title
  required property string subtitle
  required property string iconKind
  required property string iconValue
  required property string accessoryText

  property bool hasCursor: false
  property var iconResolver: null
  property color foreground: Color.menu.text
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property var selectedBorderSpec: Border.none()
  property string fontFamily: Style.font.menuFamily
  property real horizontalInset: Style.space(8)

  signal hovered(var mouse)
  signal clicked()

  readonly property color textColor: hasCursor ? selectedText : foreground

  radius: Math.min(Style.cornerRadius, Style.space(8))
  color: hasCursor ? selectedBackground : "transparent"
  borderSpec: hasCursor ? selectedBorderSpec : Border.none()

  IconGlyph {
    id: icon
    anchors.left: parent.left
    anchors.leftMargin: row.horizontalInset + Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    kind: row.iconKind
    value: row.iconValue
    iconResolver: row.iconResolver
    foreground: row.textColor
    fontFamily: row.fontFamily
    size: Style.space(22)
    visible: row.iconKind.length > 0
  }

  Row {
    id: labels
    anchors.left: icon.visible ? icon.right : parent.left
    anchors.leftMargin: icon.visible ? Style.space(10) : row.horizontalInset + Style.space(6)
    anchors.right: trailing.left
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(8)

    Text {
      id: titleText
      text: row.title
      color: row.textColor
      font.family: row.fontFamily
      font.pixelSize: Style.font.subtitle
      font.weight: Font.Medium
      elide: Text.ElideRight
      textFormat: Text.PlainText
      width: Math.min(implicitWidth, labels.width - (subtitleText.visible ? Math.min(subtitleText.implicitWidth, labels.width * 0.45) + labels.spacing : 0))
    }

    Text {
      id: subtitleText
      visible: row.subtitle.length > 0
      text: row.subtitle
      color: row.foreground
      opacity: 0.55
      font.family: row.fontFamily
      font.pixelSize: Style.font.body
      elide: Text.ElideRight
      textFormat: Text.PlainText
      width: Math.min(implicitWidth, labels.width - titleText.width - labels.spacing)
    }
  }

  Text {
    id: trailing
    anchors.right: parent.right
    anchors.rightMargin: row.horizontalInset + Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    text: row.accessoryText
    visible: text.length > 0
    color: row.foreground
    opacity: 0.5
    font.family: row.fontFamily
    font.pixelSize: Style.font.bodySmall
    textFormat: Text.PlainText
    width: visible ? Math.min(implicitWidth, row.width * 0.3) : 0
    elide: Text.ElideRight
    horizontalAlignment: Text.AlignRight
  }

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onPositionChanged: function(mouse) { row.hovered(mouse) }
    onEntered: row.hovered({ x: mouseX, y: mouseY })
    onClicked: row.clicked()
  }
}
