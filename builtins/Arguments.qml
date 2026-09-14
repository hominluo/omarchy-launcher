import QtQuick
import Quickshell

// Prompts for command arguments before a launch: Raycast extension
// commands declare `arguments` in their manifest (text / password /
// dropdown, required or optional). The form is pushed on top of the root;
// submitting hands the values to the launcher, Escape simply pops.
BuiltinHost {
  id: host

  property var pending: null   // { title, defs, onDone }

  function prompt(win, title, defs, onDone) {
    host.panel = win
    host.pending = { title: String(title || "Arguments"), defs: defs || [], onDone: onDone }
    host.push(argumentsForm({}))
  }

  function argumentsForm(errors) {
    var fields = []
    var defs = host.pending ? host.pending.defs : []
    for (var i = 0; i < defs.length; i++) {
      var a = defs[i]
      var id = String(a.name || ("arg" + (i + 1)))
      var title = String(a.placeholder || a.name || id)
      if (a.type === "dropdown" && a.data) {
        fields.push({ id: id, field: "dropdown", title: title, autoFocus: i === 0, error: errors[id] || "",
          items: (a.data || []).map(function(d) { return { value: String(d.value), title: String(d.title || d.value) } }) })
      } else {
        fields.push({ id: id, field: a.type === "password" ? "password" : "text", title: title, placeholder: a.required ? "" : "optional", autoFocus: i === 0, error: errors[id] || "" })
      }
    }
    return { id: "cmd-args", type: "form", navigationTitle: host.pending ? host.pending.title : "Arguments", fields: fields,
      actions: { actions: [ { id: "run", title: "Run", icon: "󰐊", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] } }
  }

  function formSubmit(viewId, actionId, values) {
    if (viewId !== "cmd-args" || !host.pending) return
    var defs = host.pending.defs
    var errors = {}
    var out = {}
    for (var i = 0; i < defs.length; i++) {
      var id = String(defs[i].name || ("arg" + (i + 1)))
      var v = values[id] === undefined || values[id] === null ? "" : String(values[id])
      if (!v && defs[i].required) errors[id] = "Required"
      out[id] = v
    }
    if (Object.keys(errors).length) { host.render(argumentsForm(errors)); return }
    var done = host.pending.onDone
    host.pending = null
    host.pop()
    if (typeof done === "function") done(out)
  }

  function viewPopped(viewId) {
    if (viewId === "cmd-args") host.pending = null
    if (viewId === host.activeViewId) host.activeViewId = ""
  }
}
