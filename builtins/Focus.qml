import QtQuick
import Quickshell
import Quickshell.Io

// Focus sessions: a countdown with an optional Do Not Disturb, finishing
// with a notification. State persists in focus.json so a shell restart
// keeps the timer.
BuiltinHost {
  id: host

  readonly property string statePath: service ? service.stateDir + "/focus.json" : ""
  property bool active: false
  property double endsAt: 0
  property string label: ""
  property bool dndSet: false
  readonly property int remaining: active ? Math.max(0, Math.round((endsAt - nowMs) / 1000)) : 0
  property double nowMs: Date.now()

  function remainingText() {
    var r = host.remaining
    var m = Math.floor(r / 60), s = r % 60
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s
  }

  function start(minutes, text, dnd) {
    host.label = String(text || "Focus")
    host.endsAt = Date.now() + Math.max(1, Number(minutes) || 25) * 60000
    host.active = true
    host.dndSet = dnd === true
    if (dnd) Quickshell.execDetached(["bash", "-lc", "omarchy-toggle-enabled notification-silencing >/dev/null 2>&1 || omarchy-toggle-notification-silencing"])
    save()
    tick.start()
    Quickshell.execDetached(["omarchy-notification-send", "-g", "󰔛", "Focus started", host.label + " · " + (Number(minutes) || 25) + " min"])
  }

  function stop(finished) {
    if (!host.active) return
    host.active = false
    tick.stop()
    if (host.dndSet) Quickshell.execDetached(["bash", "-lc", "omarchy-toggle-enabled notification-silencing >/dev/null 2>&1 && omarchy-toggle-notification-silencing"])
    host.dndSet = false
    save()
    if (finished) Quickshell.execDetached(["omarchy-notification-send", "-g", "󰔛", "-u", "critical", "Focus session done", host.label])
    else Quickshell.execDetached(["omarchy-notification-send", "-g", "󰔛", "Focus session stopped", host.label])
  }

  function save() {
    stateFile.setText(JSON.stringify({ active: host.active, endsAt: host.endsAt, label: host.label, dndSet: host.dndSet }) + "\n")
  }

  Timer {
    id: tick
    interval: 1000
    repeat: true
    onTriggered: { host.nowMs = Date.now(); if (host.active && host.nowMs >= host.endsAt) host.stop(true) }
  }

  function startForm(errors) {
    return { id: "focus-start", type: "form", navigationTitle: "Start Focus Session",
      fields: [
        { id: "minutes", field: "text", title: "Minutes", placeholder: "25", autoFocus: true, error: (errors || {}).minutes || "" },
        { id: "label", field: "text", title: "Goal", placeholder: "What are you working on?" },
        { id: "dnd", field: "checkbox", title: "Notifications", label: "Silence notifications during the session", defaultValue: true }
      ],
      actions: { actions: [ { id: "start", title: "Start Focus", icon: "󰔛", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] } }
  }

  function formSubmit(viewId, actionId, values) {
    if (viewId !== "focus-start") return
    var minutes = parseFloat(String(values.minutes || "25").trim() || "25")
    if (!(minutes > 0) || minutes > 24 * 60) { host.render(startForm({ minutes: "Enter a number of minutes" })); return }
    start(minutes, values.label, values.dnd === true)
    host.toast("success", "Focus started", remainingText() + " · " + host.label)
    host.pop()
    if (host.panel) host.panel.dismiss()
  }

  function open(win, args) {
    host.panel = win
    var mode = args && args.mode ? String(args.mode) : "start"
    if (mode === "stop") { if (host.active) { stop(false); host.toast("success", "Focus stopped") } else host.toast("failure", "No focus session running"); return }
    if (host.active) { host.confirm("A session is running (" + remainingText() + " left). Stop it?", "Stop", function() { host.stop(false) }); return }
    host.push(startForm({}))
  }

  FileView {
    id: stateFile
    path: host.statePath
    printErrors: false
    onLoaded: {
      try {
        var d = JSON.parse(text())
        if (d && d.active && d.endsAt > Date.now()) { host.label = String(d.label || "Focus"); host.endsAt = d.endsAt; host.dndSet = d.dndSet === true; host.active = true; tick.start() }
      } catch (e) {}
    }
  }
}
