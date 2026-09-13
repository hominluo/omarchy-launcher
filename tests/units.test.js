const test = require("node:test")
const assert = require("node:assert/strict")
const U = require("../lib/Units.js")

test("length, mass, data, time", () => {
  assert.equal(U.convert("10 km in mi").display, "6.2137119 mi")
  assert.equal(U.convert("1 lb to kg").display, "0.45359237 kg")
  assert.equal(U.convert("1.5 gb in mb").display, "1,500 mb")
  assert.equal(U.convert("1 gib to mib").display, "1,024 mib")
  assert.equal(U.convert("3 hours in minutes").display, "180 min")
  assert.equal(U.convert("5ft in cm").display, "152.4 cm")
})

test("temperature", () => {
  assert.equal(U.convert("72f to c").display, "22.222222 c")
  assert.equal(U.convert("100 c in f").display, "212 f")
  assert.equal(U.convert("0 k to c").display, "-273.15 c")
})

test("rejects mismatched dimensions and non-conversions", () => {
  assert.equal(U.convert("10 km in kg").ok, false)
  assert.equal(U.convert("firefox").ok, false)
  assert.equal(U.convert("10 in").ok, false)
})
