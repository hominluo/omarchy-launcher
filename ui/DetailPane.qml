import QtQuick
import qs.Commons

// Markdown detail plus an optional metadata column, used both as the right
// half of a split list and as a full Detail view.
Item {
  id: pane
  property string markdown: ""
  property string image: ""
  property var metadata: []
  property bool isLoading: false
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily
  property real padding: Style.space(14)

  function scrollBy(lines) {
    var step = Style.space(24) * lines
    flick.contentY = Math.max(0, Math.min(Math.max(0, flick.contentHeight - flick.height), flick.contentY + step))
  }

  Flickable {
    id: flick
    anchors.fill: parent
    anchors.margins: pane.padding
    contentWidth: width
    contentHeight: column.height
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: column
      width: flick.width
      spacing: Style.space(10)

      Image {
        id: picture
        width: parent.width
        visible: pane.image.length > 0
        height: visible ? Math.min(implicitHeight * (width / Math.max(1, implicitWidth)), flick.height * 0.7) : 0
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        cache: false
        source: pane.image
        sourceSize.width: 1600
        horizontalAlignment: Image.AlignLeft
      }

      Text {
        id: body
        width: parent.width
        visible: pane.markdown.length > 0
        text: pane.markdown
        textFormat: Text.MarkdownText
        wrapMode: Text.Wrap
        color: pane.foreground
        font.family: pane.fontFamily
        font.pixelSize: Style.font.body
        linkColor: Color.accent
        onLinkActivated: function(link) { Qt.openUrlExternally(link) }
      }

      Rectangle {
        width: parent.width
        height: Style.spacing.hairline
        visible: (body.visible || picture.visible) && metaRepeater.count > 0
        color: Util.alpha(pane.foreground, 0.12)
      }

      Column {
        width: parent.width
        spacing: Style.space(6)
        Repeater {
          id: metaRepeater
          model: pane.metadata ? pane.metadata.length : 0
          delegate: Item {
            required property int index
            readonly property var meta: pane.metadata[index] || {}
            width: parent.width
            height: meta.kind === "separator" ? Style.space(8) : Math.max(labelText.implicitHeight, valueText.implicitHeight)
            Rectangle {
              visible: meta.kind === "separator"
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width
              height: Style.spacing.hairline
              color: Util.alpha(pane.foreground, 0.12)
            }
            Text {
              id: labelText
              visible: meta.kind !== "separator"
              anchors.left: parent.left
              width: parent.width * 0.4
              text: String(meta.title || "")
              color: pane.foreground
              opacity: 0.55
              elide: Text.ElideRight
              font.family: pane.fontFamily
              font.pixelSize: Style.font.bodySmall
              textFormat: Text.PlainText
            }
            Text {
              id: valueText
              visible: meta.kind !== "separator"
              anchors.right: parent.right
              width: parent.width * 0.58
              horizontalAlignment: Text.AlignRight
              text: {
                if (meta.kind === "tags") return (meta.tags || []).map(function(t) { return t && t.text !== undefined ? t.text : t }).join(", ")
                var v = meta.text
                if (v && typeof v === "object") v = v.value
                return String(v === undefined || v === null ? "" : v)
              }
              color: meta.kind === "link" ? Color.accent : pane.foreground
              elide: Text.ElideRight
              font.family: pane.fontFamily
              font.pixelSize: Style.font.bodySmall
              textFormat: Text.PlainText
              MouseArea {
                anchors.fill: parent
                enabled: meta.kind === "link" && !!meta.target
                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                onClicked: Qt.openUrlExternally(String(meta.target))
              }
            }
          }
        }
      }
    }
  }
}
