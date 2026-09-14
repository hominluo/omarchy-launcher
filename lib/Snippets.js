// Snippet placeholder expansion (Raycast's dynamic placeholders):
//   {clipboard}            last clipboard text
//   {selection}            primary selection (the text highlighted in the focused app)
//   {date} {time} {datetime} {day}   with optional format="..." (yyyy MM dd HH mm ss ...)
//   {uuid}
//   {argument name="x" default="y"}  values from the args map
//   {cursor}               final cursor position (returned as index)
// Modifiers inside a placeholder: uppercase lowercase trim percent-encode json-stringify.
// expand(text, ctx) -> { text, cursor }  where cursor is -1 when unused.

var CURSOR_MARK = String.fromCharCode(1) + "CURSOR" + String.fromCharCode(1)

function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = "0" + s; return s }

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function formatDate(d, fmt) {
  var map = {
    "yyyy": String(d.getFullYear()), "yy": pad(d.getFullYear() % 100),
    "MMMM": MONTHS[d.getMonth()], "MMM": MONTHS[d.getMonth()].slice(0, 3), "MM": pad(d.getMonth() + 1), "M": String(d.getMonth() + 1),
    "dddd": DAYS[d.getDay()], "ddd": DAYS[d.getDay()].slice(0, 3), "dd": pad(d.getDate()), "d": String(d.getDate()),
    "HH": pad(d.getHours()), "H": String(d.getHours()), "hh": pad(((d.getHours() + 11) % 12) + 1), "h": String(((d.getHours() + 11) % 12) + 1),
    "mm": pad(d.getMinutes()), "m": String(d.getMinutes()), "ss": pad(d.getSeconds()), "s": String(d.getSeconds()),
    "AP": d.getHours() < 12 ? "AM" : "PM", "ap": d.getHours() < 12 ? "am" : "pm"
  }
  return String(fmt).replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|AP|ap/g, function(t) { return map[t] })
}

function uuid() {
  var s = ""
  for (var i = 0; i < 32; i++) {
    var r = Math.floor(Math.random() * 16)
    if (i === 12) r = 4
    if (i === 16) r = (r & 3) | 8
    s += r.toString(16)
    if (i === 7 || i === 11 || i === 15 || i === 19) s += "-"
  }
  return s
}

function parseAttrs(raw) {
  var attrs = {}
  var re = /([a-zA-Z_][\w-]*)\s*=\s*"([^"]*)"|([a-zA-Z_][\w-]*)(?:\s*=\s*([^\s"]+))?/g
  var m
  while ((m = re.exec(raw))) {
    if (m[1] !== undefined) attrs[m[1]] = m[2]
    else if (m[3] !== undefined) attrs[m[3]] = m[4] !== undefined ? m[4] : ""
  }
  return attrs
}

function applyModifiers(value, attrs) {
  var v = String(value)
  if (attrs.uppercase !== undefined) v = v.toUpperCase()
  if (attrs.lowercase !== undefined) v = v.toLowerCase()
  if (attrs.trim !== undefined) v = v.trim()
  if (attrs["percent-encode"] !== undefined) v = encodeURIComponent(v)
  if (attrs["json-stringify"] !== undefined) v = JSON.stringify(v)
  return v
}

// Argument names the caller must supply, in order of first appearance.
function requiredArguments(text) {
  return argumentSpecs(text).map(function(a) { return a.name })
}

// [{ name, default }] for every {argument …} placeholder, first appearance order.
function argumentSpecs(text) {
  var out = []
  var seen = {}
  var re = /\{argument([^}]*)\}/g
  var m
  while ((m = re.exec(String(text || "")))) {
    var attrs = parseAttrs(m[1])
    var name = attrs.name || "argument"
    if (seen[name]) continue
    seen[name] = true
    out.push({ name: name, "default": attrs["default"] !== undefined ? String(attrs["default"]) : "" })
  }
  return out
}

function usesSelection(text) { return /\{selection\b/i.test(String(text || "")) }

function expand(text, ctx) {
  ctx = ctx || {}
  var now = ctx.now ? new Date(ctx.now) : new Date()
  var cursor = -1
  var out = String(text || "").replace(/\{([a-zA-Z_-]+)([^}]*)\}/g, function(whole, name, rawAttrs) {
    var attrs = parseAttrs(rawAttrs)
    var key = name.toLowerCase()
    var value
    switch (key) {
      case "clipboard": value = ctx.clipboard || ""; break
      case "selection": value = ctx.selection || ""; break
      case "date": value = formatDate(now, attrs.format || "yyyy-MM-dd"); break
      case "time": value = formatDate(now, attrs.format || "HH:mm"); break
      case "datetime": value = formatDate(now, attrs.format || "yyyy-MM-dd HH:mm"); break
      case "day": value = formatDate(now, "dddd"); break
      case "uuid": value = uuid(); break
      case "argument":
        var argName = attrs.name || "argument"
        value = ctx.args && ctx.args[argName] !== undefined ? ctx.args[argName] : (attrs["default"] || "")
        break
      case "cursor": return CURSOR_MARK
      default: return whole
    }
    return applyModifiers(value, attrs)
  })
  var idx = out.indexOf(CURSOR_MARK)
  if (idx >= 0) {
    cursor = idx
    out = out.slice(0, idx) + out.slice(idx + CURSOR_MARK.length)
  }
  return { text: out, cursor: cursor }
}

if (typeof module !== "undefined") {
  module.exports = { expand: expand, formatDate: formatDate, requiredArguments: requiredArguments, argumentSpecs: argumentSpecs, usesSelection: usesSelection, uuid: uuid }
}
