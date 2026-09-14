// Inline root rows: things the typed text *is* rather than things it
// matches. URLs and bare domains become an "Open in Browser" row, colours
// become a swatch with conversions. Pure functions shared with node --test.

var TLDS = ["com", "org", "net", "io", "dev", "app", "co", "me", "ai", "sh", "xyz", "info", "edu", "gov", "us", "uk", "de", "fr", "jp", "cn", "tw", "kr", "ca", "au", "nl", "se", "ch", "it", "es", "ru", "br", "in", "eu", "tv", "gg", "so", "to", "ly", "cc", "page", "cloud", "design", "tech", "store", "site", "online", "blog", "news", "wiki", "run"]

// "https://example.com/x", "example.com", "localhost:3000", "192.168.1.1" -> normalized URL, else "".
function detectUrl(query) {
  var q = String(query || "").trim()
  if (!q || /\s/.test(q)) return ""
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) {
    return /^(https?|ftp|file):\/\/[^\s]+$/i.test(q) ? q : ""
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(q)) return q
  var hostPart = q.split(/[/?#]/)[0]
  var host = hostPart.split(":")[0]
  var port = hostPart.indexOf(":") >= 0 ? hostPart.split(":")[1] : ""
  if (port && !/^\d{1,5}$/.test(port)) return ""
  if (host === "localhost") return "http://" + q
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "http://" + q
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) return ""
  var tld = host.split(".").pop().toLowerCase()
  if (TLDS.indexOf(tld) < 0 && !(tld.length >= 2 && q.indexOf("/") > 0)) return ""
  return "https://" + q
}

function hostOf(url) {
  var m = String(url || "").match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i)
  return m ? m[1] : String(url || "")
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  var max = Math.max(r, g, b), min = Math.min(r, g, b)
  var h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    var d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100
  if (s === 0) { var v = Math.round(l * 255); return [v, v, v] }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s
  var p = 2 * l - q
  var f = function(t) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]
}

function hex2(n) { var s = clamp(Math.round(n), 0, 255).toString(16); return s.length < 2 ? "0" + s : s }

// "#abc", "#aabbcc", "#aabbccdd", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)", "hsl(200, 50%, 40%)"
// -> { hex, rgb: [r,g,b], alpha, formats: { hex, rgb, hsl, qml } } or null.
function parseColor(query) {
  var q = String(query || "").trim().toLowerCase()
  if (!q) return null
  var r, g, b, a = 1
  var m
  var hexMatch = null
  if (q.charAt(0) === "#") hexMatch = q.slice(1).match(/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  else {
    // Without "#" only 6/8 digits with at least one letter read as a colour
    // ("123456" stays a number for the calculator).
    hexMatch = q.match(/^([0-9a-f]{6}|[0-9a-f]{8})$/)
    if (hexMatch && !/[a-f]/.test(hexMatch[1])) hexMatch = null
  }
  if (hexMatch) {
    m = hexMatch
    var h = m[1]
    if (h.length === 3 || h.length === 4) {
      r = parseInt(h.charAt(0) + h.charAt(0), 16); g = parseInt(h.charAt(1) + h.charAt(1), 16); b = parseInt(h.charAt(2) + h.charAt(2), 16)
      if (h.length === 4) a = parseInt(h.charAt(3) + h.charAt(3), 16) / 255
    } else {
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16)
      if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255
    }
  } else if ((m = q.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(0?\.\d+|1(?:\.0+)?|\d{1,3}%))?\s*\)$/))) {
    r = Number(m[1]); g = Number(m[2]); b = Number(m[3])
    if (r > 255 || g > 255 || b > 255) return null
    if (m[4] !== undefined) a = m[4].indexOf("%") >= 0 ? Number(m[4].replace("%", "")) / 100 : Number(m[4])
  } else if ((m = q.match(/^hsla?\(\s*(-?\d{1,3}(?:\.\d+)?)(?:deg)?\s*[, ]\s*(\d{1,3})%\s*[, ]\s*(\d{1,3})%\s*(?:[,/]\s*(0?\.\d+|1(?:\.0+)?|\d{1,3}%))?\s*\)$/))) {
    var rgb = hslToRgb(Number(m[1]), clamp(Number(m[2]), 0, 100), clamp(Number(m[3]), 0, 100))
    r = rgb[0]; g = rgb[1]; b = rgb[2]
    if (m[4] !== undefined) a = m[4].indexOf("%") >= 0 ? Number(m[4].replace("%", "")) / 100 : Number(m[4])
  } else return null
  var hex = "#" + hex2(r) + hex2(g) + hex2(b)
  var hsl = rgbToHsl(r, g, b)
  var alpha = clamp(a, 0, 1)
  return {
    hex: hex,
    rgb: [r, g, b],
    alpha: alpha,
    formats: {
      hex: alpha < 1 ? hex + hex2(alpha * 255) : hex,
      rgb: alpha < 1 ? "rgba(" + r + ", " + g + ", " + b + ", " + (Math.round(alpha * 100) / 100) + ")" : "rgb(" + r + ", " + g + ", " + b + ")",
      hsl: alpha < 1 ? "hsla(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%, " + (Math.round(alpha * 100) / 100) + ")" : "hsl(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%)",
      qml: alpha < 1 ? "Qt.rgba(" + (Math.round(r / 255 * 1000) / 1000) + ", " + (Math.round(g / 255 * 1000) / 1000) + ", " + (Math.round(b / 255 * 1000) / 1000) + ", " + (Math.round(alpha * 100) / 100) + ")" : "\"" + hex + "\""
    }
  }
}

if (typeof module !== "undefined") {
  module.exports = { detectUrl: detectUrl, hostOf: hostOf, parseColor: parseColor, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb }
}
