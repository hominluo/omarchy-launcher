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
  readonly property var currentView: stack.currentView
  readonly property bool atRoot: stack.depth <= 1
  readonly property bool splitView: currentView ? currentView.type === "list" && currentView.isShowingDetail === true : false
  property bool confirmOpen: false
  property var confirmCallback: null

  // ------------------------------------------------------------- lifecycle

  function summon(payload) {
    var monitor = Hyprland.focusedMonitor
    if (monitor && monitor.screen) panel.screen = monitor.screen
    if (panel.service && typeof panel.service.onWindowOpened === "function") panel.service.onWindowOpened()

    var query = payload && payload.query ? String(payload.query) : ""
    actionPanel.close()
    toast.hide()
    panel.confirmOpen = false
    stack.reset()
    stack.push(panel.service ? panel.service.rootView(query) : { id: "root", type: "list", filtering: false, items: [] }, null)
    searchBar.reset(query)
    listPane.filterText = ""
    listPane.selectedIndex = 0
    listPane.cursorActive = true
    panel.opened = true
    Qt.callLater(function() { searchBar.focusInput() })

    if (payload && payload.command && panel.service && typeof panel.service.runCommandId === "function")
      panel.service.runCommandId(String(payload.command), panel, payload.arguments || {})
  }

  function dismiss() {
    actionPanel.close()
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

  function searchTextValue() { return searchBar.text }

  function setSearchText(text) {
    searchBar.reset(text)
    panel.onSearchEdited(text)
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

  // ------------------------------------------------------------- feedback

  function showToast(spec) { toast.show(spec || {}) }
  function hideToast() { toast.hide() }

  function confirm(message, confirmText, callback) {
    confirmDialog.message = String(message || "Are you sure?")
    confirmDialog.confirmText = String(confirmText || "Confirm")
    confirmDialog.selectedIndex = 1
    panel.confirmCallback = callback || null
    panel.confirmOpen = true
  }

  // ------------------------------------------------------------- actions

  function actionsFor(item) {
    if (!item) return null
    if (panel.atRoot && panel.service && item.data && item.data.entryId !== undefined) {
      var entry = panel.service.entryById(item.data.entryId)
      return entry ? VM.normalizeActions(panel.service.entryActions(entry)) : null
    }
    if (item.actions && item.actions.sections.length) return item.actions
    return stack.currentView ? stack.currentView.actions : null
  }

  function actionAt(item, level) {
    var spec = panel.actionsFor(item)
    if (!spec) return null
    var n = 0
    for (var i = 0; i < spec.sections.length; i++) {
      var acts = spec.sections[i].actions
      for (var j = 0; j < acts.length; j++) {
        if (n === level) return acts[j]
        n += 1
      }
    }
    return null
  }

  function primaryTitle() {
    var item = listPane.selectedItem()
    var action = item ? panel.actionAt(item, 0) : null
    return action ? action.title : ""
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
      case "copy":
        if (action.payload && action.payload.text !== undefined) Quickshell.execDetached(["wl-copy", "--", String(action.payload.text)])
        panel.dismiss()
        return
      case "openInBrowser":
      case "open":
        if (action.payload && (action.payload.url || action.payload.target)) Qt.openUrlExternally(String(action.payload.url || action.payload.target))
        panel.dismiss()
        return
      case "push":
        if (action.payload && action.payload.view) panel.pushView(action.payload.view, frame ? frame.owner : null)
        return
      default:
        if (frame && frame.owner && typeof frame.owner.invoke === "function")
          frame.owner.invoke(frame.view.id, action.id, { itemId: item ? item.id : "", action: action })
    }
  }

  function activate(level) {
    var item = listPane.selectedItem()
    if (!item) return
    panel.runAction(panel.actionAt(item, level), item)
  }

  function toggleActions() {
    if (actionPanel.opened) { actionPanel.close(); return }
    var item = listPane.selectedItem()
    var spec = panel.actionsFor(item)
    if (!spec || !spec.sections.length) return
    actionPanel.open({ title: spec.title || (item ? item.title : ""), sections: spec.sections })
  }

  function autocomplete() {
    var item = listPane.selectedItem()
    if (!item || !item.title) return
    if (searchBar.text === item.title) return
    panel.setSearchText(item.title)
  }

  function escapePressed() {
    if (!panel.atRoot) { panel.popView(); return }
    panel.dismiss()
  }

  // Every key press reaches here first (see SearchBar). Return true to
  // swallow the key; anything else falls through to the text field.
  function handleKey(event) {
    if (panel.confirmOpen) return confirmDialog.handleKey(event)
    if (actionPanel.opened) return actionPanel.handleKey(event)

    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var shift = (event.modifiers & Qt.ShiftModifier) !== 0
    var alt = (event.modifiers & Qt.AltModifier) !== 0
    var key = event.key

    if (key === Qt.Key_Escape) { panel.escapePressed(); return true }
    if (key === Qt.Key_Down || (ctrl && key === Qt.Key_N) || (ctrl && key === Qt.Key_J)) { listPane.move(1); return true }
    if (key === Qt.Key_Up || (ctrl && key === Qt.Key_P)) { listPane.move(-1); return true }
    if (key === Qt.Key_PageDown) { listPane.page(1); return true }
    if (key === Qt.Key_PageUp) { listPane.page(-1); return true }
    if (key === Qt.Key_Home && ctrl) { listPane.jump(0); return true }
    if (key === Qt.Key_End && ctrl) { listPane.jump(1e9); return true }
    if (key === Qt.Key_Return || key === Qt.Key_Enter) { panel.activate(ctrl ? (shift ? 2 : 1) : 0); return true }
    if (ctrl && key === Qt.Key_K) { panel.toggleActions(); return true }
    if (ctrl && key === Qt.Key_U) { panel.setSearchText(""); return true }
    if (key === Qt.Key_Backspace && !ctrl && !alt && searchBar.text.length === 0) { if (!panel.atRoot) panel.popView(); return true }
    if (key === Qt.Key_Tab && !ctrl) { panel.autocomplete(); return true }
    if (ctrl && key === Qt.Key_R) { if (panel.atRoot) panel.onSearchEdited(searchBar.text); return true }
    if (ctrl && shift && key === Qt.Key_C) {
      var item = listPane.selectedItem()
      if (item) { Quickshell.execDetached(["wl-copy", "--", String(item.title)]); panel.showToast({ style: "success", title: "Copied " + item.title }) }
      return true
    }
    if (ctrl && shift && key === Qt.Key_F && panel.atRoot) {
      var fav = listPane.selectedItem()
      if (fav && panel.service) panel.service.toggleFavorite(fav.data ? fav.data.entryId : "", panel)
      return true
    }
    return false
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
      leadingGlyph: panel.atRoot ? "" : "‹"
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

    Item {
      id: body
      anchors.top: searchSeparator.bottom
      anchors.topMargin: Style.space(6)
      anchors.bottom: statusSeparator.top
      anchors.bottomMargin: Style.space(4)
      anchors.left: parent.left
      anchors.leftMargin: card.contentLeftInset
      anchors.right: parent.right
      anchors.rightMargin: card.contentRightInset

      ListPane {
        id: listPane
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        width: panel.splitView ? Math.round(parent.width * 0.42) : parent.width
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
        id: splitSeparator
        visible: panel.splitView
        anchors.left: listPane.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.topMargin: -Style.space(6)
        anchors.bottomMargin: -Style.space(4)
        width: Style.spacing.hairline
        color: panel.hairline
      }

      DetailPane {
        id: detailPane
        visible: panel.splitView
        anchors.left: splitSeparator.right
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        foreground: panel.foreground
        fontFamily: panel.fontFamily
        readonly property var selected: {
          var _i = listPane.selectedIndex
          var _c = listPane.count
          var _v = stack.currentView
          return panel.splitView ? listPane.selectedItem() : null
        }
        markdown: selected && selected.detail ? String(selected.detail.markdown || "") : ""
        image: selected && selected.detail && selected.detail.image ? String(selected.detail.image) : ""
        metadata: selected && selected.detail && selected.detail.metadata ? selected.detail.metadata : []
      }
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
      leadingVisible: !toast.shown
      primaryVisible: !listPane.empty
      primaryTitle: {
        var _v = stack.currentView
        var _i = listPane.selectedIndex
        var _c = listPane.count
        var _r = panel.service ? panel.service.indexRevision : 0
        return panel.primaryTitle()
      }
      onPrimaryClicked: panel.activate(0)
      onActionsClicked: panel.toggleActions()
    }

    Toast {
      id: toast
      anchors.left: statusBar.left
      anchors.leftMargin: Style.space(14)
      anchors.right: statusBar.horizontalCenter
      anchors.verticalCenter: statusBar.verticalCenter
      height: statusBar.height
      foreground: panel.foreground
      fontFamily: panel.fontFamily
    }

    ActionPanel {
      id: actionPanel
      anchors.fill: parent
      z: 20
      background: panel.background
      foreground: panel.foreground
      selectedBackground: panel.selectedBackground
      selectedText: panel.selectedText
      borderSpec: panel.borderSpec
      fontFamily: panel.fontFamily
      cornerRadius: panel.cornerRadius
      onTriggered: function(action) { panel.runAction(action, listPane.selectedItem()) }
      onClosed: Qt.callLater(function() { if (panel.opened) searchBar.focusInput() })
    }

    ConfirmDialog {
      id: confirmDialog
      anchors.fill: parent
      z: 30
      opened: panel.confirmOpen
      background: panel.background
      foreground: panel.foreground
      scrim: Util.alpha(panel.background, 0.7)
      selectedBackground: panel.selectedBackground
      selectedText: panel.selectedText
      fontFamily: panel.fontFamily
      cornerRadius: panel.cornerRadius
      onCanceled: { panel.confirmOpen = false; panel.confirmCallback = null; Qt.callLater(function() { searchBar.focusInput() }) }
      onConfirmed: {
        panel.confirmOpen = false
        var cb = panel.confirmCallback
        panel.confirmCallback = null
        if (typeof cb === "function") cb()
        Qt.callLater(function() { if (panel.opened) searchBar.focusInput() })
      }
    }
  }
}
