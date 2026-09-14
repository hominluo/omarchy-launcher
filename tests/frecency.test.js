const test = require("node:test")
const assert = require("node:assert/strict")
const F = require("../lib/Frecency.js")

test("record and score decay by age", () => {
  const now = 1_000_000
  let d = F.empty()
  d = F.record(d, "x", now - 60)
  assert.equal(F.score(d, "x", now), 100)
  d = F.record(d, "x", now - 2 * 86400)
  assert.equal(F.score(d, "x", now), 150)
  d = F.record(d, "y", now - 100 * 86400)
  assert.equal(F.score(d, "y", now), 0)
})

test("keeps at most ten timestamps and prunes old ones", () => {
  const now = 1_000_000
  let d = F.empty()
  for (let i = 0; i < 15; i++) d = F.record(d, "x", now - i)
  assert.equal(d.entries.x.last.length, 10)
  assert.equal(d.entries.x.count, 15)
  d = F.record(d, "old", now - 200 * 86400)
  d = F.prune(d, now)
  assert.equal(d.entries.old, undefined)
})

test("top orders by score", () => {
  const now = 1_000_000
  let d = F.empty()
  d = F.record(d, "a", now - 10)
  d = F.record(d, "b", now - 10)
  d = F.record(d, "b", now - 20)
  assert.deepEqual(F.top(d, now, 5), ["b", "a"])
})

test("tolerates malformed data", () => {
  const d = F.record({ garbage: true }, "x", 5)
  assert.equal(d.entries.x.count, 1)
  assert.equal(F.score(null, "x", 5), 0)
})

test("forget drops one id and leaves the rest alone", () => {
  const now = 1_000_000
  let d = F.empty()
  d = F.record(d, "a", now - 10)
  d = F.record(d, "b", now - 10)
  d = F.record(d, "b", now - 20)
  d = F.forget(d, "b")
  assert.equal(d.entries.b, undefined)
  assert.equal(F.score(d, "b", now), 0)
  assert.equal(F.score(d, "a", now), 100)
  assert.deepEqual(F.top(d, now, 5), ["a"])
  assert.deepEqual(Object.keys(d.entries), ["a"])
})

test("forget is a no-op for unknown ids and normalizes malformed data", () => {
  const now = 1_000_000
  let d = F.record(F.empty(), "a", now - 10)
  d = F.forget(d, "never-recorded")
  assert.equal(F.score(d, "a", now), 100)

  const fixed = F.forget({ garbage: true }, "x")
  assert.deepEqual(fixed, { garbage: true, version: 1, entries: {} })
  assert.deepEqual(F.forget(null, "x"), F.empty())
  assert.deepEqual(F.forget(undefined, "x"), F.empty())
})

test("forget then record starts the id fresh", () => {
  const now = 1_000_000
  let d = F.empty()
  for (let i = 0; i < 5; i++) d = F.record(d, "x", now - i)
  assert.equal(d.entries.x.count, 5)
  d = F.forget(d, "x")
  d = F.record(d, "x", now)
  assert.equal(d.entries.x.count, 1)
  assert.deepEqual(d.entries.x.last, [now])
})
