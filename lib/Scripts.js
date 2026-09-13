// Raycast Script Command headers:
//   #!/bin/bash
//   # @raycast.schemaVersion 1
//   # @raycast.title Show IP
//   # @raycast.mode inline|compact|silent|fullOutput
//   # @raycast.packageName Network
//   # @raycast.icon 🌐            (emoji, path, or URL)
//   # @raycast.argument1 {"type":"text","placeholder":"query","optional":true}
//   # @raycast.refreshTime 1m
//   # @raycast.needsConfirmation true
//   # @raycast.currentDirectoryPath ~/Projects
// Comment prefixes: #  //  --  *  ;

var PREFIX = /^\s*(?:#|\/\/|--|\*|;)\s*@raycast\.([A-Za-z0-9]+)\s+(.*)$/

function parseHeader(text) {
  var lines = String(text || "").split("\n")
  var meta = {}
  var seenAny = false
  for (var i = 0; i < Math.min(lines.length, 80); i++) {
    var line = lines[i].replace(/\r$/, "")
    var m = line.match(PREFIX)
    if (!m) {
      // Stop at the first non-comment, non-blank line after the header began.
      if (seenAny && line.trim() && !/^\s*(#|\/\/|--|\*|;|\/\*)/.test(line)) break
      continue
    }
    seenAny = true
    var key = m[1]
    var value = m[2].trim()
    if (/^argument[1-3]$/.test(key)) {
      try { meta[key] = JSON.parse(value) } catch (e) { meta[key] = { type: "text", placeholder: value } }
    } else meta[key] = value
  }
  if (String(meta.schemaVersion || "") !== "1" || !meta.title) return null
  var args = []
  for (var n = 1; n <= 3; n++) {
    var a = meta["argument" + n]
    if (!a) break
    args.push({ type: String(a.type || "text"), placeholder: String(a.placeholder || "argument " + n), optional: a.optional === true, secure: a.secure === true || a.type === "password", percentEncoded: a.percentEncoded === true, data: a.data || null })
  }
  var mode = String(meta.mode || "fullOutput")
  if (["inline", "compact", "silent", "fullOutput"].indexOf(mode) < 0) mode = "fullOutput"
  return {
    title: String(meta.title),
    mode: mode,
    packageName: String(meta.packageName || ""),
    icon: String(meta.icon || ""),
    iconDark: String(meta.iconDark || ""),
    description: String(meta.description || ""),
    author: String(meta.author || ""),
    refreshTime: parseDuration(meta.refreshTime),
    needsConfirmation: String(meta.needsConfirmation || "").toLowerCase() === "true",
    currentDirectoryPath: String(meta.currentDirectoryPath || ""),
    arguments: args
  }
}

// "10s" "1m" "12h" "1d" -> seconds (0 when absent); floor 10 s.
function parseDuration(raw) {
  var m = String(raw || "").trim().match(/^(\d+)\s*([smhd])$/)
  if (!m) return 0
  var n = Number(m[1])
  var mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]]
  return Math.max(10, n * mult)
}

function interpreterFor(path, shebang) {
  if (shebang && /^#!/.test(shebang)) return null      // executable with shebang: run directly
  var ext = (String(path).match(/\.([A-Za-z0-9]+)$/) || [])[1] || ""
  return { sh: "bash", bash: "bash", zsh: "zsh", py: "python3", js: "node", ts: "deno", rb: "ruby", pl: "perl", php: "php", lua: "lua", fish: "fish" }[ext.toLowerCase()] || null
}

function isMacOnly(path, header) {
  var p = String(path).toLowerCase()
  if (/\.(applescript|scpt|swift)$/.test(p)) return true
  return /osascript|\/usr\/bin\/swift|\/usr\/bin\/env\s+swift/.test(String(header || ""))
}

// ANSI SGR to a minimal HTML subset for a monospace Text (RichText).
function ansiToHtml(text) {
  var colors = ["#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5", "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"]
  var out = ""
  var open = false
  var s = String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  s = s.replace(/\x1b\[([0-9;]*)m/g, function(_, codes) {
    var parts = codes.split(";")
    var html = ""
    for (var i = 0; i < parts.length; i++) {
      var c = parseInt(parts[i] || "0", 10)
      if (c === 0) { if (open) { html += "</span>"; open = false } }
      else if (c === 1) { if (open) html += "</span>"; html += "<span style=\"font-weight:bold\">"; open = true }
      else if (c >= 30 && c <= 37) { if (open) html += "</span>"; html += "<span style=\"color:" + colors[c - 30] + "\">"; open = true }
      else if (c >= 90 && c <= 97) { if (open) html += "</span>"; html += "<span style=\"color:" + colors[c - 90 + 8] + "\">"; open = true }
    }
    return html
  })
  s = s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
  if (open) s += "</span>"
  return s.replace(/\n/g, "<br>")
}

if (typeof module !== "undefined") {
  module.exports = { parseHeader: parseHeader, parseDuration: parseDuration, interpreterFor: interpreterFor, isMacOnly: isMacOnly, ansiToHtml: ansiToHtml }
}
