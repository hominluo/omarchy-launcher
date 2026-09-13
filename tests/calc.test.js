const test = require("node:test")
const assert = require("node:assert/strict")
const Calc = require("../lib/Calc.js")

const ev = (s, o) => Calc.evaluate(s, o)

test("arithmetic and precedence", () => {
  assert.equal(ev("2+3*4").value, 14)
  assert.equal(ev("(2+3)*4").value, 20)
  assert.equal(ev("2^10").value, 1024)
  assert.equal(ev("2**3^2").value, 512)
  assert.equal(ev("-3^2").value, -9)
  assert.equal(ev("10/4").display, "2.5")
  assert.equal(ev("1/3").display, "0.3333333333")
  assert.equal(ev("5!").value, 120)
  assert.equal(ev("7 mod 3").value, 1)
  assert.equal(ev("7 % 3").value, 1)
})

test("percent forms", () => {
  assert.equal(ev("15% of 80").value, 12)
  assert.equal(ev("80 + 15%").value, 92)
  assert.equal(ev("80 - 25%").value, 60)
  assert.equal(ev("50%").value, 0.5)
})

test("functions, constants, degrees", () => {
  assert.equal(ev("sqrt(16)").value, 4)
  assert.equal(ev("sqrt 16").value, 4)
  assert.equal(Math.round(ev("sin(30)").value * 1000) / 1000, 0.5)
  assert.equal(Math.round(ev("sin(pi/2)", { angle: "rad" }).value), 1)
  assert.equal(ev("2pi").display, "6.283185307")
  assert.equal(ev("max(1, 5, 3)").value, 5)
  assert.equal(ev("round(3.14159, 2)").value, 3.14)
  assert.equal(ev("log(100)").value, 2)
  assert.equal(ev("avg(2,4,6)").value, 4)
})

test("literals and bases", () => {
  assert.equal(ev("0xff + 1").value, 256)
  assert.equal(ev("0b1010").value, 10)
  assert.equal(ev("1_000 * 2").value, 2000)
  assert.equal(ev("255 to hex").display, "0xff")
  assert.equal(ev("10 to bin").display, "0b1010")
  assert.equal(ev("0xff to dec").display, "255")
  assert.equal(ev("6 and 3").value, 2)
  assert.equal(ev("1 << 4").value, 16)
  assert.equal(ev("1e3 + 1").value, 1001)
  assert.equal(ev("1234567 * 3").grouped, "3,703,701")
})

test("implicit multiplication", () => {
  assert.equal(ev("2(3+4)").value, 14)
  assert.equal(ev("3 x 4").value, 12)
})

test("rejects ordinary search text", () => {
  assert.equal(ev("firefox").ok, false)
  assert.equal(ev("42").ok, false)
  assert.equal(ev("2 +").ok, false)
  assert.equal(ev("chrome 2").ok, false)
  assert.equal(ev("1password").ok, false)
  assert.equal(ev("").ok, false)
})
