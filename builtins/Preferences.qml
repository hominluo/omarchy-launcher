import QtQuick
import Quickshell
import Quickshell.Io

// Launcher Preferences: general settings, per-command configuration
// (enable, alias, hotkey, favorite), file search scope, calculator.
// Everything is written to ~/.config/omarchy-launcher/settings.json;
// hotkeys are pushed into bindings.lua through bin/hotkeys.py.
BuiltinHost {
  id: host

  property var configuring: null      // entry being configured
  property var pendingToast: null

  function settings() { return service && service.settings ? service.settings : {} }

  function sectionsView() {
    var self = host
    var s = settings()
    function row(id, title, subtitle, icon, run) {
      return { id: id, title: title, subtitle: subtitle, icon: icon, data: {}, actions: { actions: [ { id: "open", title: "Open", run: function() { run(); return true } } ] } }
    }
    return {
      id: "prefs",
      type: "list",
      navigationTitle: "Launcher Preferences",
      searchBarPlaceholder: "Search preferences…",
      filtering: true,
      sections: [
        { title: "General", items: [
          row("hotkey", "Launcher Hotkey", String(s.hotkey || "SUPER + D"), "󰥻", function() { self.push(self.hotkeyForm({})) }),
          row("commands", "Commands", "Enable, alias, favorite, or bind a hotkey to any command", "󰘔", function() { self.push(self.commandsView("")) }),
          row("files", "File Search", "Search roots, excludes, hidden files", "󰱽", function() { self.push(self.filesForm({})) }),
          row("calculator", "Calculator", "Angle unit for trigonometry", "󰃬", function() { self.push(self.calcForm()) })
        ] },
        { title: "Extensions", items: (service.extensions || []).map(function(ext) {
          return row("ext:" + ext.id, String(ext.title || ext.name), (ext.commands || []).length + " command(s) · " + (ext.compat && ext.compat.status ? ext.compat.status : "full"), ext.icon ? { kind: "image", value: "file://" + ext.icon } : "󰑣", function() { self.configureExtension(self.panel, ext, null, false) })
        }).concat([ row("ext-install", "Install Extensions", "launcher ext install <owner/name> in a terminal, or search the Raycast Store", "󰐕", function() { Quickshell.execDetached(["xdg-open", "https://www.raycast.com/store"]); self.close() }) ]) },
        { title: "Files", items: [
          row("settings-json", "Open settings.json", service ? service.configDir + "/settings.json" : "", "󰈤", function() { Quickshell.execDetached(["xdg-open", service.configDir + "/settings.json"]); self.close() }),
          row("snippets-json", "Open snippets.json", "", "󰧭", function() { Quickshell.execDetached(["xdg-open", service.configDir + "/snippets.json"]); self.close() }),
          row("quicklinks-json", "Open quicklinks.json", "", "󰌹", function() { Quickshell.execDetached(["xdg-open", service.configDir + "/quicklinks.json"]); self.close() }),
          row("reindex", "Reindex Applications", "Rescan desktop entries and icons", "󰑐", function() { service.rebuildApps(); service.lastIconScan = 0; service.onWindowOpened(); self.toast("success", "Reindexed", service.appEntries.length + " applications") })
        ] }
      ]
    }
  }

  // ---- hotkey

  function hotkeyForm(errors) {
    return {
      id: "prefs-hotkey", type: "form", navigationTitle: "Launcher Hotkey",
      fields: [
        { id: "hotkey", field: "text", title: "Hotkey", placeholder: "SUPER + D", autoFocus: true, value: String(settings().hotkey || "SUPER + D"), error: errors.hotkey || "",
          info: "Hyprland syntax: SUPER, CTRL, ALT, SHIFT joined with +, then a key. Number keys are written as keycodes for you. Saving rewrites the managed block in ~/.config/hypr/bindings.lua." }
      ],
      actions: { actions: [ { id: "save", title: "Save Hotkey", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  // ---- commands list + per-command form

  function commandsView(query) {
    var self = host
    var items = []
    var entries = service ? service.entries : []
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      if (e.kind === "window") continue
      var flags = []
      if (e.favorite) flags.push("󰓎")
      if (e.hotkey) flags.push(e.hotkey)
      var custom = e.aliases.length && e.aliases[0] !== (e.baseAliases || [])[0] ? e.aliases[0] : ""
      if (custom) flags.push("alias: " + custom)
      if (e.enabled === false) flags.push("disabled")
      items.push({
        id: e.id, title: e.title, subtitle: e.accessoryText || "", icon: e.icon, keywords: e.keywords,
        accessories: [{ text: flags.join("  ") }],
        data: { entryId: e.id },
        actions: { actions: [ { id: "configure", title: "Configure", run: function(item) { self.configure(self.panel, service.entryById(item.data.entryId)); return true } } ] }
      })
    }
    // Disabled entries are not in service.entries (filtered by rank), but they are in the index with enabled=false; include them.
    return { id: "prefs-commands", type: "list", navigationTitle: "Commands", searchBarPlaceholder: "Search commands…", filtering: true, items: items }
  }

  function configure(win, entry) {
    if (!entry) return
    host.panel = win
    host.configuring = entry
    host.push(commandForm(entry, {}))
  }

  function commandForm(entry, errors) {
    var o = (settings().commands || {})[entry.id] || {}
    return {
      id: "prefs-command", type: "form", navigationTitle: "Configure: " + entry.title,
      fields: [
        { id: "enabled", field: "checkbox", title: "Enabled", label: "Show in search results", value: o.enabled !== false },
        { id: "favorite", field: "checkbox", title: "Favorite", label: "Rank first when it matches", value: o.favorite === true },
        { id: "alias", field: "text", title: "Alias", placeholder: "e.g. ff", value: String(o.alias || ""), error: errors.alias || "", info: "Typing the alias ranks this above everything else." },
        { id: "hotkey", field: "text", title: "Hotkey", placeholder: "e.g. SUPER + CTRL + V", value: String(o.hotkey || ""), error: errors.hotkey || "", info: "Global Hyprland binding. Leave empty for none." }
      ],
      actions: { actions: [ { id: "save", title: "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  function validHotkey(k) { return !k || /^([A-Za-z]+\s*\+\s*)+[A-Za-z0-9_:]+$/.test(k) }

  function formSubmit(viewId, actionId, values) {
    if (viewId === "prefs-extension") { extensionFormSubmit(values); return }
    if (viewId === "prefs-hotkey") {
      var hk = String(values.hotkey || "").trim()
      if (!validHotkey(hk) || !hk) { host.render(hotkeyForm({ hotkey: "Use the form MOD + KEY, e.g. SUPER + D" })); return }
      service.setSetting("hotkey", hk)
      applyHotkeys("Hotkey saved: " + hk)
      host.pop()
      return
    }
    if (viewId === "prefs-command" && host.configuring) {
      var errors = {}
      var alias = String(values.alias || "").trim().toLowerCase()
      var hotkey = String(values.hotkey || "").trim()
      if (alias && !/^[a-z0-9 ]+$/.test(alias)) errors.alias = "Letters, digits and spaces only"
      if (!validHotkey(hotkey)) errors.hotkey = "Use the form MOD + KEY, e.g. SUPER + CTRL + V"
      if (Object.keys(errors).length) { host.render(commandForm(host.configuring, errors)); return }
      var patch = { enabled: values.enabled !== false, favorite: values.favorite === true, alias: alias, hotkey: hotkey, hotkeyTitle: host.configuring.title }
      var before = ((settings().commands || {})[host.configuring.id] || {}).hotkey || ""
      service.setCommandOverride(host.configuring.id, patch)
      if (before !== hotkey) applyHotkeys("Saved " + host.configuring.title + (hotkey ? " · " + hotkey : ""))
      else host.toast("success", "Saved", host.configuring.title)
      host.configuring = null
      host.pop()
      if (host.activeViewId === "prefs-commands") host.render(commandsView(""))
      return
    }
    if (viewId === "prefs-files") {
      var roots = String(values.roots || "").split(/\n|,/).map(function(x) { return x.trim() }).filter(function(x) { return x })
      var ex = String(values.excludes || "").split(/\n|,/).map(function(x) { return x.trim() }).filter(function(x) { return x })
      service.setSetting("fileSearchRoots", roots.length ? roots : ["~"])
      service.setSetting("fileSearchExcludes", ex)
      service.setSetting("fileSearchHidden", values.hidden === true)
      host.toast("success", "File search settings saved")
      host.pop()
      return
    }
    if (viewId === "prefs-calc") {
      service.setSetting("calculator", { angle: String(values.angle || "deg") })
      host.toast("success", "Calculator settings saved")
      host.pop()
    }
  }

  function applyHotkeys(message) {
    host.pendingToast = message
    hotkeyProc.running = true
  }

  Process {
    id: hotkeyProc
    command: ["python3", service ? service.pluginDir + "/bin/hotkeys.py" : "", "--apply"]
    stderr: StdioCollector { id: hotkeyErr }
    onExited: function(code) {
      if (code === 0) host.toast("success", host.pendingToast || "Hotkeys applied")
      else host.toast("failure", "Could not write bindings.lua", String(hotkeyErr.text || "").trim().slice(0, 120))
    }
  }

  // ---- files & calculator forms

  function filesForm(errors) {
    var s = settings()
    return {
      id: "prefs-files", type: "form", navigationTitle: "File Search",
      fields: [
        { id: "roots", field: "textarea", title: "Search in", value: (s.fileSearchRoots || ["~"]).join("\n"), info: "One folder per line. ~ is your home." },
        { id: "excludes", field: "textarea", title: "Exclude", value: (s.fileSearchExcludes || [".git", "node_modules", ".cache", "__pycache__", ".local/share/Trash"]).join("\n"), info: "Folder names or globs, one per line." },
        { id: "hidden", field: "checkbox", title: "Hidden files", label: "Include dotfiles and dot-folders", value: s.fileSearchHidden === true }
      ],
      actions: { actions: [ { id: "save", title: "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  function calcForm() {
    var s = settings()
    return {
      id: "prefs-calc", type: "form", navigationTitle: "Calculator",
      fields: [
        { id: "angle", field: "dropdown", title: "Angles", value: s.calculator && s.calculator.angle === "rad" ? "rad" : "deg", items: [ { value: "deg", title: "Degrees" }, { value: "rad", title: "Radians" } ] }
      ],
      actions: { actions: [ { id: "save", title: "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  // ---- extension preferences (manifest-driven form)

  property var extConfiguring: null     // { ext, cmd, launchAfter }

  function configureExtension(win, ext, cmd, launchAfter) {
    host.panel = win
    host.extConfiguring = { ext: ext, cmd: cmd || null, launchAfter: launchAfter === true }
    host.push(extensionForm(ext, cmd, {}))
  }

  function extensionForm(ext, cmd, errors) {
    var stored = (service.extensionPrefs || {})[ext.id] || {}
    var fields = []
    var add = function(defs, scope, values) {
      for (var i = 0; i < (defs || []).length; i++) {
        var d = defs[i]
        var id = scope + ":" + d.name
        var cur = values && values[d.name] !== undefined ? values[d.name] : d["default"]
        var base = { id: id, title: String(d.title || d.name), info: String(d.description || "") + (d.required ? " (required)" : ""), error: errors[id] || "", placeholder: String(d.placeholder || "") }
        if (d.type === "checkbox") fields.push(Object.assign(base, { field: "checkbox", label: String(d.label || d.title || d.name), value: cur === true || cur === "true" }))
        else if (d.type === "dropdown") fields.push(Object.assign(base, { field: "dropdown", value: cur !== undefined ? String(cur) : "", items: (d.data || []).map(function(o) { return { value: String(o.value), title: String(o.title || o.value) } }) }))
        else if (d.type === "password") fields.push(Object.assign(base, { field: "password", value: cur !== undefined ? String(cur) : "" }))
        else if (d.type === "file" || d.type === "directory") fields.push(Object.assign(base, { field: "file", value: cur ? [String(cur)] : [], files: d.type === "file", directories: d.type === "directory" }))
        else if (d.type === "appPicker") fields.push(Object.assign(base, { field: "text", value: cur !== undefined ? String(cur) : "", info: base.info + " Enter a desktop id, e.g. firefox" }))
        else fields.push(Object.assign(base, { field: "text", value: cur !== undefined ? String(cur) : "" }))
      }
    }
    add(ext.preferences, "", stored[""])
    if (cmd) add(cmd.preferences, cmd.name, stored[cmd.name])
    if (!fields.length) fields.push({ id: "none", field: "description", text: "This extension has no preferences." })
    return { id: "prefs-extension", type: "form", navigationTitle: String(ext.title || ext.name) + " Preferences", fields: fields,
      actions: { actions: [ { id: "save", title: host.extConfiguring && host.extConfiguring.launchAfter ? "Save and Open" : "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] } }
  }

  function extensionFormSubmit(values) {
    var c = host.extConfiguring
    if (!c) return
    var data = (service.extensionPrefs || {})[c.ext.id] || {}
    var errors = {}
    var take = function(defs, scope) {
      var bucket = Object.assign({}, data[scope] || {})
      for (var i = 0; i < (defs || []).length; i++) {
        var d = defs[i]
        var v = values[scope + ":" + d.name]
        if (d.type === "file" || d.type === "directory") v = Array.isArray(v) ? (v[0] || "") : v
        if (d.type === "checkbox") v = v === true
        if (d.required && (v === undefined || v === "" || v === null)) errors[scope + ":" + d.name] = "Required"
        bucket[d.name] = v
      }
      data[scope] = bucket
    }
    take(c.ext.preferences, "")
    if (c.cmd) take(c.cmd.preferences, c.cmd.name)
    if (Object.keys(errors).length) { host.render(extensionForm(c.ext, c.cmd, errors)); return }
    service.saveExtensionPrefs(c.ext.id, data)
    host.toast("success", "Preferences saved", String(c.ext.title || c.ext.name))
    host.extConfiguring = null
    host.pop()
    if (c.launchAfter && c.cmd && host.panel) Qt.callLater(function() { service.extHost.launch(c.ext, c.cmd, host.panel, {}) })
  }

  function open(win, args) {
    host.panel = win
    if (args && args.entryId) { configure(win, service.entryById(String(args.entryId))); return }
    if (args && args.extension) {
      var ext = service.findExtension(String(args.extension))
      if (ext) { configureExtension(win, ext, null, false); return }
    }
    host.push(sectionsView())
  }
}
