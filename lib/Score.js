// Root-search ranking. Pure functions; runs under both the QML engine and
// `node --test`. Tiers follow the shell's own AppSearch.js so apps rank the
// same way here as in the stock Omarchy menu, then alias / frecency /
// favorite adjustments are layered on top.
//
// An Entry needs: title, subtitle, keywords[], aliases[], kind, enabled,
// favorite. prepare() caches the lowercase haystacks on the entry itself.

function norm(value) {
  return String(value || "").toLowerCase().trim()
}

function wordText(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:/\\-]+/g, " ")
    .toLowerCase()
}

function words(value) {
  var parts = wordText(value).split(/[^a-z0-9]+/)
  var out = []
  for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(parts[i])
  return out
}

function acronym(value) {
  var ws = words(value)
  var out = ""
  for (var i = 0; i < ws.length; i++) out += ws[i].charAt(0)
  return out
}

function joinList(list) {
  if (!list) return ""
  if (typeof list === "string") return list
  try { return list.join(" ") } catch (e) { return "" }
}

// Cache lowercase search fields on the entry. Safe to call repeatedly.
function prepare(entry) {
  if (!entry) return entry
  entry._name = norm(entry.title)
  entry._sub = norm(entry.subtitle)
  entry._kw = norm(joinList(entry.keywords))
  entry._hay = [entry._name, entry._sub, entry._kw].join(" ")
  entry._acr = acronym([entry.title, joinList(entry.keywords)].join(" "))
  var aliases = []
  var raw = entry.aliases || []
  for (var i = 0; i < raw.length; i++) {
    var a = norm(raw[i])
    if (a) aliases.push(a)
  }
  entry._aliases = aliases
  return entry
}

function termMatches(entry, term) {
  if (!term) return true
  if (entry._name.indexOf(term) >= 0) return true
  if (entry._hay.indexOf(term) >= 0) return true
  for (var i = 0; i < entry._aliases.length; i++)
    if (entry._aliases[i].indexOf(term) === 0) return true
  return term.length <= 5 && entry._acr.indexOf(term) >= 0
}

function allTermsMatch(entry, query) {
  var terms = query.split(/\s+/)
  for (var i = 0; i < terms.length; i++)
    if (terms[i] && !termMatches(entry, terms[i])) return false
  return true
}

// Match-quality score, independent of usage. -1 = no match.
function fuzzyScore(entry, query) {
  var q = norm(query)
  if (!q) return 0
  if (entry._name === undefined) prepare(entry)

  for (var i = 0; i < entry._aliases.length; i++) {
    if (entry._aliases[i] === q) return 20000
  }
  for (var j = 0; j < entry._aliases.length; j++) {
    if (entry._aliases[j].indexOf(q) === 0) return 15000 - entry._aliases[j].length
  }

  if (!allTermsMatch(entry, q)) return -1

  var name = entry._name
  var directName = name.indexOf(q)
  if (directName === 0) return 10000 - name.length
  // Word-boundary match inside the title ("code" in "Visual Studio Code").
  var boundary = name.indexOf(" " + q)
  if (boundary >= 0) return 9000 - boundary - name.length
  if (directName > 0) return 8000 - directName * 10 - name.length

  var kwIndex = entry._kw.indexOf(q)
  if (kwIndex >= 0) return 7000 - kwIndex
  var subIndex = entry._sub.indexOf(q)
  if (subIndex >= 0) return 6500 - subIndex
  var hayIndex = entry._hay.indexOf(q)
  if (hayIndex >= 0) return 6000 - hayIndex

  var acrIndex = entry._acr.indexOf(q)
  if (acrIndex === 0) return 5000 - entry._acr.length
  if (acrIndex > 0) return 4600 - acrIndex * 10 - entry._acr.length

  return 4000 - name.length
}

var KIND_PENALTY = {
  window: 200,
  "omarchy-menu": 400,
  file: 600
}

// Rank entries for a query. frecencyScores: map id -> number (see
// Frecency.js scores()). Returns [{ entry, score }] sorted best first.
function rank(entries, query, frecencyScores, limit) {
  var q = norm(query)
  var rows = []
  var fs = frecencyScores || {}
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i]
    if (!e || e.enabled === false) continue
    var s = fuzzyScore(e, q)
    if (s < 0) continue
    var usage = fs[e.id] || 0
    s += Math.min(900, usage * 10)   // reorders within a tier, never across one
    if (e.favorite) s += 300
    s -= KIND_PENALTY[e.kind] || 0
    rows.push({ entry: e, score: s })
  }
  rows.sort(function(a, b) {
    if (a.score !== b.score) return b.score - a.score
    var an = a.entry._name, bn = b.entry._name
    if (an < bn) return -1
    if (an > bn) return 1
    return String(a.entry.id).localeCompare(String(b.entry.id))
  })
  if (limit && rows.length > limit) rows = rows.slice(0, limit)
  return rows
}

if (typeof module !== "undefined") {
  module.exports = { norm: norm, words: words, acronym: acronym, prepare: prepare, fuzzyScore: fuzzyScore, rank: rank }
}
