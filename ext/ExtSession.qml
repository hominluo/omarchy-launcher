import QtQuick

// One running extension command. Owns the views it pushed on the window and
// forwards every UI event to the sidecar session.
QtObject {
  id: session
  property var host: null
  property string sessionId: ""
  property string extensionId: ""
  property string commandName: ""
  property string title: ""
  property var panel: null
  property var viewIds: []            // shell-side view ids, in push order
  property int nextView: 1
  property bool ended: false
  property bool menuBar: false        // a menu-bar command: lives in the bar, not the window
  property var menubarRoot: null      // last rendered menubar view model

  function viewKey(sidecarView) { return "ext:" + session.sessionId + ":" + sidecarView }
  function sidecarView(viewKey) { return String(viewKey).replace("ext:" + session.sessionId + ":", "") }

  // ---- ViewStack owner callbacks
  function searchText(viewId, text) { host.notify("ui.searchText", { s: sessionId, view: sidecarView(viewId), text: text }) }
  function selection(viewId, itemId) { host.notify("ui.selection", { s: sessionId, view: sidecarView(viewId), itemId: itemId || null }) }
  function loadMore(viewId) { host.notify("ui.loadMore", { s: sessionId, view: sidecarView(viewId) }) }
  function dropdown(viewId, dropdownId, value) { host.notify("ui.dropdown", { s: sessionId, view: sidecarView(viewId), dropdown: dropdownId, value: value }) }
  function dropdownSearch(viewId, text) { host.notify("ui.dropdownSearch", { s: sessionId, view: sidecarView(viewId), text: text }) }
  function invoke(viewId, actionId, ctx) {
    if (!actionId) return
    host.notify("ui.callback", { s: sessionId, h: String(actionId), args: ctx && ctx.args !== undefined ? ctx.args : [] })
  }
  function formSubmit(viewId, actionId, values) { host.notify("ui.formSubmit", { s: sessionId, view: sidecarView(viewId), h: String(actionId), values: values }) }
  function formChange(viewId, fieldId, value) { host.notify("ui.formValue", { s: sessionId, view: sidecarView(viewId), field: fieldId, value: value }) }
  function viewPopped(viewId) {
    host.notify("ui.viewPopped", { s: sessionId, view: sidecarView(viewId) })
    session.viewIds = session.viewIds.filter(function(v) { return v !== viewId })
    if (session.viewIds.length === 0) host.endSession(session.sessionId, "popped")
  }
  function toastAction(id) { host.notify("ui.toastAction", { s: sessionId, id: id }) }
}
