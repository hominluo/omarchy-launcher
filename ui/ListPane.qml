import QtQuick
import qs.Commons
import qs.Ui
import "../lib/ViewModel.js" as VM

// Renders a normalized list view: sectioned rows, a keyboard/mouse cursor,
// and host-side filtering when the view asks for it.
Item {
  id: pane

  property var view: null
  property string filterText: ""
  property var iconResolver: null
  property color foreground: Color.menu.text
  property color background: Color.menu.background
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property var selectedBorderSpec: Border.none()
  property string fontFamily: Style.font.menuFamily
  property real rowHeight: Style.space(40)
  property real headerHeight: Style.space(26)
  property real horizontalInset: Style.space(8)

  property int selectedIndex: 0
  property bool cursorActive: true
  readonly property int count: rowModel.count
  readonly property bool empty: rowModel.count === 0

  signal activateRequested(string itemId)
  signal selectionChanged(string itemId)

  ListModel { id: rowModel }

  PointerMoveGate {
    id: pointerGate
    referenceItem: pane
  }

  onViewChanged: sync()
  onFilterTextChanged: { pane.selectedIndex = 0; sync() }

  function selectedItemId() {
    if (rowModel.count === 0 || selectedIndex < 0 || selectedIndex >= rowModel.count) return ""
    return rowModel.get(selectedIndex).itemId
  }

  function selectedItem() {
    return VM.findItem(pane.view, selectedItemId())
  }

  function itemAt(index) {
    if (index < 0 || index >= rowModel.count) return null
    return VM.findItem(pane.view, rowModel.get(index).itemId)
  }

  // Rebuild rows from the view. When the item sequence is unchanged, rows
  // are updated in place so delegates (and their images) survive.
  function sync() {
    var keep = selectedItemId()
    var rows = VM.flattenList(pane.view, pane.view && pane.view.filtering ? pane.filterText : "")
    var same = rows.length === rowModel.count
    if (same) {
      for (var i = 0; i < rows.length; i++) {
        if (rowModel.get(i).itemId !== rows[i].itemId) { same = false; break }
      }
    }
    if (same) {
      for (var j = 0; j < rows.length; j++) rowModel.set(j, rows[j])
    } else {
      rowModel.clear()
      for (var k = 0; k < rows.length; k++) rowModel.append(rows[k])
      pointerGate.reset()
    }
    var found = -1
    if (keep) {
      for (var m = 0; m < rowModel.count; m++) if (rowModel.get(m).itemId === keep) { found = m; break }
    }
    if (found >= 0) pane.selectedIndex = found
    else if (pane.selectedIndex >= rowModel.count) pane.selectedIndex = Math.max(0, rowModel.count - 1)
    Qt.callLater(pane.revealCursor)
  }

  function move(delta) {
    if (rowModel.count === 0) return
    pointerGate.reset()
    pane.cursorActive = true
    pane.selectedIndex = (pane.selectedIndex + delta + rowModel.count) % rowModel.count
    revealCursor()
    pane.selectionChanged(selectedItemId())
  }

  function page(direction) {
    if (rowModel.count === 0) return
    var step = Math.max(1, Math.floor(list.height / (pane.rowHeight + list.spacing)) - 1)
    pointerGate.reset()
    pane.cursorActive = true
    pane.selectedIndex = Math.max(0, Math.min(rowModel.count - 1, pane.selectedIndex + direction * step))
    revealCursor()
    pane.selectionChanged(selectedItemId())
  }

  function jump(index) {
    if (rowModel.count === 0) return
    pane.selectedIndex = Math.max(0, Math.min(rowModel.count - 1, index))
    revealCursor()
    pane.selectionChanged(selectedItemId())
  }

  function revealCursor() {
    if (rowModel.count === 0) return
    list.positionViewAtIndex(pane.selectedIndex, ListView.Contain)
    // Keep the section header visible when the cursor sits on a section's
    // first row so the header never hides above the fold.
    var item = list.itemAtIndex(pane.selectedIndex)
    if (!item) return
    var headerReach = pane.headerHeight + list.spacing
    if (item.y - headerReach < list.contentY && pane.selectedIndex > 0) {
      var prev = rowModel.get(pane.selectedIndex - 1)
      if (prev.sectionTitle !== rowModel.get(pane.selectedIndex).sectionTitle)
        list.contentY = Math.max(list.originY, item.y - headerReach)
    }
  }

  function selectFromPointer(index, item, mouse) {
    if (!pointerGate.moved(item, mouse)) return
    pane.cursorActive = true
    if (pane.selectedIndex !== index) {
      pane.selectedIndex = index
      pane.selectionChanged(selectedItemId())
    }
  }

  ListView {
    id: list
    anchors.fill: parent
    anchors.leftMargin: pane.horizontalInset
    anchors.rightMargin: pane.horizontalInset
    model: rowModel
    clip: true
    spacing: Style.space(2)
    boundsBehavior: Flickable.StopAtBounds
    highlightFollowsCurrentItem: false
    cacheBuffer: pane.rowHeight * 10

    section.property: "sectionTitle"
    section.criteria: ViewSection.FullString
    section.labelPositioning: ViewSection.InlineLabels
    section.delegate: Item {
      required property string section
      width: ListView.view.width
      height: section.length > 0 ? pane.headerHeight : 0
      visible: section.length > 0
      Text {
        anchors.left: parent.left
        anchors.leftMargin: Style.space(12)
        anchors.bottom: parent.bottom
        anchors.bottomMargin: Style.space(5)
        text: section
        color: pane.foreground
        opacity: 0.5
        font.family: pane.fontFamily
        font.pixelSize: Style.font.caption
        font.weight: Font.DemiBold
        textFormat: Text.PlainText
      }
    }

    delegate: ListRow {
      width: ListView.view.width
      height: pane.rowHeight
      hasCursor: pane.cursorActive && index === pane.selectedIndex
      iconResolver: pane.iconResolver
      foreground: pane.foreground
      selectedBackground: pane.selectedBackground
      selectedText: pane.selectedText
      selectedBorderSpec: pane.selectedBorderSpec
      fontFamily: pane.fontFamily
      horizontalInset: Style.space(6)
      onHovered: function(mouse) { pane.selectFromPointer(index, this, mouse) }
      onClicked: {
        pane.cursorActive = true
        pane.selectedIndex = index
        pane.activateRequested(itemId)
      }
    }
  }

  // Edge scrims so scrolled content fades out instead of being cut off.
  Rectangle {
    anchors { left: parent.left; right: parent.right; top: parent.top }
    height: Style.space(18)
    visible: opacity > 0
    opacity: list.contentHeight > list.height ? Math.max(0, Math.min(1, (list.contentY - list.originY) / height)) : 0
    gradient: Gradient {
      GradientStop { position: 0; color: pane.background }
      GradientStop { position: 1; color: Util.alpha(pane.background, 0) }
    }
  }
  Rectangle {
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    height: Style.space(18)
    visible: opacity > 0
    opacity: list.contentHeight > list.height ? Math.max(0, Math.min(1, (list.originY + list.contentHeight - list.height - list.contentY) / height)) : 0
    gradient: Gradient {
      GradientStop { position: 0; color: Util.alpha(pane.background, 0) }
      GradientStop { position: 1; color: pane.background }
    }
  }

  EmptyView {
    anchors.fill: parent
    visible: pane.empty
    foreground: pane.foreground
    fontFamily: pane.fontFamily
    icon: pane.view && pane.view.emptyView && pane.view.emptyView.icon ? String(pane.view.emptyView.icon) : "󰍉"
    title: pane.view && pane.view.emptyView && pane.view.emptyView.title ? String(pane.view.emptyView.title) : (pane.filterText ? "No results for “" + pane.filterText + "”" : "Nothing here yet")
    description: pane.view && pane.view.emptyView && pane.view.emptyView.description ? String(pane.view.emptyView.description) : ""
  }
}
