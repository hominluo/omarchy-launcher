import QtQuick
import Quickshell
import Quickshell.Io

// Reminders on top of `omarchy reminder`: create with a form, list what is
// pending, clear them.
BuiltinHost {
  id: host

  property var items: []

  function createForm(errors) {
    return { id: "reminder-create", type: "form", navigationTitle: "Set Reminder",
      fields: [
        { id: "when", field: "text", title: "In", placeholder: "15 (minutes) or 14:30", autoFocus: true, error: (errors || {}).when || "", info: "Minutes from now, or a time today as HH:MM." },
        { id: "message", field: "text", title: "Message", placeholder: "Pick up Jack" }
      ],
      actions: { actions: [ { id: "create", title: "Set Reminder", icon: "󰀠", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] } }
  }

  function minutesFrom(text) {
    var s = String(text || "").trim()
    var m = s.match(/^(\d{1,2}):(\d{2})$/)
    if (m) {
      var now = new Date()
      var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]), 0)
      if (target <= now) target.setDate(target.getDate() + 1)
      return Math.max(1, Math.round((target - now) / 60000))
    }
    var h = s.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hours?)$/i)
    if (h) return Math.round(parseFloat(h[1]) * 60)
    var n = s.match(/^(\d+)\s*(m|min|minutes?)?$/i)
    return n ? Number(n[1]) : NaN
  }

  function formSubmit(viewId, actionId, values) {
    if (viewId !== "reminder-create") return
    var minutes = minutesFrom(values.when)
    if (!(minutes > 0)) { host.render(createForm({ when: "Minutes (e.g. 15) or a time (e.g. 14:30)" })); return }
    var msg = String(values.message || "").trim() || "Reminder"
    Quickshell.execDetached(["omarchy-reminder", String(minutes), msg])
    host.toast("success", "Reminder set", "in " + minutes + " min · " + msg)
    host.pop()
    if (host.panel) host.panel.dismiss()
  }

  function listView() {
    var self = host
    var rows = []
    for (var i = 0; i < host.items.length; i++) {
      var r = host.items[i]
      rows.push({ id: String(r.id || i), title: String(r.message || r.text || "Reminder"), subtitle: String(r.due || r.at || r.time || ""), icon: "󰀠", data: { r: r },
        actions: { actions: [ { id: "clear", title: "Clear All Reminders", icon: "󰧧", style: "destructive", run: function() { self.confirm("Clear all reminders?", "Clear", function() { Quickshell.execDetached(["omarchy-reminder", "clear"]); self.items = []; self.render(self.listView()) }); return true } } ] } })
    }
    return { id: "reminders", type: "list", navigationTitle: "Reminders", searchBarPlaceholder: "Search reminders…", filtering: true, items: rows,
      emptyView: { icon: "󰀠", title: "No pending reminders", description: "Use “Set Reminder” to add one" },
      actions: { actions: [ { id: "new", title: "Set Reminder", icon: "󰐕", run: function() { self.push(self.createForm({})); return true } } ] } }
  }

  function open(win, args) {
    host.panel = win
    var mode = args && args.mode ? String(args.mode) : "create"
    if (mode === "list") { lister.running = true; host.push(listView()); return }
    host.push(createForm({}))
  }

  Process {
    id: lister
    command: ["bash", "-lc", "omarchy-reminder show --json 2>/dev/null || true"]
    stdout: StdioCollector {
      onStreamFinished: {
        var list = []
        try { var d = JSON.parse(text); list = Array.isArray(d) ? d : (d && Array.isArray(d.reminders) ? d.reminders : []) } catch (e) { list = [] }
        host.items = list
        if (host.activeViewId === "reminders") host.render(host.listView())
      }
    }
  }
}
