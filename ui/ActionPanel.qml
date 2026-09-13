import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "../lib/Score.js" as Score

// The Ctrl+K popover: every action for the selected item, sectioned, with
// keycaps, and a filter field at the bottom (Raycast puts it there too).
Item {
  id: panel

  property bool opened: false
  property var spec: null                // normalized ActionPanel { title, sections }
  property string filterText: ""
  property int selectedIndex: 0
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property color scrim: "transparent"
  property var borderSpec: Border.none()
  property string fontFamily: Style.font.menuFamily
  property int cornerRadius: Style.cornerRadius
  property real rowHeight: Style.space(34)

  signal triggered(var action)
  signal closed()

  readonly property int count: rowModel.count

  ListModel { id: rowModel }

  PointerMoveGate {
    id: pointerGate
    referenceItem: panel
  }

  function open(actionSpec) {
    pointerGate.reset()
    panel.spec = actionSpec
    panel.filterText = ""
    filterField.text = ""
    panel.selectedIndex = 0
    rebuild()
    panel.opened = true
    Qt.callLater(function() { filterField.forceActiveFocus() })
  }

  function close() {
    if (!panel.opened) return
    panel.opened = false
    panel.closed()
  }

  function rows() {
    var out = []
    if (!panel.spec) return out
    var q = panel.filterText.trim().toLowerCase()
    var n = 0
    for (var i = 0; i < panel.spec.sections.length; i++) {
      var sec = panel.spec.sections[i]
      for (var j = 0; j < sec.actions.length; j++) {
        var a = sec.actions[j]
        if (q && String(a.title).toLowerCase().indexOf(q) < 0) continue
        out.push({ index: n, sectionTitle: sec.title || "", title: a.title, shortcut: shortcutLabel(a, n), style: a.style || "regular", actionIndex: j, sectionIndex: i })
        n += 1
      }
    }
    return out
  }

  function shortcutLabel(action, position) {
    if (action.shortcut && action.shortcut.label) return String(action.shortcut.label)
    if (action.shortcut && action.shortcut.key) {
      var mods = action.shortcut.modifiers || []
      var parts = []
      for (var i = 0; i < mods.length; i++) {
        var m = String(mods[i]).toLowerCase()
        parts.push(m === "cmd" || m === "ctrl" ? "⌃" : m === "shift" ? "⇧" : m === "opt" || m === "alt" ? "⌥" : m === "super" || m === "windows" ? "❖" : m)
      }
      var key = String(action.shortcut.key)
      var keyNames = { "return": "↵", enter: "↵", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", backspace: "⌫", "delete": "⌦", escape: "⎋", tab: "⇥", space: "␣" }
      parts.push(keyNames[key.toLowerCase()] || key.toUpperCase())
      return parts.join("")
    }
    if (position === 0) return "↵"
    if (position === 1) return "⌃↵"
    return ""
  }

  function rebuild() {
    var list = rows()
    rowModel.clear()
    for (var i = 0; i < list.length; i++) rowModel.append(list[i])
    if (panel.selectedIndex >= rowModel.count) panel.selectedIndex = Math.max(0, rowModel.count - 1)
    list_.positionViewAtIndex(panel.selectedIndex, ListView.Contain)
  }

  function actionAt(index) {
    if (index < 0 || index >= rowModel.count || !panel.spec) return null
    var row = rowModel.get(index)
    return panel.spec.sections[row.sectionIndex].actions[row.actionIndex]
  }

  function move(delta) {
    if (rowModel.count === 0) return
    panel.selectedIndex = (panel.selectedIndex + delta + rowModel.count) % rowModel.count
    list_.positionViewAtIndex(panel.selectedIndex, ListView.Contain)
  }

  function trigger(index) {
    var a = actionAt(index === undefined ? panel.selectedIndex : index)
    if (!a) return
    panel.close()
    panel.triggered(a)
  }

  // Keys arrive from the filter field first.
  function handleKey(event) {
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var key = event.key
    if (key === Qt.Key_Escape || (ctrl && key === Qt.Key_K)) { panel.close(); return true }
    if (key === Qt.Key_Down || (ctrl && key === Qt.Key_N)) { panel.move(1); return true }
    if (key === Qt.Key_Up || (ctrl && key === Qt.Key_P)) { panel.move(-1); return true }
    if (key === Qt.Key_Return || key === Qt.Key_Enter) { panel.trigger(); return true }
    if (ctrl && key >= Qt.Key_1 && key <= Qt.Key_9) { panel.trigger(key - Qt.Key_1); return true }
    if (ctrl && key === Qt.Key_U) { filterField.text = ""; return true }
    return false
  }

  visible: opened
  anchors.fill: parent

  MouseArea {
    anchors.fill: parent
    onClicked: panel.close()
  }

  BorderSurface {
    id: card
    width: Math.min(Style.space(360), parent.width - Style.space(24))
    height: Math.min(parent.height - Style.space(24), header.height + Math.max(panel.rowHeight, list_.contentHeight) + filterRow.height + Style.space(20))
    anchors.right: parent.right
    anchors.rightMargin: Style.space(12)
    anchors.bottom: parent.bottom
    anchors.bottomMargin: Style.space(48)
    radius: panel.cornerRadius
    color: panel.background
    borderSpec: panel.borderSpec

    MouseArea { anchors.fill: parent; onClicked: {} }

    Text {
      id: header
      anchors.top: parent.top
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.margins: Style.space(12)
      height: text.length ? Style.space(18) : 0
      verticalAlignment: Text.AlignVCenter
      text: panel.spec && panel.spec.title ? panel.spec.title : ""
      color: panel.foreground
      opacity: 0.6
      elide: Text.ElideRight
      font.family: panel.fontFamily
      font.pixelSize: Style.font.caption
      font.weight: Font.DemiBold
      textFormat: Text.PlainText
    }

    ListView {
      id: list_
      anchors.top: header.bottom
      anchors.topMargin: Style.space(4)
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: filterRow.top
      anchors.leftMargin: Style.space(6)
      anchors.rightMargin: Style.space(6)
      model: rowModel
      clip: true
      spacing: Style.space(1)
      boundsBehavior: Flickable.StopAtBounds

      section.property: "sectionTitle"
      section.criteria: ViewSection.FullString
      section.delegate: Item {
        required property string section
        width: ListView.view.width
        height: section.length ? Style.space(22) : 0
        Text {
          anchors.left: parent.left
          anchors.leftMargin: Style.space(8)
          anchors.bottom: parent.bottom
          anchors.bottomMargin: Style.space(3)
          text: section
          color: panel.foreground
          opacity: 0.45
          font.family: panel.fontFamily
          font.pixelSize: Style.font.caption
          font.weight: Font.DemiBold
          textFormat: Text.PlainText
        }
      }

      delegate: Rectangle {
        id: row
        required property int index
        required property string title
        required property string shortcut
        required property string style
        readonly property bool hasCursor: index === panel.selectedIndex
        width: ListView.view.width
        height: panel.rowHeight
        radius: Math.min(panel.cornerRadius, Style.space(6))
        color: hasCursor ? panel.selectedBackground : "transparent"

        Text {
          anchors.left: parent.left
          anchors.leftMargin: Style.space(10)
          anchors.right: cap.left
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          text: row.title
          color: row.style === "destructive" ? Color.urgent : (row.hasCursor ? panel.selectedText : panel.foreground)
          elide: Text.ElideRight
          font.family: panel.fontFamily
          font.pixelSize: Style.font.body
          textFormat: Text.PlainText
        }
        KeyCap {
          id: cap
          anchors.right: parent.right
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          visible: row.shortcut.length > 0
          text: row.shortcut
          foreground: panel.foreground
          fontFamily: panel.fontFamily
        }
        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          onPositionChanged: function(mouse) { if (pointerGate.moved(row, mouse)) panel.selectedIndex = row.index }
          onClicked: panel.trigger(row.index)
        }
      }
    }

    Rectangle {
      id: filterRow
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.margins: Style.space(6)
      height: Style.space(34)
      radius: Math.min(panel.cornerRadius, Style.space(6))
      color: Util.alpha(panel.foreground, 0.05)

      TextField {
        id: filterField
        anchors.fill: parent
        anchors.leftMargin: Style.space(10)
        anchors.rightMargin: Style.space(10)
        placeholderText: "Search for actions…"
        placeholderTextColor: Util.alpha(panel.foreground, 0.4)
        color: panel.foreground
        font.family: panel.fontFamily
        font.pixelSize: Style.font.body
        background: Item {}
        leftPadding: 0; rightPadding: 0; topPadding: 0; bottomPadding: 0
        verticalAlignment: TextInput.AlignVCenter
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) { if (panel.handleKey(event)) event.accepted = true }
        onTextEdited: { panel.filterText = text; panel.selectedIndex = 0; panel.rebuild() }
      }
    }
  }
}
