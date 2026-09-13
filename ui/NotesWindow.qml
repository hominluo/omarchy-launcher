import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui

// Floating Notes: a small always-on-top markdown notepad that survives the
// launcher closing. Autosaves to ~/.local/state/omarchy-launcher/notes/.
PanelWindow {
  id: win

  property var service: null
  property bool shown: false
  property string noteId: ""
  property string noteTitle: "Note"
  property bool preview: false
  property bool dirty: false
  readonly property string notesDir: service ? service.stateDir + "/notes" : ""

  visible: shown
  color: "transparent"
  WlrLayershell.namespace: "hominluo-notes"
  WlrLayershell.layer: WlrLayer.Top
  WlrLayershell.keyboardFocus: shown ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None
  exclusionMode: ExclusionMode.Ignore
  anchors { top: true; right: true }
  margins { top: Style.space(60); right: Style.space(40) }
  implicitWidth: Style.space(400)
  implicitHeight: Style.space(320)

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily

  function show(id, title) {
    if (id && id !== win.noteId) { flush(); win.noteId = id; win.noteTitle = title || "Note"; file.reload() }
    win.shown = true
    Qt.callLater(function() { editor.forceActiveFocus() })
  }
  function hide() { flush(); win.shown = false }
  function toggle(id, title) { if (win.shown && (!id || id === win.noteId)) hide(); else show(id, title) }

  function flush() {
    if (!win.dirty || !win.noteId) return
    win.dirty = false
    file.setText(editor.text)
    if (service && typeof service.noteSaved === "function") service.noteSaved(win.noteId, editor.text)
  }

  Timer { id: saveTimer; interval: 700; onTriggered: win.flush() }

  FileView {
    id: file
    path: win.noteId ? win.notesDir + "/" + win.noteId + ".md" : ""
    printErrors: false
    atomicWrites: true
    onLoaded: { editor.text = text(); win.dirty = false }
    onLoadFailed: { editor.text = ""; win.dirty = false }
  }

  BorderSurface {
    id: card
    anchors.fill: parent
    radius: Style.cornerRadius
    color: win.background
    borderSpec: Border.surfaceSpec("menu", "border", Color.menu.border, Math.max(1, Style.space(2)))

    Item {
      id: header
      anchors.top: parent.top
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.margins: card.contentTopInset
      height: Style.space(30)

      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.SizeAllCursor
        property real startX: 0
        property real startY: 0
        onPressed: function(m) { startX = m.x; startY = m.y }
        onPositionChanged: function(m) {
          if (!pressed) return
          win.margins.right = Math.max(0, win.margins.right - (m.x - startX))
          win.margins.top = Math.max(0, win.margins.top + (m.y - startY))
        }
      }

      Text {
        anchors.left: parent.left
        anchors.leftMargin: Style.space(10)
        anchors.verticalCenter: parent.verticalCenter
        text: "󰎞  " + win.noteTitle + (win.dirty ? " •" : "")
        color: win.foreground
        opacity: 0.7
        font.family: win.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
        width: parent.width - Style.space(120)
        textFormat: Text.PlainText
      }

      Row {
        anchors.right: parent.right
        anchors.rightMargin: Style.space(6)
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(2)
        Button { text: win.preview ? "󰷈" : "󰈈"; tooltipText: win.preview ? "Edit" : "Preview"; foreground: win.foreground; fontFamily: win.fontFamily; onClicked: { win.flush(); win.preview = !win.preview } }
        Button { text: "󰅖"; tooltipText: "Close"; foreground: win.foreground; fontFamily: win.fontFamily; onClicked: win.hide() }
      }
    }

    Rectangle {
      anchors.top: header.bottom
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.leftMargin: card.contentLeftInset
      anchors.rightMargin: card.contentRightInset
      height: Style.spacing.hairline
      color: Util.alpha(win.foreground, 0.12)
    }

    Flickable {
      id: flick
      anchors.top: header.bottom
      anchors.topMargin: Style.space(6)
      anchors.bottom: parent.bottom
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.margins: Style.space(10)
      contentWidth: width
      contentHeight: win.preview ? rendered.height : editor.contentHeight + Style.space(20)
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      QQC.TextArea {
        id: editor
        visible: !win.preview
        width: flick.width
        wrapMode: TextEdit.Wrap
        color: win.foreground
        placeholderText: "Write in Markdown…"
        placeholderTextColor: Util.alpha(win.foreground, 0.4)
        font.family: win.fontFamily
        font.pixelSize: Style.font.body
        selectionColor: Style.selectionFillFor(win.foreground, Color.accent)
        selectedTextColor: win.foreground
        background: Item {}
        onTextChanged: if (activeFocus) { win.dirty = true; saveTimer.restart() }
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) { win.hide(); event.accepted = true }
          else if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_S) { win.flush(); event.accepted = true }
          else if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_P) { win.flush(); win.preview = !win.preview; event.accepted = true }
        }
      }

      Text {
        id: rendered
        visible: win.preview
        width: flick.width
        text: editor.text
        textFormat: Text.MarkdownText
        wrapMode: Text.Wrap
        color: win.foreground
        font.family: win.fontFamily
        font.pixelSize: Style.font.body
        linkColor: Color.accent
        onLinkActivated: function(link) { Qt.openUrlExternally(link) }
      }
    }
  }
}
