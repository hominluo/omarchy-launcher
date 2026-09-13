import QtQuick
import Quickshell
import Quickshell.Io

// Emoji & Symbols: a grid over the shell's own emoji list plus a set of
// common symbols. Enter pastes, Ctrl+Enter copies; recents come first.
BuiltinHost {
  id: host

  readonly property string emojiPath: service ? service.omarchyPath + "/shell/plugins/emojis/emojis.json" : ""
  property var emojis: []
  property var recents: []      // emoji strings, most recent first
  readonly property string recentsPath: service ? service.stateDir + "/emoji-recents.json" : ""

  readonly property var symbols: [
    ["→", "arrow right"], ["←", "arrow left"], ["↑", "arrow up"], ["↓", "arrow down"], ["↔", "arrow left right"], ["⇒", "double arrow right"], ["⇐", "double arrow left"],
    ["•", "bullet dot"], ["·", "middle dot"], ["…", "ellipsis"], ["—", "em dash"], ["–", "en dash"], ["©", "copyright"], ["®", "registered"], ["™", "trademark"],
    ["°", "degree"], ["±", "plus minus"], ["×", "multiply times"], ["÷", "divide"], ["≠", "not equal"], ["≈", "approximately"], ["≤", "less equal"], ["≥", "greater equal"], ["∞", "infinity"], ["√", "square root"], ["∑", "sum sigma"], ["π", "pi"], ["Δ", "delta"], ["λ", "lambda"], ["Ω", "omega"], ["µ", "micro mu"],
    ["€", "euro"], ["£", "pound"], ["¥", "yen"], ["₩", "won"], ["₹", "rupee"], ["¢", "cent"], ["₿", "bitcoin"],
    ["✓", "check mark"], ["✗", "cross x"], ["★", "star filled"], ["☆", "star outline"], ["♥", "heart"], ["♦", "diamond"], ["♠", "spade"], ["♣", "club"],
    ["⌘", "command cmd"], ["⌥", "option alt"], ["⇧", "shift"], ["⌃", "control ctrl"], ["⎋", "escape"], ["⏎", "return enter"], ["⌫", "backspace delete"], ["⇥", "tab"],
    ["§", "section"], ["¶", "paragraph pilcrow"], ["†", "dagger"], ["‡", "double dagger"], ["«", "left guillemet quote"], ["»", "right guillemet quote"], ["“", "left double quote"], ["”", "right double quote"], ["‘", "left single quote"], ["’", "right single quote apostrophe"],
    ["½", "one half"], ["⅓", "one third"], ["¼", "one quarter"], ["¾", "three quarters"], ["¹", "superscript one"], ["²", "superscript two squared"], ["³", "superscript three cubed"],
    ["¯\\_(ツ)_/¯", "shrug kaomoji"], ["(╯°□°)╯︵ ┻━┻", "table flip kaomoji"], ["┬─┬ノ( º _ ºノ)", "table unflip kaomoji"], ["( ͡° ͜ʖ ͡°)", "lenny face kaomoji"], ["ʕ•ᴥ•ʔ", "bear kaomoji"]
  ]

  function buildView() {
    var self = host
    function item(ch, keywords, idPrefix) {
      return {
        id: idPrefix + ch,
        title: "",
        keywords: [keywords],
        content: { icon: ch },
        data: { ch: ch },
        actions: { sections: [{ actions: [
          { id: "paste", title: "Paste", icon: "󰆒", run: function(it) { self.use(it.data.ch); self.pasteText(it.data.ch); return false } },
          { id: "copy", title: "Copy to Clipboard", icon: "󰆏", run: function(it) { self.use(it.data.ch); self.copyText(it.data.ch); self.toast("success", "Copied " + it.data.ch); return true } }
        ] }] }
      }
    }
    var sections = []
    if (host.recents.length) sections.push({ id: "recent", title: "Recently Used", items: host.recents.map(function(ch) { return item(ch, keywordsFor(ch), "r:") }) })
    sections.push({ id: "emoji", title: "Emoji", items: host.emojis.map(function(e) { return item(e.e, e.k, "e:") }) })
    sections.push({ id: "symbols", title: "Symbols", items: host.symbols.map(function(s) { return item(s[0], s[1], "s:") }) })
    return {
      id: "emoji",
      type: "grid",
      columns: 9,
      inset: "small",
      navigationTitle: "Emoji & Symbols",
      searchBarPlaceholder: "Search emoji and symbols…",
      filtering: true,
      sections: sections,
      emptyView: { icon: "󰇲", title: "No emoji match" }
    }
  }

  function keywordsFor(ch) {
    for (var i = 0; i < host.emojis.length; i++) if (host.emojis[i].e === ch) return host.emojis[i].k
    for (var j = 0; j < host.symbols.length; j++) if (host.symbols[j][0] === ch) return host.symbols[j][1]
    return ""
  }

  function use(ch) {
    var next = [ch].concat(host.recents.filter(function(c) { return c !== ch })).slice(0, 18)
    host.recents = next
    recentsFile.setText(JSON.stringify(next) + "\n")
  }

  function open(win, args) {
    host.panel = win
    host.push(buildView())
  }

  FileView {
    path: host.emojiPath
    printErrors: false
    onLoaded: {
      try { var d = JSON.parse(text()); host.emojis = Array.isArray(d) ? d.filter(function(x) { return x && x.e }) : [] } catch (e) { host.emojis = [] }
    }
  }
  FileView {
    id: recentsFile
    path: host.recentsPath
    printErrors: false
    onLoaded: { try { var d = JSON.parse(text()); host.recents = Array.isArray(d) ? d : [] } catch (e) { host.recents = [] } }
    onLoadFailed: host.recents = []
  }
}
