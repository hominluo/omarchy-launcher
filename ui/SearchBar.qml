import QtQuick
import QtQuick.Controls
import qs.Commons

// The top search field. A real text input (not a hand-rolled key
// accumulator) so cursor movement, selection, and IME composition all work.
// Navigation chords are intercepted before the field sees them by handing
// every key press to `keyHandler` first.
Item {
  id: bar

  property alias text: field.text
  property string placeholder: "Search…"
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily
  property bool loading: false
  // function(event) -> bool; return true to swallow the key.
  property var keyHandler: null
  property string leadingGlyph: ""

  signal textEdited(string text)

  function focusInput() { field.forceActiveFocus() }
  function reset(text) {
    field.text = text || ""
    field.cursorPosition = field.text.length
  }
  function selectAll() { field.selectAll() }

  Text {
    id: leading
    anchors.left: parent.left
    anchors.leftMargin: Style.space(18)
    anchors.verticalCenter: parent.verticalCenter
    visible: bar.leadingGlyph.length > 0
    text: bar.leadingGlyph
    color: bar.foreground
    opacity: 0.6
    font.family: bar.fontFamily
    font.pixelSize: Style.font.heading
    textFormat: Text.PlainText
  }

  TextField {
    id: field
    anchors.left: leading.visible ? leading.right : parent.left
    anchors.leftMargin: leading.visible ? Style.space(10) : Style.space(18)
    anchors.right: parent.right
    anchors.rightMargin: Style.space(18)
    anchors.verticalCenter: parent.verticalCenter
    placeholderText: bar.placeholder
    placeholderTextColor: Util.alpha(bar.foreground, 0.4)
    color: bar.foreground
    font.family: bar.fontFamily
    font.pixelSize: Style.font.heading
    selectionColor: Style.selectionFillFor(bar.foreground, Color.accent)
    selectedTextColor: bar.foreground
    background: Item {}
    leftPadding: 0
    rightPadding: 0
    topPadding: 0
    bottomPadding: 0
    selectByMouse: true
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: function(event) {
      if (bar.keyHandler && bar.keyHandler(event)) event.accepted = true
    }
    onTextEdited: bar.textEdited(text)
  }

  // Thin activity line under the field while an owner is loading.
  Rectangle {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    height: Style.space(2)
    color: "transparent"
    visible: bar.loading
    Rectangle {
      id: runner
      width: parent.width * 0.25
      height: parent.height
      color: Color.accent
      opacity: 0.8
      SequentialAnimation on x {
        running: bar.loading
        loops: Animation.Infinite
        NumberAnimation { from: -runner.width; to: runner.parent.width; duration: 900; easing.type: Easing.InOutQuad }
      }
    }
  }
}
