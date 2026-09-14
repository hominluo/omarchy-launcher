import QtQuick
import qs.Commons
import qs.Ui

// One result row: icon, title, dimmed subtitle, and a right-aligned cluster
//   [alias pill] [hotkey cap, cursor row only] [✓] [type label] [›]
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
  required property string accessoryIcon
  required property string accessoryColor
  required property string tagText
  required property string tagColor
  required property string hotkeyText
  required property string chevron

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

  property string iconTint: ""
  IconGlyph {
    id: icon
    anchors.left: parent.left
    anchors.leftMargin: row.horizontalInset + Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    kind: row.iconKind
    value: row.iconValue
    tint: row.iconTint
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
    anchors.right: cluster.left
    anchors.rightMargin: cluster.width > 0 ? Style.space(10) : 0
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

  // Right cluster. Each piece hides when empty so the Row packs tightly;
  // the type label is the only elastic part (capped at 30% of the row).
  Row {
    id: cluster
    anchors.right: parent.right
    anchors.rightMargin: row.horizontalInset + Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(6)

    Rectangle {
      id: tagPill
      visible: row.tagText.length > 0
      width: visible ? tagLabel.implicitWidth + Style.space(10) : 0
      height: Style.space(18)
      radius: Math.min(Style.cornerRadius, Style.space(5))
      color: row.tagColor ? Util.alpha(row.tagColor, 0.22) : Util.alpha(row.textColor, 0.12)
      anchors.verticalCenter: parent.verticalCenter
      Text {
        id: tagLabel
        anchors.centerIn: parent
        text: row.tagText
        color: row.tagColor ? row.tagColor : row.textColor
        opacity: row.tagColor ? 1 : 0.85
        font.family: row.fontFamily
        font.pixelSize: Style.font.caption
        textFormat: Text.PlainText
      }
    }

    KeyCap {
      visible: row.hasCursor && row.hotkeyText.length > 0
      text: row.hotkeyText.replace(/\s*\+\s*/g, "+")
      foreground: row.textColor
      fontFamily: row.fontFamily
      anchors.verticalCenter: parent.verticalCenter
    }

    IconGlyph {
      id: trailingIcon
      anchors.verticalCenter: parent.verticalCenter
      visible: row.accessoryIcon.length > 0
      kind: row.accessoryIcon.length ? row.accessoryIcon.split("|")[0] : ""
      value: row.accessoryIcon.length ? row.accessoryIcon.slice(row.accessoryIcon.indexOf("|") + 1) : ""
      iconResolver: row.iconResolver
      foreground: row.accessoryColor ? row.accessoryColor : row.textColor
      fontFamily: row.fontFamily
      size: Style.space(15)
      opacity: row.accessoryColor ? 1 : 0.7
    }

    // Measured separately so the label's width never feeds back into its
    // own layout (a Text whose width depends on its own metrics loops).
    TextMetrics {
      id: trailingMetrics
      font.family: row.fontFamily
      font.pixelSize: Style.font.bodySmall
      text: row.accessoryText
    }

    Text {
      id: trailing
      anchors.verticalCenter: parent.verticalCenter
      text: row.accessoryText
      visible: text.length > 0
      color: row.accessoryColor ? row.accessoryColor : row.textColor
      opacity: row.accessoryColor ? 0.95 : 0.5
      font.family: row.fontFamily
      font.pixelSize: Style.font.bodySmall
      textFormat: Text.PlainText
      width: visible ? Math.ceil(Math.min(trailingMetrics.advanceWidth, row.width * 0.3)) : 0
      clip: true
      horizontalAlignment: Text.AlignRight
    }

    Text {
      visible: row.chevron === "1"
      text: "›"
      color: row.textColor
      opacity: 0.55
      font.family: row.fontFamily
      font.pixelSize: Style.font.title
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
    }
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
