const test = require("node:test")
const assert = require("node:assert/strict")
const S = require("../lib/Snippets.js")

const now = new Date(2026, 8, 12, 14, 5, 9).getTime()

test("date and time placeholders with formats", () => {
  assert.equal(S.expand("{date}", { now }).text, "2026-09-12")
  assert.equal(S.expand("{time}", { now }).text, "14:05")
  assert.equal(S.expand("{date format=\"dd/MM/yyyy\"}", { now }).text, "12/09/2026")
  assert.equal(S.expand("{day}", { now }).text, "Saturday")
  assert.equal(S.expand("{time format=\"h:mm ap\"}", { now }).text, "2:05 pm")
})

test("clipboard, arguments, modifiers, cursor", () => {
  const r = S.expand("Hi {argument name=\"who\" default=\"there\"}, {clipboard uppercase}{cursor}!", { clipboard: "abc", args: {} })
  assert.equal(r.text, "Hi there, ABC!")
  assert.equal(r.cursor, 13)
  assert.equal(S.expand("{argument name=\"who\"}", { args: { who: "Ann" } }).text, "Ann")
  assert.deepEqual(S.requiredArguments("{argument name=\"a\"} {argument name=\"b\"} {argument name=\"a\"}"), ["a", "b"])
})

test("unknown placeholders are left alone; uuid has the v4 shape", () => {
  assert.equal(S.expand("{unknown} {{nope}}").text, "{unknown} {{nope}}")
  assert.match(S.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
