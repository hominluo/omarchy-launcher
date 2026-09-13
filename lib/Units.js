// Unit conversion for root search: "10 km in mi", "72f to c", "1.5 gb in mb",
// "3 hours in minutes". convert(text) -> { ok, value, display, unit, from } or
// { ok: false }. Currency lives in a separate provider (needs rates).

var UNITS = {}
function def(dim, factor, names) {
  for (var i = 0; i < names.length; i++) UNITS[names[i]] = { dim: dim, factor: factor, name: names[0] }
}
// length (base: metre)
def("length", 0.001, ["mm", "millimeter", "millimeters", "millimetre", "millimetres"])
def("length", 0.01, ["cm", "centimeter", "centimeters", "centimetre", "centimetres"])
def("length", 1, ["m", "meter", "meters", "metre", "metres"])
def("length", 1000, ["km", "kilometer", "kilometers", "kilometre", "kilometres"])
def("length", 0.0254, ["in", "inch", "inches", "\""])
def("length", 0.3048, ["ft", "foot", "feet", "'"])
def("length", 0.9144, ["yd", "yard", "yards"])
def("length", 1609.344, ["mi", "mile", "miles"])
def("length", 1852, ["nmi", "nautical mile", "nautical miles"])
// mass (base: kilogram)
def("mass", 0.000001, ["mg", "milligram", "milligrams"])
def("mass", 0.001, ["g", "gram", "grams"])
def("mass", 1, ["kg", "kilogram", "kilograms", "kilo", "kilos"])
def("mass", 1000, ["t", "tonne", "tonnes", "ton", "tons"])
def("mass", 0.028349523125, ["oz", "ounce", "ounces"])
def("mass", 0.45359237, ["lb", "lbs", "pound", "pounds"])
def("mass", 6.35029318, ["st", "stone", "stones"])
// time (base: second)
def("time", 0.001, ["ms", "millisecond", "milliseconds"])
def("time", 1, ["s", "sec", "secs", "second", "seconds"])
def("time", 60, ["min", "mins", "minute", "minutes"])
def("time", 3600, ["h", "hr", "hrs", "hour", "hours"])
def("time", 86400, ["d", "day", "days"])
def("time", 604800, ["wk", "week", "weeks"])
def("time", 2629800, ["mo", "month", "months"])
def("time", 31557600, ["yr", "year", "years"])
// data (base: byte)
def("data", 0.125, ["bit", "bits"])
def("data", 1, ["b", "byte", "bytes"])
def("data", 1000, ["kb", "kilobyte", "kilobytes"])
def("data", 1000000, ["mb", "megabyte", "megabytes"])
def("data", 1000000000, ["gb", "gigabyte", "gigabytes"])
def("data", 1000000000000, ["tb", "terabyte", "terabytes"])
def("data", 1024, ["kib", "kibibyte"])
def("data", 1048576, ["mib", "mebibyte"])
def("data", 1073741824, ["gib", "gibibyte"])
def("data", 1099511627776, ["tib", "tebibyte"])
def("data", 0.125 * 1000, ["kbit", "kilobit", "kilobits"])
def("data", 0.125 * 1000000, ["mbit", "megabit", "megabits"])
def("data", 0.125 * 1000000000, ["gbit", "gigabit", "gigabits"])
// area (base: square metre)
def("area", 1, ["m2", "sqm", "square meter", "square meters", "square metre", "square metres"])
def("area", 1000000, ["km2", "square kilometer", "square kilometers"])
def("area", 0.09290304, ["ft2", "sqft", "square foot", "square feet"])
def("area", 4046.8564224, ["acre", "acres", "ac"])
def("area", 10000, ["ha", "hectare", "hectares"])
// volume (base: litre)
def("volume", 0.001, ["ml", "milliliter", "milliliters", "millilitre", "millilitres"])
def("volume", 1, ["l", "liter", "liters", "litre", "litres"])
def("volume", 3.785411784, ["gal", "gallon", "gallons"])
def("volume", 0.946352946, ["qt", "quart", "quarts"])
def("volume", 0.473176473, ["pt", "pint", "pints"])
def("volume", 0.2365882365, ["cup", "cups"])
def("volume", 0.0295735295625, ["floz", "fl oz", "fluid ounce", "fluid ounces"])
def("volume", 0.01478676478125, ["tbsp", "tablespoon", "tablespoons"])
def("volume", 0.00492892159375, ["tsp", "teaspoon", "teaspoons"])
// speed (base: m/s)
def("speed", 1, ["m/s", "mps"])
def("speed", 1 / 3.6, ["km/h", "kmh", "kph"])
def("speed", 0.44704, ["mph"])
def("speed", 0.514444, ["kn", "knot", "knots"])
// temperature: handled specially
def("temp", 1, ["c", "celsius", "°c"])
def("temp", 1, ["f", "fahrenheit", "°f"])
def("temp", 1, ["k", "kelvin"])

var NAMES = Object.keys(UNITS).sort(function(a, b) { return b.length - a.length })

function lookup(raw) {
  var s = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ")
  if (UNITS[s]) return { key: s, unit: UNITS[s] }
  return null
}

function toCelsius(v, key) {
  if (key === "f" || key === "fahrenheit" || key === "°f") return (v - 32) * 5 / 9
  if (key === "k" || key === "kelvin") return v - 273.15
  return v
}
function fromCelsius(c, key) {
  if (key === "f" || key === "fahrenheit" || key === "°f") return c * 9 / 5 + 32
  if (key === "k" || key === "kelvin") return c + 273.15
  return c
}

function fmt(v) {
  if (!isFinite(v)) return String(v)
  var s = String(parseFloat(v.toPrecision(8)))
  if (s.indexOf("e") >= 0 && Math.abs(v) < 1e15 && Math.abs(v) >= 1e-6) s = v.toFixed(8).replace(/\.?0+$/, "")
  return s.replace(/^(-?\d+)(\.\d+)?$/, function(_, i, d) { return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d || "") })
}

// Parse "<number> <unit> (to|in|as|->) <unit>".
function convert(text) {
  var s = String(text || "").trim().toLowerCase()
  var m = s.match(/^(-?\d[\d_,]*\.?\d*|-?\.\d+)\s*([a-z°"'/ ]+?)\s+(?:to|in|as|into|->|=)\s+([a-z°"'/ ]+)$/)
  if (!m) return { ok: false }
  var value = parseFloat(m[1].replace(/[_,]/g, ""))
  if (isNaN(value)) return { ok: false }
  var from = lookup(m[2])
  var to = lookup(m[3])
  if (!from || !to || from.unit.dim !== to.unit.dim) return { ok: false }
  var result
  if (from.unit.dim === "temp") result = fromCelsius(toCelsius(value, from.key), to.key)
  else result = value * from.unit.factor / to.unit.factor
  var label = to.unit.name
  return { ok: true, value: result, display: fmt(result) + " " + label, unit: label, from: fmt(value) + " " + from.unit.name }
}

if (typeof module !== "undefined") {
  module.exports = { convert: convert, lookup: lookup, UNITS: UNITS }
}
