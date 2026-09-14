import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/Files.js" as Files

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
          row("default-page", "Default Page", "Favorites, Suggestions, Omarchy and Commands sections, search history", "󰕮", function() { self.push(self.defaultPageForm()) }),
          row("favorites", "Favorites", (service && service.favoritesOrder ? service.favoritesOrder().length : 0) + " pinned to the top of the launcher", "󰓎", function() { self.push(self.favoritesView()) }),
          row("fallbacks", "Fallback Commands", "What a query is handed to when nothing matches", "󰑖", function() { if (service && service.handlers && service.handlers.fallbacks) service.handlers.fallbacks.open(self.panel, {}) }),
          row("commands", "Commands", "Enable, alias, favorite, or bind a hotkey to any command", "󰘔", function() { self.push(self.commandsView("")) }),
          row("files", "File Search", "Search roots, excludes, hidden files", "󰱽", function() { self.push(self.filesForm({})) }),
          row("calculator", "Calculator", "Angle unit for trigonometry", "󰃬", function() { self.push(self.calcForm()) }),
          row("ai", "AI Providers", (service.extHost && service.extHost.aiProviders.length ? "Configured: " + service.extHost.aiProviders.join(", ") : "Anthropic, OpenAI-compatible, or Ollama"), "󰚩", function() { self.push(self.aiForm({})) })
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

  // ---- default page

  function defaultPageForm() {
    var s = settings()
    var sec = function(key, k, def) { var v = s[key]; return v && v[k] !== undefined ? v[k] !== false : def }
    var capItems = []
    for (var i = 0; i <= 8; i++) capItems.push({ value: String(i), title: i === 0 ? "None" : String(i) })
    return {
      id: "prefs-default-page", type: "form", navigationTitle: "Default Page",
      fields: [
        { id: "favorites", field: "checkbox", title: "Favorites", label: "Show the Favorites section", value: sec("favoritesSection", "show", true) },
        { id: "suggestions", field: "checkbox", title: "Suggestions", label: "Show the Suggestions section", value: sec("suggestionsSection", "show", true) },
        { id: "suggestionsCap", field: "dropdown", title: "Suggestions rows", value: String(s.suggestionsCap === undefined || s.suggestionsCap === null ? 5 : s.suggestionsCap), items: capItems, info: "Fewer when favorites take the space (7 personal rows fit above the fold)." },
        { id: "omarchy", field: "checkbox", title: "Omarchy", label: "Show the Omarchy menu section", value: sec("omarchySection", "show", true) },
        { id: "omarchyApps", field: "checkbox", title: "Apps row", label: "Show the Apps row in the Omarchy section", value: sec("omarchySection", "apps", true) },
        { id: "commands", field: "checkbox", title: "Commands", label: "Show the Commands section", value: sec("commandsSection", "show", true) },
        { id: "commandsApps", field: "checkbox", title: "Applications", label: "List applications in Commands", value: sec("commandsSection", "apps", true) },
        { field: "separator" },
        { id: "placeholder", field: "text", title: "Search placeholder", placeholder: "Search apps and commands…", value: String(s.rootPlaceholder || "") },
        { id: "history", field: "checkbox", title: "Search history", label: "Remember queries (↑ on the first row recalls them)", value: !(s.searchHistory && s.searchHistory.enabled === false) }
      ],
      actions: { actions: [
        { id: "save", title: "Save", kind: "submitForm" },
        { id: "clear-history", title: "Clear Search History", icon: "󰃢", run: function() { if (service && service.clearSearchHistory) service.clearSearchHistory(); host.toast("success", "Search history cleared"); return true } },
        { id: "cancel", title: "Cancel", kind: "pop" }
      ] }
    }
  }

  function defaultPageSubmit(values) {
    service.setSettings({
      favoritesSection: { show: values.favorites !== false },
      suggestionsSection: { show: values.suggestions !== false },
      suggestionsCap: Math.max(0, Math.min(8, Number(values.suggestionsCap) || 0)),
      omarchySection: { show: values.omarchy !== false, apps: values.omarchyApps !== false },
      commandsSection: { show: values.commands !== false, apps: values.commandsApps !== false },
      rootPlaceholder: String(values.placeholder || "").trim(),
      searchHistory: { enabled: values.history !== false }
    })
    host.toast("success", "Default page saved")
    host.pop()
  }

  // ---- favorites (ordered)

  function favoritesView() {
    var self = host
    var ids = service && service.favoritesOrder ? service.favoritesOrder() : []
    var items = []
    for (var i = 0; i < ids.length; i++) {
      var e = service.entryById(ids[i])
      if (!e) continue
      var row = service.entryRow(e)
      row.actions = { sections: [
        { actions: [
          { id: "open", title: e.primaryTitle || "Open", icon: "󰐊", run: function(item, win) { var en = service.entryById(item.data.entryId); return en ? !service.activateEntry(en, win) : true } },
          { id: "up", title: "Move Up", icon: "󰁝", shortcut: { modifiers: ["ctrl", "shift"], key: "arrowUp", label: "⌃⇧↑" }, run: function(item) { service.moveFavorite(item.data.entryId, -1); self.render(self.favoritesView()); return true } },
          { id: "down", title: "Move Down", icon: "󰁅", shortcut: { modifiers: ["ctrl", "shift"], key: "arrowDown", label: "⌃⇧↓" }, run: function(item) { service.moveFavorite(item.data.entryId, 1); self.render(self.favoritesView()); return true } }
        ] },
        { actions: [
          { id: "remove", title: "Remove from Favorites", icon: "󰓎", style: "destructive", shortcut: { modifiers: ["ctrl", "shift"], key: "f", label: "⌃⇧F" }, run: function(item, win) { service.toggleFavorite(item.data.entryId, win); self.render(self.favoritesView()); return true } }
        ] }
      ] }
      items.push(row)
    }
    return { id: "prefs-favorites", type: "list", navigationTitle: "Favorites", searchBarPlaceholder: "Favorites…", filtering: true, items: items,
      emptyView: { icon: "󰓎", title: "No favorites yet", description: "Press ⌃⇧F on any row to pin it here" } }
  }

  // ---- commands list + per-command form

  function commandsView(query) {
    var self = host
    var items = []
    var entries = service ? service.entries : []
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      if (e.kind === "window" || e.kind === "omarchy-category") continue
      var row = service.entryRow(e)
      row.subtitle = e.subtitle || ""
      if (e.enabled === false) row.accessories = [{ tag: "disabled" }].concat(row.accessories)
      row.actions = { actions: [ { id: "configure", title: "Configure", icon: "󰢻", run: function(item) { self.configure(self.panel, service.entryById(item.data.entryId)); return true } } ] }
      items.push(row)
    }
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
        { id: "favorite", field: "checkbox", title: "Favorite", label: "Pin to the Favorites section and rank first when it matches", value: entry.favorite === true },
        { id: "alias", field: "text", title: "Alias", placeholder: "e.g. ff", value: String(o.alias || ""), error: errors.alias || "", info: "Typing the alias ranks this above everything else." },
        { id: "hotkey", field: "text", title: "Hotkey", placeholder: "e.g. SUPER + CTRL + V", value: String(o.hotkey || ""), error: errors.hotkey || "", info: "Global Hyprland binding. Leave empty for none." }
      ],
      actions: { actions: [ { id: "save", title: "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  function validHotkey(k) { return !k || /^([A-Za-z]+\s*\+\s*)+[A-Za-z0-9_:]+$/.test(k) }

  function formSubmit(viewId, actionId, values) {
    if (viewId === "prefs-extension") { extensionFormSubmit(values); return }
    if (viewId === "prefs-ai") { aiFormSubmit(values); return }
    if (viewId === "prefs-default-page") { defaultPageSubmit(values); return }
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
      var patch = { enabled: values.enabled !== false, alias: alias, hotkey: hotkey, hotkeyTitle: host.configuring.title }
      var before = ((settings().commands || {})[host.configuring.id] || {}).hotkey || ""
      service.setCommandOverride(host.configuring.id, patch)
      if ((values.favorite === true) !== (host.configuring.favorite === true)) service.toggleFavorite(host.configuring.id, null)
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
        { id: "excludes", field: "textarea", title: "Exclude", value: (s.fileSearchExcludes || Files.defaultExcludes()).join("\n"), info: "Folder names or globs, one per line (toolchains, caches and SDK sources are skipped by default)." },
        { id: "hidden", field: "checkbox", title: "Hidden files", label: "Include dotfiles and dot-folders", value: s.fileSearchHidden === true }
      ],
      actions: { actions: [ { id: "save", title: "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  property var aiConfig: ({})
  function aiForm(errors) {
    var c = host.aiConfig || {}
    var p = c.providers || {}
    return {
      id: "prefs-ai", type: "form", navigationTitle: "AI Providers",
      fields: [
        { id: "default", field: "dropdown", title: "Default", value: String(c["default"] || "anthropic"), items: [ { value: "anthropic", title: "Anthropic (Claude)" }, { value: "openai", title: "OpenAI-compatible" }, { value: "ollama", title: "Ollama (local)" } ] },
        { field: "separator" },
        { id: "anthropicKey", field: "password", title: "Anthropic API key", value: String(p.anthropic && p.anthropic.apiKey || ""), info: "console.anthropic.com" },
        { id: "anthropicModel", field: "text", title: "Anthropic model", value: String(p.anthropic && p.anthropic.model || ""), placeholder: "claude-sonnet-5" },
        { field: "separator" },
        { id: "openaiUrl", field: "text", title: "OpenAI-compatible URL", value: String(p.openai && p.openai.baseUrl || ""), placeholder: "https://api.openai.com/v1", info: "Also OpenRouter, Groq, or any compatible endpoint" },
        { id: "openaiKey", field: "password", title: "API key", value: String(p.openai && p.openai.apiKey || "") },
        { id: "openaiModel", field: "text", title: "Model", value: String(p.openai && p.openai.model || ""), placeholder: "gpt-4o-mini" },
        { field: "separator" },
        { id: "ollamaUrl", field: "text", title: "Ollama URL", value: String(p.ollama && p.ollama.baseUrl || ""), placeholder: "http://localhost:11434", info: "Leave empty to disable" },
        { id: "ollamaModel", field: "text", title: "Ollama model", value: String(p.ollama && p.ollama.model || ""), placeholder: "llama3.2" }
      ],
      actions: { actions: [ { id: "save", title: "Save", kind: "submitForm" }, { id: "cancel", title: "Cancel", kind: "pop" } ] }
    }
  }

  function aiFormSubmit(values) {
    var providers = {}
    if (String(values.anthropicKey || "").trim()) providers.anthropic = { apiKey: String(values.anthropicKey).trim(), model: String(values.anthropicModel || "").trim() || "claude-sonnet-5" }
    if (String(values.openaiKey || "").trim()) providers.openai = { baseUrl: String(values.openaiUrl || "").trim() || "https://api.openai.com/v1", apiKey: String(values.openaiKey).trim(), model: String(values.openaiModel || "").trim() || "gpt-4o-mini" }
    if (String(values.ollamaUrl || "").trim() || String(values.ollamaModel || "").trim()) providers.ollama = { baseUrl: String(values.ollamaUrl || "").trim() || "http://localhost:11434", model: String(values.ollamaModel || "").trim() || "llama3.2" }
    var cfg = { "default": String(values["default"] || "anthropic"), providers: providers }
    host.aiConfig = cfg
    var file = service.configDir + "/ai.json"
    Quickshell.execDetached(["bash", "-c", "umask 077; printf '%s\n' \"$2\" > \"$1\" && chmod 600 \"$1\"", "--", file, JSON.stringify(cfg, null, 2)])
    host.toast("success", "AI providers saved", Object.keys(providers).length ? Object.keys(providers).join(", ") : "none")
    host.pop()
    // The runtime reads ai.json on each request; restart it so capabilities refresh.
    if (service.extHost) Qt.callLater(function() { service.extHost.restartRuntime() })
  }

  FileView {
    path: service ? service.configDir + "/ai.json" : ""
    watchChanges: true
    printErrors: false
    onLoaded: { try { host.aiConfig = JSON.parse(text()) || {} } catch (e) { host.aiConfig = {} } }
    onLoadFailed: host.aiConfig = {}
    onFileChanged: reload()
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
    var page = args && args.page ? String(args.page) : ""
    if (page === "favorites") host.push(favoritesView())
    else if (page === "default-page") host.push(defaultPageForm())
    else if (page === "ai") host.push(aiForm({}))
    else if (page === "extensions") { /* the sections view lists extensions; nothing to push */ }
    else if (page === "fallbacks" && service.handlers && service.handlers.fallbacks) service.handlers.fallbacks.open(win, {})
  }
}
