import QtQuick
import "../lib/ViewModel.js" as VM

// Navigation stack of normalized views. Each frame is
//   { view, owner }
// where `owner` receives searchText / invoke / popped callbacks. The root
// frame's owner is the launcher window itself (it asks the service for a
// fresh root view on every keystroke); pushed frames belong to built-in
// commands or, later, extension sessions.
QtObject {
  id: stack

  property var frames: []
  readonly property int depth: frames.length
  readonly property var current: frames.length ? frames[frames.length - 1] : null
  readonly property var currentView: current ? current.view : null

  signal changed()

  function push(view, owner) {
    var normalized = VM.normalizeView(view)
    if (!normalized) return null
    frames = frames.concat([{ view: normalized, owner: owner || null }])
    changed()
    return normalized
  }

  // Replace the view with the same id in place (re-render from its owner).
  function render(view) {
    var normalized = VM.normalizeView(view)
    if (!normalized) return
    var next = frames.slice()
    for (var i = next.length - 1; i >= 0; i--) {
      if (next[i].view.id === normalized.id) {
        next[i] = { view: normalized, owner: next[i].owner }
        frames = next
        changed()
        return
      }
    }
  }

  function pop() {
    if (frames.length <= 1) return false
    var top = frames[frames.length - 1]
    frames = frames.slice(0, frames.length - 1)
    if (top.owner && typeof top.owner.viewPopped === "function") top.owner.viewPopped(top.view.id)
    changed()
    return true
  }

  function popToRoot() {
    if (frames.length <= 1) return
    frames = frames.slice(0, 1)
    changed()
  }

  function reset() {
    frames = []
    changed()
  }
}
