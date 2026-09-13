import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "../lib/ViewModel.js" as VM

// The launcher surface: a fullscreen layer-shell scrim with a fixed-size
// card (search field, result pane, status bar) on the focused monitor.
// Shares the [menu] theme tokens so themes that style the Omarchy menu
// style this window too.
PanelWindow {
  id: panel

  property var launcher: null
  readonly property var service: launcher ? launcher.core : null
  readonly property var iconResolver: service
  property bool opened: false

  visible: opened
  anchors { top: true; bottom: true; left: true; right: true }
  color: "transparent"
  WlrLayershell.namespace: "hominluo-launcher"
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
  exclusionMode: ExclusionMode.Ignore

  // ------------------------------------------------------------- theme

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property color selectedBorder: Color.menu.selectedBorder
  property var selectedBorderSpec: Border.surfaceSpec("menu", "selected-border", selectedBorder, 0)
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  readonly property color hairline: Util.alpha(foreground, 0.12)

  // Raycast geometry: 750x475 logical, sitting a little above centre.
  readonly property int cardWidth: Math.min(Style.space(750), width - Style.gapsOut * 2)
  readonly property int cardHeight: Math.min(Style.space(475), height - Style.gapsOut * 2)
  readonly property int cardTop: Math.max(Style.gapsOut, Math.round((height - cardHeight) * 0.38))
  readonly property int searchHeight: Style.space(56)
  readonly property int statusHeight: Style.space(40)

  ViewStack { id: stack }

  readonly property var currentFrame: stack.current
  readonly property bool atRoot: stack.depth <= 1

  // ------------------------------------------------------------- lifecycle

  function summon(payload) {
    var monitor = Hyprland.focusedMonitor
    if (monitor && monitor.screen) panel.screen = monitor.screen
    if (panel.service && typeof panel.service.onWindowOpened === "function") panel.service.onWindowOpened()

    var query = payload && payload.query ? String(payload.query) : ""
    stack.reset()
    stack.push(panel.service ? panel.service.rootView(query) : { id: "root", type: "list", filtering: false, items: [] }, null)
    searchBar.reset(query)
    listPane.filterText = ""
    listPane.selectedIndex = 0
    listPane.cursorActive = true
    panel.opened = true
    Qt.callLater(function() { searchBar.focusInput() })

    if (payload && payload.command && panel.service && typeof panel.service.runCommandId === "function")
      panel.service.runCommandId(String(payload.command), panel)
  }

  function dismiss() {
    if (panel.launcher && typeof panel.launcher.dismiss === "function") panel.launcher.dismiss()
    else panel.opened = false
  }

  // ------------------------------------------------------------- search

  function onSearchEdited(text) {
    var frame = stack.current
    if (!frame) return
    if (!frame.owner) {
      stack.render(panel.service ? panel.service.rootView(text) : frame.view)
      listPane.selectedIndex = 0
      listPane.cursorActive = true
      return
    }
    if (frame.view.filtering) {
      listPane.filterText = text
      return
    }
    if (typeof frame.owner.searchText === "function") frame.owner.searchText(frame.view.id, text)
  }

  function afterStackChange() {
    var view = stack.currentView
    searchBar.reset(view ? view.searchText : "")
    listPane.filterText = view && view.filtering ? searchBar.text : ""
    listPane.selectedIndex = 0
    listPane.cursorActive = true
    Qt.callLater(function() { searchBar.focusInput() })
  }

  // Pushing a view for a built-in: `owner` gets searchText/invoke callbacks.
  function pushView(view, owner) {
    var pushed = stack.push(view, owner)
    if (pushed) afterStackChange()
    return pushed
  }

  function renderView(view) { stack.render(view) }

  function popView() {
    if (!stack.pop()) return false
    afterStackChange()
    return true
  }

  function popToRoot() {
    stack.popToRoot()
    afterStackChange()
  }

  // ------------------------------------------------------------- actions

  function primaryTitle() {
    var item = listPane.selectedItem()
    if (!item) return ""
    if (panel.atRoot && panel.service) {
      var entry = panel.service.entryById(item.data ? item.data.entryId : "")
      if (entry && entry.kind === "app") return "Open"
      if (entry && entry.primaryTitle) return String(entry.primaryTitle)
      return "Run"
    }
    var action = panel.actionAt(item, 0)
    return action ? action.title : ""
  }

  function actionAt(item, level) {
    var panelSpec = item && item.actions ? item.actions : (stack.currentView ? stack.currentView.actions : null)
    if (!panelSpec) return null
    var n = 0
    for (var i = 0; i < panelSpec.sections.length; i++) {
      var acts = panelSpec.sections[i].actions
      for (var j = 0; j < acts.length; j++) {
        if (n === level) return acts[j]
        n += 1
      }
    }
    return null
  }

  function runAction(action, item) {
    if (!action) return
    var frame = stack.current
    if (typeof action.run === "function") {
      var keep = action.run(item, panel) === true
      if (!keep) panel.dismiss()
      return
    }
    switch (action.kind) {
      case "pop": panel.popView(); return
      case "popToRoot": panel.popToRoot(); return
      case "close": panel.dismiss(); return
      case "push": if (action.payload && action.payload.view) panel.pushView(action.payload.view, frame ? frame.owner : null); return
      default:
        if (frame && frame.owner && typeof frame.owner.invoke === "function")
          frame.owner.invoke(frame.view.id, action.id, { itemId: item ? item.id : "", action: action })
    }
  }

  function activate(level) {
    var item = listPane.selectedItem()
    if (!item) return
    if (panel.atRoot && panel.service) {
      var entry = panel.service.entryById(item.data ? item.data.entryId : "")
      if (!entry) return
      if (panel.service.activateEntry(entry, panel)) panel.dismiss()
      return
    }
    panel.runAction(panel.actionAt(item, level), item)
  }

  function autocomplete() {
    var item = listPane.selectedItem()
    if (!item || !item.title) return
    if (searchBar.text === item.title) return
    searchBar.reset(item.title)
    panel.onSearchEdited(item.title)
  }

  function escapePressed() {
    if (!panel.atRoot) { panel.popView(); return }
    panel.dismiss()
  }

  // Every key press reaches here first (see SearchBar). Return true to
  // swallow the key; anything else falls through to the text field.
  function handleKey(event) {
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var shift = (event.modifiers & Qt.ShiftModifier) !== 0
    var alt = (event.modifiers & Qt.AltModifier) !== 0
    var key = event.key

    if (key === Qt.Key_Escape) { panel.escapePressed(); return true }
    if (key === Qt.Key_Down || (ctrl && key === Qt.Key_N) || (ctrl && key === Qt.Key_J)) { listPane.move(1); return true }
    if (key === Qt.Key_Up || (ctrl && key === Qt.Key_P) || (ctrl && key === Qt.Key_K && shift)) { listPane.move(-1); return true }
    if (key === Qt.Key_PageDown) { listPane.page(1); return true }
    if (key === Qt.Key_PageUp) { listPane.page(-1); return true }
    if (key === Qt.Key_Home && ctrl) { listPane.jump(0); return true }
    if (key === Qt.Key_End && ctrl) { listPane.jump(1e9); return true }
    if (key === Qt.Key_Return || key === Qt.Key_Enter) { panel.activate(ctrl ? (shift ? 2 : 1) : 0); return true }
    if (ctrl && key === Qt.Key_K) { panel.toggleActions(); return true }
    if (ctrl && key === Qt.Key_U) { searchBar.reset(""); panel.onSearchEdited(""); return true }
    if (key === Qt.Key_Backspace && !ctrl && !alt && searchBar.text.length === 0) { if (!panel.atRoot) panel.popView(); return true }
    if (key === Qt.Key_Tab && !ctrl) { panel.autocomplete(); return true }
    if (ctrl && key === Qt.Key_R) { if (panel.atRoot) panel.onSearchEdited(searchBar.text); return true }
    return false
  }

  function toggleActions() {
    // Action panel arrives with the next milestone; keep the chord reserved.
  }

  // ------------------------------------------------------------- surface

  Rectangle {
    anchors.fill: parent
    color: panel.scrim
  }

  MouseArea {
    anchors.fill: parent
    onClicked: panel.dismiss()
  }

  BorderSurface {
    id: card
    width: panel.cardWidth
    height: panel.cardHeight
    x: Math.round((panel.width - width) / 2)
    y: panel.cardTop
    radius: panel.cornerRadius
    color: panel.background
    borderSpec: panel.borderSpec

    MouseArea { anchors.fill: parent; onClicked: {} }

    SearchBar {
      id: searchBar
      anchors.top: parent.top
      anchors.topMargin: card.contentTopInset
      anchors.left: parent.left
      anchors.leftMargin: card.contentLeftInset
      anchors.right: parent.right
      anchors.rightMargin: card.contentRightInset
      height: panel.searchHeight
      placeholder: stack.currentView ? stack.currentView.searchBarPlaceholder : "Search…"
      foreground: panel.foreground
      fontFamily: panel.fontFamily
      loading: stack.currentView ? stack.currentView.isLoading : false
      keyHandler: panel.handleKey
      onTextEdited: function(text) { panel.onSearchEdited(text) }
    }

    Rectangle {
      id: searchSeparator
      anchors.top: searchBar.bottom
      anchors.left: parent.left
      anchors.leftMargin: card.contentLeftInset
      anchors.right: parent.right
      anchors.rightMargin: card.contentRightInset
      height: Style.spacing.hairline
      color: panel.hairline
    }

    ListPane {
      id: listPane
      anchors.top: searchSeparator.bottom
      anchors.topMargin: Style.space(6)
      anchors.bottom: statusSeparator.top
      anchors.bottomMargin: Style.space(4)
      anchors.left: parent.left
      anchors.leftMargin: card.contentLeftInset
      anchors.right: parent.right
      anchors.rightMargin: card.contentRightInset
      view: stack.currentView
      iconResolver: panel.iconResolver
      foreground: panel.foreground
      background: panel.background
      selectedBackground: panel.selectedBackground
      selectedText: panel.selectedText
      selectedBorderSpec: panel.selectedBorderSpec
      fontFamily: panel.fontFamily
      onActivateRequested: panel.activate(0)
    }

    Rectangle {
      id: statusSeparator
      anchors.bottom: statusBar.top
      anchors.left: parent.left
      anchors.leftMargin: card.contentLeftInset
      anchors.right: parent.right
      anchors.rightMargin: card.contentRightInset
      height: Style.spacing.hairline
      color: panel.hairline
    }

    StatusBar {
      id: statusBar
      anchors.bottom: parent.bottom
      anchors.bottomMargin: card.contentBottomInset
      anchors.left: parent.left
      anchors.leftMargin: card.contentLeftInset
      anchors.right: parent.right
      anchors.rightMargin: card.contentRightInset
      height: panel.statusHeight
      foreground: panel.foreground
      fontFamily: panel.fontFamily
      title: stack.currentView && stack.currentView.navigationTitle ? stack.currentView.navigationTitle : "Launcher"
      primaryVisible: !listPane.empty
      primaryTitle: {
        var _v = stack.currentView
        var _i = listPane.selectedIndex
        var _c = listPane.count
        return panel.primaryTitle()
      }
      onPrimaryClicked: panel.activate(0)
      onActionsClicked: panel.toggleActions()
    }
  }
}
