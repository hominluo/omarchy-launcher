// omarchy-launcher:// links — the one URL scheme the launcher handles.
//
// A link can arrive from any web page, so nothing here runs anything: the
// parser produces a payload tagged origin:"url", and the shell decides what
// that origin may do (open a view, prefill a query, or ask before launching
// an extension command). Only this scheme is accepted; raycast:// links are
// refused outright.

var SCHEME = "omarchy-launcher:"
var SEG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
var VIEW = /^[A-Za-z0-9][A-Za-z0-9:._\/-]{0,200}$/
var MAX_TEXT = 4096
var MAX_JSON = 16 * 1024
var MAX_STATE = 256

function text(value, max) {
  return typeof value === "string" ? value.slice(0, max || MAX_TEXT) : undefined
}

function jsonObject(value) {
  if (typeof value !== "string" || value.length > MAX_JSON) return undefined
  try {
    var parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined
  } catch (e) { return undefined }
}

// Extension arguments are plain strings (the manifest's argument types are
// text, password and dropdown); anything else is dropped here, and the shell
// matches what is left against the command's declared arguments.
function plainStrings(value) {
  var obj = jsonObject(value)
  if (!obj) return {}
  var out = {}
  for (var key in obj) {
    if (!SEG.test(key)) continue
    var v = obj[key]
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = String(v).slice(0, MAX_TEXT)
  }
  return out
}

function segment(value, what) {
  if (!SEG.test(value || "")) throw new Error("unsupported link: bad " + what)
  return value
}

// parseLauncherUrl(uri) -> { method: "open"|"oauth"|"toggle"|"confetti", payload? }
// Throws on anything it does not accept.
function parseLauncherUrl(uri) {
  var u
  try { u = new URL(String(uri)) } catch (e) { throw new Error("not a URL: " + String(uri).slice(0, 120)) }
  if (u.protocol !== SCHEME) throw new Error("unsupported scheme " + u.protocol + "//; only omarchy-launcher:// links are handled")
  var parts = (u.host + u.pathname).split("/").filter(Boolean).map(function (p) {
    try { return decodeURIComponent(p) } catch (e) { return p }
  })
  var q = u.searchParams
  var head = parts[0] || ""

  if (head === "extensions") {
    if (parts.length < 4) throw new Error("unsupported link: extensions/<owner>/<name>/<command>")
    var owner = segment(parts[1], "owner"), name = segment(parts[2], "extension"), command = segment(parts[3], "command")
    return { method: "open", payload: {
      extension: owner + "/" + name, command: command,
      arguments: plainStrings(q.get("arguments")), context: jsonObject(q.get("context")),
      fallbackText: text(q.get("fallbackText")), launchType: "userInitiated", origin: "url",
    } }
  }
  if (head === "oauth") {
    var state = text(q.get("state"), MAX_STATE)
    if (!state) throw new Error("unsupported link: oauth without state")
    return { method: "oauth", payload: { state: state, code: text(q.get("code")), error: text(q.get("error")) } }
  }
  if (head === "script-commands") {
    if (!parts[1]) throw new Error("unsupported link: script-commands/<query>")
    return { method: "open", payload: { query: parts[1].slice(0, MAX_TEXT), origin: "url" } }
  }
  if (head === "quicklink") {
    return { method: "open", payload: { command: "ql:" + segment(parts[1], "quicklink"), arguments: { query: (q.get("query") || "").slice(0, MAX_TEXT) }, origin: "url" } }
  }
  if (head === "open") {
    var view = q.get("view") || ""
    if (view && !VIEW.test(view)) throw new Error("unsupported link: bad view")
    return { method: "open", payload: {
      command: view ? (view.indexOf(":") >= 0 ? view : "cmd:" + view) : undefined,
      query: (q.get("query") || "").slice(0, MAX_TEXT), origin: "url",
    } }
  }
  if (head === "confetti") return { method: "confetti" }
  if (head === "toggle" || parts.length === 0) return { method: "toggle" }
  throw new Error("unsupported link: " + head)
}

if (typeof module !== "undefined") {
  module.exports = { parseLauncherUrl: parseLauncherUrl, SCHEME: SCHEME }
}
