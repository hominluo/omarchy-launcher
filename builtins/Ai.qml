import QtQuick
import Quickshell
import Quickshell.Io

// AI: Ask AI (streaming answer page), Quick AI row in root search, and a set
// of AI commands over the selection/clipboard. Providers are configured in
// ~/.config/omarchy-launcher/ai.json and served by the extension runtime.
BuiltinHost {
  id: host

  readonly property var extHost: service ? service.extHost : null
  property bool configured: false
  readonly property bool available: configured || (extHost ? extHost.aiProviders.length > 0 : false)

  FileView {
    path: service ? service.configDir + "/ai.json" : ""
    watchChanges: true
    printErrors: false
    onLoaded: {
      try {
        var d = JSON.parse(text()) || {}
        var p = d.providers || {}
        host.configured = !!((p.anthropic && p.anthropic.apiKey) || (p.openai && p.openai.apiKey) || p.ollama)
      } catch (e) { host.configured = false }
    }
    onLoadFailed: host.configured = false
    onFileChanged: reload()
  }
  property var chats: ({})           // id -> { messages: [], answer: "", done: bool, error: "" }
  property string activeChat: ""
  property int serial: 0
  property string draft: ""

  readonly property var commands: [
    { id: "improve", title: "Improve Writing", icon: "󰲶", system: "You are a writing assistant. Rewrite the user's text to read better while keeping its meaning, tone, and language. Reply with the rewritten text only." },
    { id: "grammar", title: "Fix Spelling and Grammar", icon: "󰄬", system: "Fix spelling, grammar, and punctuation in the user's text. Keep the wording and language otherwise unchanged. Reply with the corrected text only." },
    { id: "summarize", title: "Summarize", icon: "󰈚", system: "Summarize the user's text in a few concise bullet points, in the same language as the text." },
    { id: "explain", title: "Explain This", icon: "󰘥", system: "Explain the user's text simply and clearly, in the same language as the text." },
    { id: "translate", title: "Translate to English", icon: "󰗊", system: "Translate the user's text to English. Reply with the translation only." },
    { id: "shorter", title: "Make Shorter", icon: "󰦨", system: "Shorten the user's text while keeping the key points. Reply with the shortened text only." },
    { id: "professional", title: "Change Tone to Professional", icon: "󰠮", system: "Rewrite the user's text in a professional tone. Reply with the rewritten text only." },
    { id: "casual", title: "Change Tone to Friendly", icon: "󰇵", system: "Rewrite the user's text in a friendly, casual tone. Reply with the rewritten text only." }
  ]

  // ---- root integration

  function quickRow(query) {
    var self = host
    return {
      id: "ai:quick",
      title: "Ask AI: " + query,
      subtitle: host.available ? "" : "Set up a provider in Launcher Preferences › AI",
      icon: "󰚩",
      accessories: [{ text: "AI" }],
      data: { query: query },
      actions: { sections: [{ actions: [
        { id: "ask", title: "Ask AI", icon: "󰚩", run: function(item, win) { self.panel = win; self.ask(item.data.query, null); return true } }
      ] }] }
    }
  }

  function rootEntries() {
    var out = []
    var self = host
    out.push({ id: "cmd:ai-ask", kind: "command", title: "Ask AI", subtitle: "", keywords: ["ai", "chat", "assistant", "claude", "gpt", "llm"], aliases: [], baseAliases: [], icon: "󰚩", accessoryText: "AI", enabled: true, favorite: false, primaryTitle: "Open",
      run: function(e, win) { self.open(win, { mode: "ask" }); return true } })
    for (var i = 0; i < host.commands.length; i++) {
      var c = host.commands[i]
      out.push({ id: "cmd:ai-" + c.id, kind: "command", title: c.title, subtitle: "AI command on the selection or clipboard", keywords: ["ai", "text", c.title], aliases: [], baseAliases: [], icon: c.icon, accessoryText: "AI", enabled: true, favorite: false, primaryTitle: "Run", aiCommand: c,
        run: function(e, win) { self.runCommand(win, e.aiCommand); return true } })
    }
    return out
  }

  // ---- ask flow

  function open(win, args) {
    host.panel = win
    host.draft = args && args.query ? String(args.query) : ""
    if (host.draft) { ask(host.draft, null); return }
    host.push(promptView(""))
  }

  function promptView(text) {
    var self = host
    return {
      id: "ai-prompt", type: "list", navigationTitle: "Ask AI", searchBarPlaceholder: "Ask anything…", filtering: false, searchText: text,
      items: text.trim() ? [{ id: "go", title: text.trim(), subtitle: host.available ? "Press Enter to ask" : "No AI provider configured", icon: "󰚩", data: { q: text.trim() },
        actions: { sections: [{ actions: [ { id: "ask", title: "Ask", icon: "󰚩", run: function(item) { self.ask(item.data.q, null); return true } } ] }] } }] : [],
      emptyView: { icon: "󰚩", title: host.available ? "Ask a question" : "No AI provider configured", description: host.available ? "" : "Add one in Launcher Preferences › AI Providers" }
    }
  }

  function searchText(viewId, text) {
    if (viewId === "ai-prompt") { host.draft = text; host.render(promptView(text)) }
    else if (viewId === "ai-followup") { host.draft = text; host.render(followupView(text)) }
  }

  function ask(question, chatId) {
    if (!host.available) { host.toast("failure", "No AI provider configured", "Add one in Preferences › AI Providers"); return }
    var id = chatId || ("chat" + (++host.serial))
    var chat = host.chats[id] || { messages: [], answer: "", done: false, error: "", question: question }
    chat.messages = chat.messages.concat([{ role: "user", content: question }])
    chat.answer = ""; chat.done = false; chat.error = ""; chat.question = question
    setChat(id, chat)
    host.activeChat = id
    if (host.activeViewId === "ai-prompt" || host.activeViewId === "ai-followup") host.pop()
    if (host.activeViewId !== "ai-" + id) host.push(answerView(id))
    else host.render(answerView(id))
    var self = host
    host.extHost.request("ai.chat", { id: id, messages: chat.messages, system: "You are a concise, helpful assistant inside a desktop launcher. Use Markdown." }).then(function(r) {
      var c = self.chats[id]; if (!c) return
      c.answer = r && r.text !== undefined ? String(r.text) : c.answer
      c.done = true
      c.messages = c.messages.concat([{ role: "assistant", content: c.answer }])
      self.setChat(id, c); self.render(self.answerView(id))
    }, function(e) {
      var c = self.chats[id]; if (!c) return
      c.done = true; c.error = String(e && e.message || e)
      self.setChat(id, c); self.render(self.answerView(id))
    })
  }

  function onChunk(id, text) {
    var c = host.chats[id]
    if (!c) return
    c.answer += text
    setChat(id, c)
    chunkTimer.restart()
  }
  Timer { id: chunkTimer; interval: 60; onTriggered: if (host.activeChat && host.activeViewId === "ai-" + host.activeChat) host.render(host.answerView(host.activeChat)) }

  function setChat(id, chat) {
    var next = ({})
    for (var k in host.chats) next[k] = host.chats[k]
    next[id] = chat
    host.chats = next
  }

  function answerView(id) {
    var c = host.chats[id] || { messages: [], answer: "", done: false, error: "", question: "" }
    var self = host
    var md = "> " + String(c.question).replace(/\n/g, "\n> ") + "\n\n" + (c.answer || (c.done ? "" : "_Thinking…_")) + (c.error ? "\n\n**Error:** " + c.error : "")
    return {
      id: "ai-" + id, type: "detail", navigationTitle: "Ask AI", isLoading: !c.done, markdown: md,
      actions: { sections: [
        { actions: [
          { id: "copy", title: "Copy Answer", icon: "󰆏", run: function() { self.copyText(c.answer); self.toast("success", "Copied"); return true } },
          { id: "paste", title: "Paste Answer", icon: "󰆒", run: function() { self.pasteText(c.answer); return false } },
          { id: "followup", title: "Ask a Follow-up…", icon: "󰚩", shortcut: { modifiers: ["ctrl"], key: "j", label: "⌃J" }, run: function() { self.push(self.followupView("")); return true } }
        ] },
        { actions: [
          { id: "retry", title: "Regenerate", icon: "󰑐", run: function() { var cc = self.chats[id]; if (cc) { cc.messages = cc.messages.slice(0, -1); self.setChat(id, cc); self.ask(cc.question, id) } return true } },
          { id: "stop", title: "Stop", icon: "󰓛", run: function() { self.extHost.notify("ai.abort", { id: id }); return true } }
        ] }
      ] }
    }
  }

  function followupView(text) {
    var self = host
    return {
      id: "ai-followup", type: "list", navigationTitle: "Follow-up", searchBarPlaceholder: "Ask a follow-up…", filtering: false, searchText: text,
      items: text.trim() ? [{ id: "go", title: text.trim(), icon: "󰚩", data: { q: text.trim() }, actions: { sections: [{ actions: [ { id: "ask", title: "Ask", run: function(item) { self.ask(item.data.q, self.activeChat); return true } } ] }] } }] : [],
      emptyView: { icon: "󰚩", title: "Continue the conversation" }
    }
  }

  // ---- AI commands over selected text / clipboard

  property var pendingCommand: null
  function runCommand(win, cmd) {
    host.panel = win
    host.pendingCommand = cmd
    selectionProbe.running = true
  }

  Process {
    id: selectionProbe
    command: ["bash", "-c", "t=$(wl-paste --primary --no-newline 2>/dev/null); [[ -n $t ]] || t=$(wl-paste --no-newline --type text 2>/dev/null); printf '%s' \"$t\""]
    stdout: StdioCollector {
      onStreamFinished: {
        var cmd = host.pendingCommand
        host.pendingCommand = null
        if (!cmd) return
        var input = String(text || "").trim()
        if (!input) { host.toast("failure", "Nothing selected", "Select text or copy it first"); return }
        if (!host.available) { host.toast("failure", "No AI provider configured"); return }
        var id = "chat" + (++host.serial)
        var chat = { messages: [{ role: "user", content: input }], answer: "", done: false, error: "", question: cmd.title + ":\n" + (input.length > 400 ? input.slice(0, 400) + "…" : input) }
        host.setChat(id, chat)
        host.activeChat = id
        host.push(host.answerView(id))
        host.extHost.request("ai.chat", { id: id, messages: chat.messages, system: cmd.system }).then(function(r) {
          var c = host.chats[id]; if (!c) return
          c.answer = r && r.text !== undefined ? String(r.text) : c.answer; c.done = true
          host.setChat(id, c); host.render(host.answerView(id))
        }, function(e) { var c = host.chats[id]; if (!c) return; c.done = true; c.error = String(e && e.message || e); host.setChat(id, c); host.render(host.answerView(id)) })
      }
    }
  }
}
