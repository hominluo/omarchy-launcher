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
  readonly property string viewType: currentView ? String(currentView.type) : "list"
  readonly property bool splitView: currentView ? currentView.type === "list" && currentView.isShowingDetail === true : false
  readonly property bool formView: viewType === "form"
  readonly property bool detailView: viewType === "detail"
  readonly property bool searchable: viewType === "list" || viewType === "grid"
  // The pane that owns the cursor for keyboard navigation.
  readonly property var activePane: viewType === "grid" ? gridPane : listPane
  property bool confirmOpen: false
  property var confirmCallback: null
  property var confirmDismissCallback: null
  property var toastPrimaryAction: null
  property var accessoryValues: ({})     // viewId -> current search-bar dropdown value

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
    if (typeof frame.owner.searchText === "function" && !frame.view.filtering) { frame.owner.searchText(frame.view.id, text); return }
    if (frame.view.filtering) {
      listPane.filterText = text
      gridPane.filterText = text
      return
    }
    if (typeof frame.owner.searchText === "function") frame.owner.searchText(frame.view.id, text)
  }

  function searchTextValue() { return searchBar.text }

  function notifySelection(itemId) {
    var frame = stack.current
    if (frame && frame.owner && typeof frame.owner.selection === "function") frame.owner.selection(frame.view.id, itemId)
  }
  function notifyLoadMore() {
    var frame = stack.current
    if (frame && frame.owner && typeof frame.owner.loadMore === "function" && frame.view.pagination && frame.view.pagination.hasMore) frame.owner.loadMore(frame.view.id)
  }
  function cycleAccessory(delta) {
    var view = stack.currentView
    var acc = view ? view.searchBarAccessory : null
    if (!acc) return
    var values = []
    for (var i = 0; i < (acc.sections || []).length; i++) for (var j = 0; j < acc.sections[i].items.length; j++) values.push(acc.sections[i].items[j].value)
    if (!values.length) return
    var cur = values.indexOf(panel.accessoryValueFor(view))
    panel.chooseAccessory(values[(cur + delta + values.length) % values.length])
  }

  function setSearchText(text) {
    searchBar.reset(text)
    panel.onSearchEdited(text)
  }

  function afterStackChange() {
    var view = stack.currentView
    searchBar.reset(view ? view.searchText : "")
    listPane.filterText = view && view.filtering ? searchBar.text : ""
    gridPane.filterText = listPane.filterText
    listPane.selectedIndex = 0
    listPane.cursorActive = true
    gridPane.selectedIndex = 0
    gridPane.cursorActive = true
    Qt.callLater(function() { panel.focusCurrent() })
  }

  function focusCurrent() {
    if (!panel.opened) return
    if (panel.formView) { formPane.focusedIndex = -1; formPane.focusField(formPane.firstEditable(), true) }
    else searchBar.focusInput()
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

  function showToast(spec) {
    spec = spec || {}
    panel.toastPrimaryAction = spec.primaryAction || null
    toast.show(spec)
  }
  function hideToast() { toast.hide(); panel.toastPrimaryAction = null }
  function onConfirmDismissed(cb) { panel.confirmDismissCallback = cb }
  function setAccessoryValue(viewId, value) {
    var next = ({})
    for (var k in panel.accessoryValues) next[k] = panel.accessoryValues[k]
    next[viewId] = value
    panel.accessoryValues = next
  }
  function accessoryValueFor(view) {
    if (!view) return ""
    if (panel.accessoryValues[view.id] !== undefined) return panel.accessoryValues[view.id]
    var acc = view.searchBarAccessory
    if (!acc) return ""
    if (acc.value !== undefined && acc.value !== null) return String(acc.value)
    if (acc.defaultValue !== undefined && acc.defaultValue !== null) return String(acc.defaultValue)
    return ""
  }
  function chooseAccessory(value) {
    var view = stack.currentView
    if (!view || !view.searchBarAccessory) return
    panel.setAccessoryValue(view.id, value)
    var frame = stack.current
    if (frame && frame.owner && typeof frame.owner.dropdown === "function") frame.owner.dropdown(view.id, view.searchBarAccessory.id, value)
  }

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

  function selectedItem() {
    if (panel.formView) return { id: "form", title: "", values: formPane.collect(), actions: null, data: null }
    if (panel.detailView) return { id: "detail", title: "", actions: null, data: null }
    return panel.activePane.selectedItem()
  }

  function primaryTitle() {
    var item = panel.selectedItem()
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
    var owner = frame ? frame.owner : null
    var viewId = frame ? frame.view.id : ""
    var payload = action.payload || {}
    var contentText = function(c) { return c === undefined || c === null ? "" : (typeof c === "object" ? String(c.text !== undefined ? c.text : (c.file || "")) : String(c)) }
    var after = function(args) {
      if (action.callbackId && owner && typeof owner.invoke === "function") owner.invoke(viewId, action.callbackId, { itemId: item ? item.id : "", args: args || [] })
    }
    switch (action.kind) {
      case "submitForm":
        if (owner && typeof owner.formSubmit === "function") owner.formSubmit(viewId, action.id, formPane.collect())
        return
      case "pop": panel.popView(); return
      case "popToRoot": panel.popToRoot(); return
      case "close": panel.dismiss(); return
      case "copy": {
        var text = payload.text !== undefined ? String(payload.text) : contentText(payload.content)
        if (payload.content && typeof payload.content === "object" && payload.content.file && !payload.content.text)
          Quickshell.execDetached(["bash", "-c", "printf 'file://%s' \"$1\" | wl-copy --type text/uri-list", "--", String(payload.content.file)])
        else Quickshell.execDetached(["wl-copy", "--", text])
        panel.showToast({ style: "success", title: "Copied to Clipboard" })
        after([payload.content !== undefined ? payload.content : text])
        return
      }
      case "paste": {
        var ptext = contentText(payload.content !== undefined ? payload.content : payload.text)
        panel.dismiss()
        Quickshell.execDetached(["bash", panel.service.pluginDir + "/bin/paste.sh", ptext])
        after([payload.content !== undefined ? payload.content : ptext])
        return
      }
      case "openInBrowser":
      case "open": {
        var target = String(payload.url || payload.target || "")
        if (target) {
          if (payload.app) Quickshell.execDetached(["bash", "-lc", "uwsm-app -- gtk-launch " + JSON.stringify(String(payload.app).replace(/\.desktop$/, "") + ".desktop") + " " + JSON.stringify(target) + " || xdg-open " + JSON.stringify(target)])
          else Qt.openUrlExternally(target)
        }
        panel.dismiss()
        after([target])
        return
      }
      case "openWith": {
        var owPath = String(payload.path || "")
        Quickshell.execDetached(["bash", "-lc", "xdg-open " + JSON.stringify(owPath)])
        panel.dismiss()
        after([owPath])
        return
      }
      case "showInFileManager": {
        var sp = String(payload.path || "")
        Quickshell.execDetached(["bash", "-lc", "nautilus --select " + JSON.stringify(sp) + " 2>/dev/null || xdg-open " + JSON.stringify(sp.replace(/\/[^/]*$/, ""))])
        panel.dismiss()
        after([sp])
        return
      }
      case "trash": {
        var paths = (payload.paths || []).map(String)
        panel.confirm("Move " + (paths.length === 1 ? paths[0].split("/").pop() : paths.length + " items") + " to the trash?", "Trash", function() { Quickshell.execDetached(["gio", "trash"].concat(paths)); after([paths]) })
        return
      }
      case "toggleQuickLook": {
        var ql = item && item.quickLook ? String(item.quickLook.path || "") : ""
        if (ql) Quickshell.execDetached(["xdg-open", ql])
        return
      }
      case "createSnippet":
        if (panel.service) panel.service.runCommandId("cmd:snippets-create", panel, { mode: "create", seed: payload.snippet || {} })
        return
      case "createQuicklink":
        if (panel.service) panel.service.runCommandId("cmd:quicklinks-create", panel, { mode: "create", name: payload.quicklink ? payload.quicklink.name : "", link: payload.quicklink ? payload.quicklink.link : "" })
        return
      case "pickDate":
        panel.showToast({ style: "failure", title: "Date picker actions are not supported yet" })
        return
      case "push":
        if (payload.view) panel.pushView(payload.view, owner)
        return
      default:
        if (owner && typeof owner.invoke === "function") owner.invoke(viewId, action.id, { itemId: item ? item.id : "", action: action, args: [] })
    }
  }

  // Per-action keyboard shortcuts (Raycast cmd/ctrl -> Ctrl, opt -> Alt).
  function matchShortcut(event, item) {
    var spec = panel.actionsFor(item)
    if (!spec) return null
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var shift = (event.modifiers & Qt.ShiftModifier) !== 0
    var alt = (event.modifiers & Qt.AltModifier) !== 0
    var meta = (event.modifiers & Qt.MetaModifier) !== 0
    if (!ctrl && !alt && !meta) return null
    var keyText = String(event.text || "").toLowerCase()
    var keyNames = {}
    keyNames[Qt.Key_Return] = "return"; keyNames[Qt.Key_Enter] = "enter"; keyNames[Qt.Key_Backspace] = "backspace"; keyNames[Qt.Key_Delete] = "deleteForward"
    keyNames[Qt.Key_Tab] = "tab"; keyNames[Qt.Key_Up] = "arrowUp"; keyNames[Qt.Key_Down] = "arrowDown"; keyNames[Qt.Key_Left] = "arrowLeft"; keyNames[Qt.Key_Right] = "arrowRight"
    keyNames[Qt.Key_PageUp] = "pageUp"; keyNames[Qt.Key_PageDown] = "pageDown"; keyNames[Qt.Key_Home] = "home"; keyNames[Qt.Key_End] = "end"; keyNames[Qt.Key_Space] = "space"; keyNames[Qt.Key_Escape] = "escape"
    var pressed = keyNames[event.key] || (event.key >= Qt.Key_A && event.key <= Qt.Key_Z ? String.fromCharCode(event.key).toLowerCase() : (event.key >= Qt.Key_0 && event.key <= Qt.Key_9 ? String.fromCharCode(event.key) : keyText))
    for (var i = 0; i < spec.sections.length; i++) {
      var acts = spec.sections[i].actions
      for (var j = 0; j < acts.length; j++) {
        var sc = acts[j].shortcut
        if (!sc || !sc.key) continue
        var mods = sc.modifiers || []
        var wantCtrl = mods.indexOf("ctrl") >= 0 || mods.indexOf("cmd") >= 0
        var wantAlt = mods.indexOf("alt") >= 0 || mods.indexOf("opt") >= 0
        var wantShift = mods.indexOf("shift") >= 0
        var wantMeta = mods.indexOf("super") >= 0 || mods.indexOf("windows") >= 0
        var key = String(sc.key)
        var keyOk = key.toLowerCase() === String(pressed).toLowerCase() || (key === "delete" && pressed === "backspace")
        if (keyOk && wantCtrl === ctrl && wantAlt === alt && wantShift === shift && wantMeta === meta) return acts[j]
      }
    }
    return null
  }

  function activate(level) {
    var item = panel.selectedItem()
    if (!item) return
    if (panel.formView && formPane.hasErrors()) { panel.showToast({ style: "failure", title: "Fix the highlighted fields first" }); return }
    panel.runAction(panel.actionAt(item, level), item)
  }

  function toggleActions() {
    if (actionPanel.opened) { actionPanel.close(); return }
    var item = panel.selectedItem()
    var spec = panel.actionsFor(item)
    if (!spec || !spec.sections.length) return
    actionPanel.open({ title: spec.title || (item ? item.title : ""), sections: spec.sections })
  }

  function autocomplete() {
    var item = panel.activePane.selectedItem()
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
    if (ctrl && key === Qt.Key_K) { panel.toggleActions(); return true }
    if (ctrl && key === Qt.Key_T && panel.toastPrimaryAction && typeof panel.toastPrimaryAction.run === "function") { panel.toastPrimaryAction.run(); return true }
    if ((ctrl || alt) && !(key === Qt.Key_Return || key === Qt.Key_Enter) && !(ctrl && key === Qt.Key_U) && !(ctrl && (key === Qt.Key_N || key === Qt.Key_P || key === Qt.Key_J))) {
      var sel = panel.selectedItem()
      var matched = sel ? panel.matchShortcut(event, sel) : null
      if (matched) { panel.runAction(matched, sel); return true }
    }
    if (panel.formView) {
      if ((key === Qt.Key_Return || key === Qt.Key_Enter) && ctrl) { panel.activate(shift ? 1 : 0); return true }
      return false
    }
    if (panel.detailView) {
      if (key === Qt.Key_Down || (ctrl && key === Qt.Key_N)) { fullDetail.scrollBy(1); return true }
      if (key === Qt.Key_Up || (ctrl && key === Qt.Key_P)) { fullDetail.scrollBy(-1); return true }
      if (key === Qt.Key_PageDown) { fullDetail.scrollBy(8); return true }
      if (key === Qt.Key_PageUp) { fullDetail.scrollBy(-8); return true }
      if (key === Qt.Key_Return || key === Qt.Key_Enter) { panel.activate(ctrl ? (shift ? 2 : 1) : 0); return true }
      if (key === Qt.Key_Backspace && !ctrl) { panel.popView(); return true }
      return false
    }
    var pane = panel.activePane
    if (key === Qt.Key_Down || (ctrl && key === Qt.Key_N) || (ctrl && key === Qt.Key_J)) { pane.move(1); return true }
    if (key === Qt.Key_Up || (ctrl && key === Qt.Key_P)) { pane.move(-1); return true }
    if (panel.viewType === "grid" && key === Qt.Key_Right && searchBar.cursorAtEnd()) { gridPane.moveHorizontal(1); return true }
    if (panel.viewType === "grid" && key === Qt.Key_Left && searchBar.cursorAtStart()) { gridPane.moveHorizontal(-1); return true }
    if (key === Qt.Key_PageDown) { pane.page(1); return true }
    if (key === Qt.Key_PageUp) { pane.page(-1); return true }
    if (key === Qt.Key_Home && ctrl) { pane.jump(0); return true }
    if (key === Qt.Key_End && ctrl) { pane.jump(1e9); return true }
    if (key === Qt.Key_Return || key === Qt.Key_Enter) { panel.activate(ctrl ? (shift ? 2 : 1) : 0); return true }
    if (ctrl && key === Qt.Key_U) { panel.setSearchText(""); return true }
    if (alt && (key === Qt.Key_Down || key === Qt.Key_Up) && stack.currentView && stack.currentView.searchBarAccessory) { panel.cycleAccessory(key === Qt.Key_Down ? 1 : -1); return true }
    if (key === Qt.Key_Backspace && !ctrl && !alt && searchBar.text.length === 0) { if (!panel.atRoot) panel.popView(); return true }
    if (key === Qt.Key_Tab && !ctrl) { panel.autocomplete(); return true }
    if (ctrl && key === Qt.Key_R) { if (panel.atRoot) panel.onSearchEdited(searchBar.text); return true }
    if (ctrl && key === Qt.Key_Comma && panel.service) {
      if (shift && panel.atRoot) { var sel = pane.selectedItem(); if (sel && sel.data && sel.data.entryId !== undefined) panel.service.runCommandId("cmd:preferences", panel, { entryId: sel.data.entryId }) }
      else panel.service.runCommandId("cmd:preferences", panel, {})
      return true
    }
    if (ctrl && shift && key === Qt.Key_C) {
      var item = pane.selectedItem()
      if (item) { Quickshell.execDetached(["wl-copy", "--", String(item.title)]); panel.showToast({ style: "success", title: "Copied " + item.title }) }
      return true
    }
    if (ctrl && shift && key === Qt.Key_F && panel.atRoot) {
      var fav = pane.selectedItem()
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
      placeholder: stack.currentView ? (panel.searchable ? stack.currentView.searchBarPlaceholder : (stack.currentView.navigationTitle || "")) : "Search…"
      foreground: panel.foreground
      fontFamily: panel.fontFamily
      loading: stack.currentView ? stack.currentView.isLoading : false
      leadingGlyph: panel.atRoot ? "" : "‹"
      editable: panel.searchable
      accessory: stack.currentView ? stack.currentView.searchBarAccessory : null
      accessoryValue: panel.accessoryValueFor(stack.currentView)
      onAccessoryChosen: function(value) { panel.chooseAccessory(value) }
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
        visible: panel.viewType === "list"
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        width: panel.splitView ? Math.round(parent.width * 0.42) : parent.width
        view: panel.viewType === "list" ? stack.currentView : null
        iconResolver: panel.iconResolver
        foreground: panel.foreground
        background: panel.background
        selectedBackground: panel.selectedBackground
        selectedText: panel.selectedText
        selectedBorderSpec: panel.selectedBorderSpec
        fontFamily: panel.fontFamily
        onActivateRequested: panel.activate(0)
        onSelectionChanged: function(itemId) { panel.notifySelection(itemId) }
        onLoadMoreRequested: panel.notifyLoadMore()
      }

      GridPane {
        id: gridPane
        visible: panel.viewType === "grid"
        anchors.fill: parent
        view: panel.viewType === "grid" ? stack.currentView : null
        iconResolver: panel.iconResolver
        foreground: panel.foreground
        background: panel.background
        selectedBackground: panel.selectedBackground
        selectedText: panel.selectedText
        selectedBorderSpec: panel.selectedBorderSpec
        fontFamily: panel.fontFamily
        onActivateRequested: panel.activate(0)
        onSelectionChanged: function(itemId) { panel.notifySelection(itemId) }
      }

      DetailPane {
        id: fullDetail
        visible: panel.detailView
        anchors.fill: parent
        foreground: panel.foreground
        fontFamily: panel.fontFamily
        markdown: panel.detailView && stack.currentView ? String(stack.currentView.markdown || "") : ""
        metadata: panel.detailView && stack.currentView && stack.currentView.metadata ? stack.currentView.metadata : []
      }

      FormPane {
        id: formPane
        visible: panel.formView
        anchors.fill: parent
        foreground: panel.foreground
        background: panel.background
        fontFamily: panel.fontFamily
        view: panel.formView ? stack.currentView : null
        keyHandler: panel.handleKey
        onSubmitRequested: panel.activate(0)
        onFieldChanged: function(fieldId, value) {
          var frame = stack.current
          if (frame && frame.owner && typeof frame.owner.formChange === "function") frame.owner.formChange(frame.view.id, fieldId, value)
        }
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
          return panel.splitView && panel.viewType === "list" ? listPane.selectedItem() : null
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
      primaryVisible: panel.formView || panel.detailView || !panel.activePane.empty
      primaryTitle: {
        var _v = stack.currentView
        var _i = listPane.selectedIndex + gridPane.selectedIndex
        var _c = listPane.count + gridPane.count
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
      onTriggered: function(action) { panel.runAction(action, panel.selectedItem()) }
      onClosed: Qt.callLater(function() { panel.focusCurrent() })
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
      onCanceled: {
        panel.confirmOpen = false; panel.confirmCallback = null
        var dc = panel.confirmDismissCallback; panel.confirmDismissCallback = null
        if (typeof dc === "function") dc()
        Qt.callLater(function() { panel.focusCurrent() })
      }
      onConfirmed: {
        panel.confirmOpen = false
        var cb = panel.confirmCallback
        panel.confirmCallback = null
        panel.confirmDismissCallback = null
        if (typeof cb === "function") cb()
        Qt.callLater(function() { panel.focusCurrent() })
      }
    }
  }
}
