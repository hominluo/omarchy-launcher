// Extension preference files in ~/.config/omarchy-launcher/prefs.
//
// The file name used to be "<owner>.<name>.json" read back with the first
// dot as the owner separator, which is not reversible: "acme.corp/my-ext"
// came back as "acme/corp.my-ext" (its settings were ignored) and
// "a.b/c" shared a file with "a/b.c". The name is now length-prefixed —
// "<len(owner)>-<owner>-<name>.json" — which no two ids can produce, and
// the id also travels inside the document so a file is always attributed
// to the extension that wrote it.

var ID_KEY = "__id"

function fileName(extId) {
  var id = String(extId === undefined || extId === null ? "" : extId)
  var slash = id.indexOf("/")
  if (slash <= 0) return id + ".json"
  var owner = id.slice(0, slash)
  return String(owner.length) + "-" + owner + "-" + id.slice(slash + 1) + ".json"
}

// The document as written: the values plus the id they belong to.
function pack(extId, values) {
  var out = {}
  for (var k in (values || {})) if (k !== ID_KEY) out[k] = values[k]
  out[ID_KEY] = String(extId)
  return out
}

// The stored values, without the id key.
function unpack(parsed) {
  var out = {}
  if (!parsed || typeof parsed !== "object") return out
  for (var k in parsed) if (k !== ID_KEY) out[k] = parsed[k]
  return out
}

// Which extension a file belongs to: the id it carries, or — for a file
// written before the id was stored — the old name mapping, first dot read
// as the owner separator.
function idFor(base, parsed) {
  if (parsed && typeof parsed === "object" && typeof parsed[ID_KEY] === "string" && parsed[ID_KEY]) return parsed[ID_KEY]
  var b = String(base === undefined || base === null ? "" : base)
  var dot = b.indexOf(".")
  return dot > 0 ? b.slice(0, dot) + "/" + b.slice(dot + 1) : b
}

if (typeof module !== "undefined") {
  module.exports = { ID_KEY: ID_KEY, fileName: fileName, pack: pack, unpack: unpack, idFor: idFor }
}
