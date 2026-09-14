// Firefox-style frecency: each recorded use contributes a weight that decays
// in steps with age. Data shape (persisted as JSON):
//   { version: 1, entries: { "<entryId>": { count: N, last: [epochSec, ...] } } }

var BUCKETS = [
  [4 * 3600, 100],
  [86400, 70],
  [3 * 86400, 50],
  [7 * 86400, 30],
  [30 * 86400, 10]
]
var KEEP = 10
var PRUNE_AFTER = 90 * 86400

function empty() {
  return { version: 1, entries: {} }
}

function normalizeData(data) {
  if (!data || typeof data !== "object") return empty()
  if (!data.entries || typeof data.entries !== "object") data.entries = {}
  data.version = 1
  return data
}

function weight(age) {
  for (var i = 0; i < BUCKETS.length; i++) if (age <= BUCKETS[i][0]) return BUCKETS[i][1]
  return 0
}

function score(data, id, now) {
  var e = data && data.entries ? data.entries[id] : null
  if (!e || !e.last) return 0
  var total = 0
  for (var i = 0; i < e.last.length; i++) total += weight(now - e.last[i])
  return total
}

function scores(data, now) {
  var out = {}
  if (!data || !data.entries) return out
  for (var id in data.entries) {
    var s = score(data, id, now)
    if (s > 0) out[id] = s
  }
  return out
}

function record(data, id, now) {
  data = normalizeData(data)
  var e = data.entries[id] || { count: 0, last: [] }
  e.count = (e.count || 0) + 1
  e.last = (e.last || []).concat([now])
  if (e.last.length > KEEP) e.last = e.last.slice(e.last.length - KEEP)
  data.entries[id] = e
  return data
}

function prune(data, now) {
  data = normalizeData(data)
  for (var id in data.entries) {
    var e = data.entries[id]
    var kept = []
    for (var i = 0; i < (e.last || []).length; i++) if (now - e.last[i] <= PRUNE_AFTER) kept.push(e.last[i])
    if (kept.length === 0) delete data.entries[id]
    else e.last = kept
  }
  return data
}

// Ids sorted by score, best first.
function top(data, now, limit) {
  var s = scores(data, now)
  var ids = []
  for (var id in s) ids.push(id)
  ids.sort(function(a, b) { return s[b] - s[a] })
  return limit ? ids.slice(0, limit) : ids
}

// Drop every recorded use of one id ("reset ranking"). Returns the
// normalized data; a no-op when the id was never recorded.
function forget(data, id) {
  data = normalizeData(data)
  if (Object.prototype.hasOwnProperty.call(data.entries, id)) delete data.entries[id]
  return data
}

if (typeof module !== "undefined") {
  module.exports = { empty: empty, score: score, scores: scores, record: record, prune: prune, top: top, forget: forget }
}
