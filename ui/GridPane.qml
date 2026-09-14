import QtQuick
import qs.Commons
import qs.Ui
import "../lib/ViewModel.js" as VM

// Renders a normalized grid view: sections of cells (icon, colour swatch, or
// image) with a title under each, a 2D keyboard cursor, and host-side
// filtering like ListPane.
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
  property real horizontalInset: Style.space(8)

  property int selectedIndex: 0
  property bool cursorActive: true
  readonly property int count: cells.length
  readonly property bool empty: cells.length === 0

  // Flattened cells: { itemId, sectionTitle, title, subtitle, kind, value, row, col }
  property var cells: []
  property var sectionRows: []       // [{ title, start, count }]
  property int columns: view && view.columns ? view.columns : 5

  signal activateRequested(string itemId)
  signal selectionChanged(string itemId)

  onViewChanged: sync()
  onFilterTextChanged: { pane.selectedIndex = 0; sync() }

  function selectedItemId() { return pane.cells[pane.selectedIndex] ? pane.cells[pane.selectedIndex].itemId : "" }
  function selectedItem() { return VM.findItem(pane.view, selectedItemId()) }

  function cellSpec(item) {
    var c = item.content || item.icon || null
    if (c && typeof c === "object" && c.value !== undefined && typeof c.value === "object" && c.value.color) c = c.value
    if (c && typeof c === "object" && c.color) return { kind: "color", value: String(c.color) }
    var src = c
    if (c && typeof c === "object") src = c.image || c.icon || (c.value !== undefined ? c.value : (c.source !== undefined ? c : null))
    var ic = VM.iconSpec(src)
    return ic ? { kind: ic.kind, value: ic.value } : { kind: "", value: "" }
  }

  function sync() {
    var keep = selectedItemId()
    var out = []
    var secs = []
    var q = pane.view && pane.view.filtering ? pane.filterText.trim().toLowerCase() : ""
    if (pane.view && pane.view.sections) {
      for (var i = 0; i < pane.view.sections.length; i++) {
        var sec = pane.view.sections[i]
        var start = out.length
        for (var j = 0; j < sec.items.length; j++) {
          var it = sec.items[j]
          if (q && !matches(it, q)) continue
          var spec = cellSpec(it)
          out.push({ itemId: it.id, sectionTitle: sec.title, title: it.title, subtitle: it.subtitle, kind: spec.kind, value: spec.value })
        }
        if (out.length > start) secs.push({ title: sec.title, start: start, count: out.length - start })
      }
    }
    pane.cells = out
    pane.sectionRows = secs
    var found = -1
    for (var k = 0; k < out.length && keep; k++) if (out[k].itemId === keep) { found = k; break }
    pane.selectedIndex = found >= 0 ? found : Math.max(0, Math.min(pane.selectedIndex, out.length - 1))
    Qt.callLater(pane.revealCursor)
  }

  function matches(item, q) {
    var hay = [item.title, item.subtitle].concat(item.keywords || []).join(" ").toLowerCase()
    var terms = q.split(/\s+/)
    for (var i = 0; i < terms.length; i++) if (terms[i] && hay.indexOf(terms[i]) < 0) return false
    return true
  }

  function sectionOf(index) {
    for (var i = 0; i < pane.sectionRows.length; i++) {
      var s = pane.sectionRows[i]
      if (index >= s.start && index < s.start + s.count) return s
    }
    return null
  }

  function move(delta) {          // vertical: one row of the grid
    if (!pane.cells.length) return
    pane.cursorActive = true
    var s = sectionOf(pane.selectedIndex)
    var local = pane.selectedIndex - s.start
    var target = local + delta * pane.columns
    if (target >= 0 && target < s.count) pane.selectedIndex = s.start + target
    else if (delta > 0) {
      var next = sectionOf(s.start + s.count)
      pane.selectedIndex = next ? next.start + Math.min(local % pane.columns, next.count - 1) : Math.min(pane.cells.length - 1, s.start + s.count - 1)
      if (!next && local + delta * pane.columns >= s.count && pane.selectedIndex === s.start + s.count - 1 && local === s.count - 1) pane.selectedIndex = 0
    } else {
      var prev = sectionOf(s.start - 1)
      if (prev) {
        var lastRowStart = prev.start + Math.floor((prev.count - 1) / pane.columns) * pane.columns
        pane.selectedIndex = Math.min(prev.start + prev.count - 1, lastRowStart + (local % pane.columns))
      } else pane.selectedIndex = pane.cells.length - 1
    }
    revealCursor()
    pane.selectionChanged(selectedItemId())
  }

  function moveHorizontal(delta) {
    if (!pane.cells.length) return
    pane.cursorActive = true
    pane.selectedIndex = (pane.selectedIndex + delta + pane.cells.length) % pane.cells.length
    revealCursor()
    pane.selectionChanged(selectedItemId())
  }

  function page(direction) { move(direction * 3) }
  function jump(index) { pane.selectedIndex = Math.max(0, Math.min(pane.cells.length - 1, index)); revealCursor() }

  function revealCursor() {
    var y = cellY(pane.selectedIndex)
    if (y < 0) return
    var h = pane.cellHeight
    if (y - pane.headerHeight < flick.contentY) flick.contentY = Math.max(0, y - pane.headerHeight)
    else if (y + h > flick.contentY + flick.height) flick.contentY = Math.min(Math.max(0, flick.contentHeight - flick.height), y + h - flick.height)
  }

  readonly property real cellWidth: Math.floor((flick.width - pane.horizontalInset * 2) / Math.max(1, pane.columns))
  readonly property real aspect: {
    var a = pane.view && pane.view.aspectRatio ? String(pane.view.aspectRatio) : "1"
    var m = a.match(/^(\d+)\/(\d+)$/)
    return m ? Number(m[1]) / Number(m[2]) : 1
  }
  readonly property real insetPx: {
    var i = pane.view ? String(pane.view.inset || "small") : "small"
    return i === "large" ? Style.space(16) : i === "medium" ? Style.space(10) : i === "none" ? 0 : Style.space(6)
  }
  readonly property real titleHeight: Style.space(18)
  readonly property real cellHeight: Math.round(cellWidth / aspect) + titleHeight + Style.space(6)
  readonly property real headerHeight: Style.space(26)

  function cellY(index) {
    var s = sectionOf(index)
    if (!s) return -1
    var y = 0
    for (var i = 0; i < pane.sectionRows.length; i++) {
      var sec = pane.sectionRows[i]
      var hh = sec.title ? pane.headerHeight : Style.space(4)
      if (sec === s) return y + hh + Math.floor((index - s.start) / pane.columns) * pane.cellHeight
      y += hh + Math.ceil(sec.count / pane.columns) * pane.cellHeight
    }
    return -1
  }

  function totalHeight() {
    var y = 0
    for (var i = 0; i < pane.sectionRows.length; i++) {
      var sec = pane.sectionRows[i]
      y += (sec.title ? pane.headerHeight : Style.space(4)) + Math.ceil(sec.count / pane.columns) * pane.cellHeight
    }
    return y
  }

  Flickable {
    id: flick
    anchors.fill: parent
    contentWidth: width
    contentHeight: pane.totalHeight()
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Repeater {
      model: pane.sectionRows.length
      delegate: Item {
        required property int index
        readonly property var sec: pane.sectionRows[index]
        x: 0
        y: pane.cellY(sec.start) - (sec.title ? pane.headerHeight : Style.space(4))
        width: flick.width
        height: (sec.title ? pane.headerHeight : Style.space(4)) + Math.ceil(sec.count / pane.columns) * pane.cellHeight

        Text {
          x: pane.horizontalInset + Style.space(6)
          y: Style.space(6)
          visible: sec.title.length > 0
          text: sec.title
          color: pane.foreground
          opacity: 0.5
          font.family: pane.fontFamily
          font.pixelSize: Style.font.caption
          font.weight: Font.DemiBold
          textFormat: Text.PlainText
        }

        // Only the rows near the viewport get delegates (an emoji picker has
        // ~1900 cells; instantiating them all took a second per open).
        readonly property real gridTop: y + (sec.title ? pane.headerHeight : Style.space(4))
        readonly property int rowCount: Math.ceil(sec.count / pane.columns)
        readonly property int firstRow: Math.max(0, Math.min(rowCount, Math.floor((flick.contentY - gridTop) / pane.cellHeight) - 1))
        readonly property int lastRow: Math.max(firstRow, Math.min(rowCount, Math.ceil((flick.contentY + flick.height - gridTop) / pane.cellHeight) + 1))
        readonly property int firstCell: firstRow * pane.columns
        readonly property int windowCount: Math.max(0, Math.min(sec.count - firstCell, (lastRow - firstRow) * pane.columns))

        Repeater {
          model: parent.windowCount
          delegate: Item {
            id: cell
            required property int index
            readonly property int localIndex: parent.firstCell + index
            readonly property int globalIndex: sec.start + localIndex
            readonly property var info: pane.cells[globalIndex] || ({})
            readonly property bool hasCursor: pane.cursorActive && globalIndex === pane.selectedIndex
            x: pane.horizontalInset + (localIndex % pane.columns) * pane.cellWidth
            y: (sec.title ? pane.headerHeight : Style.space(4)) + Math.floor(localIndex / pane.columns) * pane.cellHeight
            width: pane.cellWidth
            height: pane.cellHeight

            BorderSurface {
              id: tile
              x: Style.space(3)
              y: 0
              width: parent.width - Style.space(6)
              height: Math.round(pane.cellWidth / pane.aspect)
              radius: Math.min(Style.cornerRadius, Style.space(8))
              color: cell.hasCursor ? pane.selectedBackground : Util.alpha(pane.foreground, 0.04)
              borderSpec: cell.hasCursor ? Border.flat(pane.selectedText, Style.space(2)) : Border.none()

              Rectangle {
                anchors.fill: parent
                anchors.margins: pane.insetPx
                radius: Math.min(Style.cornerRadius, Style.space(6))
                visible: cell.info.kind === "color"
                color: cell.info.kind === "color" ? cell.info.value : "transparent"
              }
              IconGlyph {
                anchors.centerIn: parent
                visible: cell.info.kind !== "color" && cell.info.kind !== ""
                kind: cell.info.kind || ""
                value: cell.info.value || ""
                iconResolver: pane.iconResolver
                foreground: cell.hasCursor ? pane.selectedText : pane.foreground
                fontFamily: pane.fontFamily
                size: cell.info.kind === "image" || cell.info.kind === "app" ? Math.min(tile.width, tile.height) - pane.insetPx * 2 : Math.min(tile.width, tile.height) * 0.5
              }
            }

            Text {
              anchors.top: tile.bottom
              anchors.topMargin: Style.space(3)
              anchors.left: tile.left
              anchors.right: tile.right
              text: cell.info.title || ""
              visible: text.length > 0
              color: cell.hasCursor ? pane.selectedText : pane.foreground
              opacity: cell.hasCursor ? 1 : 0.75
              elide: Text.ElideRight
              horizontalAlignment: Text.AlignHCenter
              font.family: pane.fontFamily
              font.pixelSize: Style.font.caption
              textFormat: Text.PlainText
            }

            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onPositionChanged: function(mouse) { if (pointerGate.moved(cell, mouse)) { pane.cursorActive = true; pane.selectedIndex = cell.globalIndex; pane.selectionChanged(pane.selectedItemId()) } }
              onClicked: { pane.cursorActive = true; pane.selectedIndex = cell.globalIndex; pane.activateRequested(cell.info.itemId) }
            }
          }
        }
      }
    }
  }

  PointerMoveGate { id: pointerGate; referenceItem: pane }

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
