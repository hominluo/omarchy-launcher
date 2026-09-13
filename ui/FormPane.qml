import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Renders a normalized form view: labelled fields down the page, keyboard
// navigation between them, values owned here and handed back on submit.
// Field kinds: text password textarea checkbox dropdown date file tags
// separator description.
Item {
  id: pane

  property var view: null
  property var values: ({})
  property int focusedIndex: -1
  property color foreground: Color.menu.text
  property color background: Color.menu.background
  property string fontFamily: Style.font.menuFamily
  readonly property real labelWidth: Math.round(width * 0.28)
  readonly property bool empty: false
  readonly property int count: fields.length

  property var keyHandler: null
  signal submitRequested()
  signal fieldChanged(string fieldId, var value)

  readonly property var fields: view && view.fields ? view.fields : []
  function fieldList() { return pane.view && pane.view.fields ? pane.view.fields : [] }

  onViewChanged: reset()

  function reset() {
    var v = {}
    var fields = fieldList()
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i]
      if (!f || !f.id) continue
      var cur = pane.values[f.id]
      if (f.value !== undefined && f.value !== null) v[f.id] = f.value     // controlled: view wins
      else if (cur !== undefined) v[f.id] = cur
      else if (f.defaultValue !== undefined) v[f.id] = f.defaultValue
      else v[f.id] = f.field === "checkbox" ? false : (f.field === "tags" || f.field === "file" ? [] : "")
    }
    pane.values = v
    if (pane.focusedIndex < 0) Qt.callLater(function() { pane.focusField(firstEditable(), true) })
  }

  function firstEditable() {
    var fields = fieldList()
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].autoFocus) return i
    }
    for (var j = 0; j < fields.length; j++) if (isEditable(fields[j])) return j
    return -1
  }

  function isEditable(f) { return f && f.field !== "separator" && f.field !== "description" }

  function setValue(fieldId, value) {
    var next = {}
    for (var k in pane.values) next[k] = pane.values[k]
    next[fieldId] = value
    pane.values = next
    pane.fieldChanged(fieldId, value)
  }

  function collect() {
    var out = {}
    var fields = fieldList()
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i]
      if (!f || !f.id || !isEditable(f)) continue
      out[f.id] = pane.values[f.id]
    }
    return out
  }

  function hasErrors() {
    var fields = fieldList()
    for (var i = 0; i < fields.length; i++) if (fields[i].error) return true
    return false
  }

  function focusField(index, fromKeyboard) {
    if (index < 0 || index >= fieldList().length) return
    pane.focusedIndex = index
    var item = column.editorAt(index)
    if (item && typeof item.focusEditor === "function") item.focusEditor()
    var y = item ? item.y : 0
    if (item) {
      if (y < flick.contentY) flick.contentY = Math.max(0, y - Style.space(8))
      else if (y + item.height > flick.contentY + flick.height) flick.contentY = Math.min(flick.contentHeight - flick.height, y + item.height - flick.height + Style.space(8))
    }
  }

  function moveFocus(delta) {
    var fields = fieldList()
    var i = pane.focusedIndex
    for (var n = 0; n < fields.length; n++) {
      i = (i + delta + fields.length) % fields.length
      if (isEditable(fields[i])) { focusField(i, true); return }
    }
  }

  // Keys from a field editor arrive here first. Returns true when consumed.
  function handleFieldKey(event, index) {
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var shift = (event.modifiers & Qt.ShiftModifier) !== 0
    var key = event.key
    if (pane.keyHandler && (key === Qt.Key_Escape || (ctrl && key === Qt.Key_K) || (ctrl && (key === Qt.Key_Return || key === Qt.Key_Enter)))) return pane.keyHandler(event) === true
    var f = fields[index] || {}
    var multiline = f.field === "textarea"
    if (key === Qt.Key_Tab) { moveFocus(shift ? -1 : 1); return true }
    if (key === Qt.Key_Backtab) { moveFocus(-1); return true }
    if (!multiline && key === Qt.Key_Down) { moveFocus(1); return true }
    if (!multiline && key === Qt.Key_Up) { moveFocus(-1); return true }
    if ((key === Qt.Key_Return || key === Qt.Key_Enter) && (ctrl || !multiline)) {
      if (f.field === "dropdown" || f.field === "checkbox" || f.field === "tags" || f.field === "file") return false
      pane.submitRequested(); return true
    }
    return false
  }

  Flickable {
    id: flick
    anchors.fill: parent
    contentWidth: width
    contentHeight: column.height + Style.space(16)
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: column
      x: 0
      y: Style.space(8)
      width: flick.width
      spacing: Style.space(10)

      function editorAt(index) {
        var item = repeater.itemAt(index)
        return item ? item.editor : null
      }

      Repeater {
        id: repeater
        model: pane.fields.length
        delegate: Item {
          id: row
          required property int index
          readonly property var field: pane.fields[index] || {}
          readonly property var editor: loader.item
          readonly property bool focusedRow: pane.focusedIndex === index
          width: column.width
          height: field.field === "separator" ? Style.space(8) : loader.height + (errorText.visible ? errorText.height + Style.space(2) : 0) + (infoText.visible ? infoText.height + Style.space(2) : 0)

          Rectangle {
            visible: row.field.field === "separator"
            anchors.verticalCenter: parent.verticalCenter
            x: Style.space(12)
            width: parent.width - Style.space(24)
            height: Style.spacing.hairline
            color: Util.alpha(pane.foreground, 0.12)
          }

          Text {
            id: label
            visible: row.field.field !== "separator" && row.field.field !== "description"
            x: Style.space(12)
            y: Style.space(6)
            width: pane.labelWidth - Style.space(24)
            horizontalAlignment: Text.AlignRight
            text: String(row.field.title || "")
            color: pane.foreground
            opacity: row.focusedRow ? 0.95 : 0.6
            elide: Text.ElideRight
            font.family: pane.fontFamily
            font.pixelSize: Style.font.body
            textFormat: Text.PlainText
          }

          Loader {
            id: loader
            x: row.field.field === "description" ? Style.space(12) : pane.labelWidth
            width: parent.width - x - Style.space(16)
            sourceComponent: {
              var k = String(row.field.field || "text")
              if (k === "textarea") return textAreaField
              if (k === "checkbox") return checkboxField
              if (k === "dropdown") return dropdownField
              if (k === "tags") return tagsField
              if (k === "file") return fileField
              if (k === "description") return descriptionField
              if (k === "separator") return null
              return textField
            }
            onLoaded: { if (item) { item.field = row.field; item.fieldIndex = row.index } }
          }

          Text {
            id: errorText
            visible: !!row.field.error
            anchors.top: loader.bottom
            anchors.topMargin: Style.space(2)
            x: pane.labelWidth
            width: loader.width
            text: String(row.field.error || "")
            color: Color.urgent
            font.family: pane.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.Wrap
            textFormat: Text.PlainText
          }
          Text {
            id: infoText
            visible: !!row.field.info && !errorText.visible
            anchors.top: loader.bottom
            anchors.topMargin: Style.space(2)
            x: pane.labelWidth
            width: loader.width
            text: String(row.field.info || "")
            color: pane.foreground
            opacity: 0.5
            font.family: pane.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.Wrap
            textFormat: Text.PlainText
          }
        }
      }
    }
  }

  // ------------------------------------------------------------- editors

  Component {
    id: textField
    TextField {
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() { forceActiveFocus() }
      width: parent ? parent.width : 200
      foreground: pane.foreground
      password: field.field === "password"
      placeholderText: String(field.placeholder || "")
      font.family: pane.fontFamily
      text: pane.values[field.id] !== undefined ? String(pane.values[field.id]) : ""
      onTextEdited: pane.setValue(field.id, text)
      onActiveFocusChanged: if (activeFocus) pane.focusedIndex = fieldIndex
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) { if (pane.handleFieldKey(event, fieldIndex)) event.accepted = true }
    }
  }

  Component {
    id: textAreaField
    BorderSurface {
      id: areaFrame
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() { area.forceActiveFocus() }
      width: parent ? parent.width : 200
      height: Math.max(Style.space(96), Math.min(Style.space(220), area.contentHeight + Style.space(20)))
      radius: Style.cornerRadius
      color: Style.controlFill(area.activeFocus, false, pane.foreground, Color.accent)
      borderSpec: Border.controlSpec(area.activeFocus ? "focus" : "normal", pane.foreground, Color.accent)
      QQC.TextArea {
        id: area
        anchors.fill: parent
        anchors.margins: Style.space(8)
        wrapMode: TextEdit.Wrap
        color: pane.foreground
        placeholderText: String(areaFrame.field.placeholder || "")
        placeholderTextColor: Util.alpha(pane.foreground, 0.4)
        font.family: pane.fontFamily
        font.pixelSize: Style.font.body
        selectionColor: Style.selectionFillFor(pane.foreground, Color.accent)
        selectedTextColor: pane.foreground
        background: Item {}
        text: pane.values[areaFrame.field.id] !== undefined ? String(pane.values[areaFrame.field.id]) : ""
        onTextChanged: if (activeFocus) pane.setValue(areaFrame.field.id, text)
        onActiveFocusChanged: if (activeFocus) pane.focusedIndex = areaFrame.fieldIndex
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) { if (pane.handleFieldKey(event, areaFrame.fieldIndex)) event.accepted = true }
      }
    }
  }

  Component {
    id: checkboxField
    Item {
      id: check
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() { forceActiveFocus() }
      readonly property bool checked: pane.values[field.id] === true
      width: parent ? parent.width : 200
      height: Style.spacing.controlHeight
      activeFocusOnTab: false
      onActiveFocusChanged: if (activeFocus) pane.focusedIndex = fieldIndex
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Space || event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { pane.setValue(check.field.id, !check.checked); event.accepted = true; return }
        if (pane.handleFieldKey(event, fieldIndex)) event.accepted = true
      }
      Row {
        spacing: Style.space(8)
        anchors.verticalCenter: parent.verticalCenter
        BorderSurface {
          width: Style.space(18); height: Style.space(18)
          radius: Math.min(Style.cornerRadius, Style.space(4))
          color: check.checked ? Color.accent : Style.controlFill(check.activeFocus, false, pane.foreground, Color.accent)
          borderSpec: Border.controlSpec(check.activeFocus ? "focus" : "normal", pane.foreground, Color.accent)
          anchors.verticalCenter: parent.verticalCenter
          Text { anchors.centerIn: parent; visible: check.checked; text: "󰄬"; color: pane.background; font.family: pane.fontFamily; font.pixelSize: Style.font.bodySmall }
        }
        Text {
          text: String(check.field.label || "")
          color: pane.foreground
          font.family: pane.fontFamily
          font.pixelSize: Style.font.body
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
        }
      }
      MouseArea { anchors.fill: parent; onClicked: { check.forceActiveFocus(); pane.setValue(check.field.id, !check.checked) } }
    }
  }

  Component {
    id: dropdownField
    Dropdown {
      id: dd
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() { forceActiveFocus() }
      width: parent ? parent.width : 200
      showLabel: false
      foreground: pane.foreground
      background: pane.background
      fontFamily: pane.fontFamily
      options: {
        var out = []
        var items = field.items || []
        for (var i = 0; i < items.length; i++) {
          var it = items[i]
          if (it && it.items) { for (var j = 0; j < it.items.length; j++) out.push({ value: String(it.items[j].value), label: String(it.items[j].title || it.items[j].value) }) }
          else if (it) out.push({ value: String(it.value), label: String(it.title || it.value) })
        }
        return out
      }
      value: pane.values[field.id] !== undefined ? String(pane.values[field.id]) : ""
      onChanged: function(v) { pane.setValue(dd.field.id, v) }
      onActiveFocusChanged: if (activeFocus) pane.focusedIndex = fieldIndex
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) { if (!dd.popupOpen && pane.handleFieldKey(event, dd.fieldIndex)) event.accepted = true }
    }
  }

  Component {
    id: tagsField
    MultiSelect {
      id: ms
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() { forceActiveFocus() }
      width: parent ? parent.width : 200
      showLabel: false
      foreground: pane.foreground
      background: pane.background
      fontFamily: pane.fontFamily
      options: {
        var out = []
        var items = field.items || []
        for (var i = 0; i < items.length; i++) if (items[i]) out.push({ value: String(items[i].value), label: String(items[i].title || items[i].value) })
        return out
      }
      values: Array.isArray(pane.values[field.id]) ? pane.values[field.id] : []
      onChanged: function(v) { pane.setValue(ms.field.id, v) }
      onActiveFocusChanged: if (activeFocus) pane.focusedIndex = fieldIndex
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) { if (!ms.popupOpen && pane.handleFieldKey(event, ms.fieldIndex)) event.accepted = true }
    }
  }

  Component {
    id: fileField
    Item {
      id: ff
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() { pathField.forceActiveFocus() }
      width: parent ? parent.width : 200
      height: pathField.height
      readonly property var current: Array.isArray(pane.values[field.id]) ? pane.values[field.id] : (pane.values[field.id] ? [String(pane.values[field.id])] : [])
      TextField {
        id: pathField
        anchors.left: parent.left
        anchors.right: browse.left
        anchors.rightMargin: Style.space(6)
        foreground: pane.foreground
        placeholderText: ff.field.directories && !ff.field.files ? "Choose a folder…" : "Choose a file…"
        font.family: pane.fontFamily
        text: ff.current.join(", ")
        onTextEdited: pane.setValue(ff.field.id, text ? text.split(/\s*,\s*/) : [])
        onActiveFocusChanged: if (activeFocus) pane.focusedIndex = ff.fieldIndex
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) { if (pane.handleFieldKey(event, ff.fieldIndex)) event.accepted = true }
      }
      Button {
        id: browse
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: "Browse…"
        bordered: true
        foreground: pane.foreground
        fontFamily: pane.fontFamily
        onClicked: {
          var argv = ["omarchy-file-select", "--title", String(ff.field.title || "Choose")]
          if (ff.field.allowMultiple) argv.push("--multiple")
          if (ff.field.directories && !ff.field.files) argv.push("--directory")
          picker.command = argv
          picker.running = true
        }
      }
      Process {
        id: picker
        stdout: StdioCollector {
          onStreamFinished: {
            var lines = String(text || "").split("\n").filter(function(l) { return l.length })
            if (lines.length) pane.setValue(ff.field.id, lines)
          }
        }
      }
    }
  }

  Component {
    id: descriptionField
    Text {
      property var field: ({})
      property int fieldIndex: -1
      function focusEditor() {}
      width: parent ? parent.width : 200
      text: String(field.text || field.title || "")
      color: pane.foreground
      opacity: 0.65
      wrapMode: Text.Wrap
      font.family: pane.fontFamily
      font.pixelSize: Style.font.bodySmall
      textFormat: Text.PlainText
    }
  }
}
