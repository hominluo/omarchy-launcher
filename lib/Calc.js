// Inline calculator for root search. A small recursive-descent evaluator:
//   arithmetic + - * / ^ %, parentheses, factorial, unary minus
//   percent forms: "15% of 80", "80 + 15%", "80 - 15%", "50%"
//   functions: sqrt cbrt abs round floor ceil ln log log2 log10 exp
//              sin cos tan asin acos atan sinh cosh tanh min max pow
//              avg sum hypot fact deg rad
//   constants: pi e tau ans
//   literals: 1_000, 1e3, 0xff, 0b1010, 0o17
//   suffix: "... to hex|bin|oct|dec"
//   bitwise: and or xor << >>
// evaluate(text, opts) -> { ok, value, display, base } or { ok: false }.
// Never throws on user input; a parse failure just means "not a calculation".

var FUNCTIONS = {
  sqrt: function(a) { return Math.sqrt(a[0]) },
  cbrt: function(a) { return Math.cbrt(a[0]) },
  abs: function(a) { return Math.abs(a[0]) },
  round: function(a) { return a.length > 1 ? roundTo(a[0], a[1]) : Math.round(a[0]) },
  floor: function(a) { return Math.floor(a[0]) },
  ceil: function(a) { return Math.ceil(a[0]) },
  ln: function(a) { return Math.log(a[0]) },
  log: function(a) { return a.length > 1 ? Math.log(a[0]) / Math.log(a[1]) : Math.log10(a[0]) },
  log2: function(a) { return Math.log2(a[0]) },
  log10: function(a) { return Math.log10(a[0]) },
  exp: function(a) { return Math.exp(a[0]) },
  min: function(a) { return Math.min.apply(null, a) },
  max: function(a) { return Math.max.apply(null, a) },
  pow: function(a) { return Math.pow(a[0], a[1]) },
  hypot: function(a) { return Math.hypot.apply(null, a) },
  sum: function(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s },
  avg: function(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN },
  fact: function(a) { return factorial(a[0]) },
  deg: function(a) { return a[0] * 180 / Math.PI },
  rad: function(a) { return a[0] * Math.PI / 180 }
}
var TRIG = { sin: Math.sin, cos: Math.cos, tan: Math.tan }
var ATRIG = { asin: Math.asin, acos: Math.acos, atan: Math.atan }
var HYP = { sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh }
var CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, inf: Infinity }
var WORD_OPS = { mod: "%", and: "&", or: "|", xor: "xor", times: "*", plus: "+", minus: "-", "x": "*", "÷": "/", "×": "*", "−": "-" }

function roundTo(v, places) {
  var m = Math.pow(10, Math.max(0, Math.min(15, Math.round(places))))
  return Math.round(v * m) / m
}

function factorial(n) {
  if (n < 0 || n !== Math.floor(n) || n > 170) return NaN
  var r = 1
  for (var i = 2; i <= n; i++) r *= i
  return r
}

function tokenize(text) {
  var out = []
  var s = String(text)
  var i = 0
  while (i < s.length) {
    var ch = s.charAt(i)
    if (/\s/.test(ch)) { i++; continue }
    var rest = s.slice(i)
    var m
    if ((m = rest.match(/^0[xX][0-9a-fA-F_]+/))) { out.push({ t: "num", v: parseInt(m[0].slice(2).replace(/_/g, ""), 16) }); i += m[0].length; continue }
    if ((m = rest.match(/^0[bB][01_]+/))) { out.push({ t: "num", v: parseInt(m[0].slice(2).replace(/_/g, ""), 2) }); i += m[0].length; continue }
    if ((m = rest.match(/^0[oO][0-7_]+/))) { out.push({ t: "num", v: parseInt(m[0].slice(2).replace(/_/g, ""), 8) }); i += m[0].length; continue }
    if ((m = rest.match(/^(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?/))) {
      out.push({ t: "num", v: parseFloat(m[0].replace(/_/g, "")) }); i += m[0].length; continue
    }
    if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))) {
      var word = m[0].toLowerCase()
      if (WORD_OPS[word] !== undefined) out.push({ t: "op", v: WORD_OPS[word] })
      else out.push({ t: "id", v: word })
      i += m[0].length; continue
    }
    if ((m = rest.match(/^(<<|>>|\*\*)/))) { out.push({ t: "op", v: m[0] === "**" ? "^" : m[0] }); i += m[0].length; continue }
    if ("+-*/^%(),!&|".indexOf(ch) >= 0) { out.push({ t: "op", v: ch }); i++; continue }
    if (WORD_OPS[ch] !== undefined) { out.push({ t: "op", v: WORD_OPS[ch] }); i++; continue }
    return null
  }
  return out
}

function Parser(tokens, opts) {
  this.tokens = tokens
  this.pos = 0
  this.opts = opts || {}
}
Parser.prototype.peek = function() { return this.tokens[this.pos] || null }
Parser.prototype.next = function() { return this.tokens[this.pos++] }
Parser.prototype.isOp = function(v) { var t = this.peek(); return t && t.t === "op" && t.v === v }
Parser.prototype.fail = function() { throw new Error("parse") }

// expr := bitor
Parser.prototype.parseExpr = function() { return this.parseBitOr() }
Parser.prototype.parseBitOr = function() {
  var v = this.parseBitXor()
  while (this.isOp("|")) { this.next(); v = (v | 0) | (this.parseBitXor() | 0) }
  return v
}
Parser.prototype.parseBitXor = function() {
  var v = this.parseBitAnd()
  while (this.isOp("xor")) { this.next(); v = (v | 0) ^ (this.parseBitAnd() | 0) }
  return v
}
Parser.prototype.parseBitAnd = function() {
  var v = this.parseShift()
  while (this.isOp("&")) { this.next(); v = (v | 0) & (this.parseShift() | 0) }
  return v
}
Parser.prototype.parseShift = function() {
  var v = this.parseAdditive()
  while (this.isOp("<<") || this.isOp(">>")) {
    var op = this.next().v
    var r = this.parseAdditive()
    v = op === "<<" ? v * Math.pow(2, r) : Math.floor(v / Math.pow(2, r))
  }
  return v
}
Parser.prototype.parseAdditive = function() {
  var v = this.parseTerm()
  while (this.isOp("+") || this.isOp("-")) {
    var op = this.next().v
    var r = this.parseTerm()
    if (r && typeof r === "object" && r.percent !== undefined) r = v * r.percent / 100   // 80 + 15%
    v = op === "+" ? v + r : v - r
  }
  return v
}
Parser.prototype.parseTerm = function() {
  var v = this.parseUnary()
  while (true) {
    if (this.isOp("*") || this.isOp("/")) {
      var op = this.next().v
      var r = this.parseUnary()
      v = op === "*" ? v * r : v / r
    } else if (this.isOp("%") && this.startsOperand(this.tokens[this.pos + 1])) {
      this.next()
      var d = this.parseUnary()
      v = v - d * Math.floor(v / d)
    } else if (this.peek() && this.peek().t === "id" && this.peek().v === "of") {
      // "15% of 80" arrives here as v = {percent:15}
      this.next()
      var base = this.parseUnary()
      v = (v && v.percent !== undefined ? v.percent / 100 : v) * base
    } else if (this.peek() && (this.peek().t === "num" || (this.peek().t === "op" && this.peek().v === "("))) {
      // implicit multiplication: 2(3+4), 2pi
      v = v * this.parseUnary()
    } else if (this.peek() && this.peek().t === "id" && CONSTANTS[this.peek().v] !== undefined) {
      v = v * this.parseUnary()
    } else break
  }
  return v
}
Parser.prototype.startsOperand = function(t) {
  if (!t) return false
  if (t.t === "id") return t.v !== "of"
  return t.t === "num" || (t.t === "op" && t.v === "(")
}
Parser.prototype.parseUnary = function() {
  if (this.isOp("-")) { this.next(); return -this.parseUnary() }
  if (this.isOp("+")) { this.next(); return this.parseUnary() }
  return this.parsePower()
}
Parser.prototype.parsePower = function() {
  var base = this.parsePostfix()
  if (this.isOp("^")) { this.next(); return Math.pow(base, this.parseUnary()) }
  return base
}
Parser.prototype.parsePostfix = function() {
  var v = this.parsePrimary()
  while (true) {
    if (this.isOp("!")) { this.next(); v = factorial(v); continue }
    if (this.isOp("%") && !this.startsOperand(this.tokens[this.pos + 1])) {
      this.next()
      return { percent: v }
    }
    break
  }
  return v
}
Parser.prototype.parsePrimary = function() {
  var t = this.next()
  if (!t) this.fail()
  if (t.t === "num") return t.v
  if (t.t === "op" && t.v === "(") {
    var v = this.parseExpr()
    if (!this.isOp(")")) this.fail()
    this.next()
    return v
  }
  if (t.t === "id") {
    var name = t.v
    if (name === "ans") return this.opts.ans !== undefined ? this.opts.ans : 0
    if (CONSTANTS[name] !== undefined) return CONSTANTS[name]
    var fn = FUNCTIONS[name] || TRIG[name] || ATRIG[name] || HYP[name]
    if (!fn) this.fail()
    var args = []
    if (this.isOp("(")) {
      this.next()
      if (!this.isOp(")")) {
        args.push(this.parseExpr())
        while (this.isOp(",")) { this.next(); args.push(this.parseExpr()) }
      }
      if (!this.isOp(")")) this.fail()
      this.next()
    } else {
      args.push(this.parseUnary())   // sqrt 16, sin 30
    }
    for (var i = 0; i < args.length; i++) if (args[i] && typeof args[i] === "object") args[i] = args[i].percent / 100
    var degrees = this.opts.angle !== "rad"
    if (TRIG[name]) return TRIG[name](degrees ? args[0] * Math.PI / 180 : args[0])
    if (ATRIG[name]) { var r = ATRIG[name](args[0]); return degrees ? r * 180 / Math.PI : r }
    if (HYP[name]) return HYP[name](args[0])
    return fn(args)
  }
  this.fail()
}

function formatNumber(v, opts) {
  if (!isFinite(v)) return v > 0 ? "∞" : (v < 0 ? "-∞" : "NaN")
  var precision = (opts && opts.precision) || 10
  var abs = Math.abs(v)
  var s
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) s = v.toExponential(6).replace(/\.?0+e/, "e")
  else {
    s = String(parseFloat(v.toPrecision(precision)))
    if (s.indexOf("e") >= 0) s = parseFloat(s).toFixed(10).replace(/\.?0+$/, "")
  }
  return s
}

function groupThousands(s) {
  var m = s.match(/^(-?)(\d+)(\.\d+)?$/)
  if (!m) return s
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (m[3] || "")
}

function toBase(v, base) {
  if (!isFinite(v) || v !== Math.floor(v)) return null
  var neg = v < 0
  var s = Math.abs(v).toString(base)
  var prefix = base === 16 ? "0x" : base === 2 ? "0b" : base === 8 ? "0o" : ""
  return (neg ? "-" : "") + prefix + s
}

// Cheap pre-check so ordinary search text never reaches the parser.
function looksLikeMath(text) {
  var s = String(text || "").trim()
  if (!s) return false
  if (!/\d/.test(s) && !/\b(pi|e|tau|ans)\b/i.test(s)) return false
  if (/^[\d.,]+$/.test(s)) return false            // a bare number is not a calculation
  if (/^[\d\s.,_+\-*/^%()!<>&|xX×÷−]+$/.test(s)) return true
  return /^(?:[\d.\s_+\-*/^%()!,<>&|×÷−]|0x[0-9a-f]+|0b[01]+|0o[0-7]+|sqrt|cbrt|abs|round|floor|ceil|ln|log2|log10|log|exp|sinh|cosh|tanh|asin|acos|atan|sin|cos|tan|min|max|pow|avg|sum|hypot|fact|deg|rad|pi|e|tau|ans|mod|and|or|xor|of|to|hex|bin|oct|dec|in|as|times|plus|minus|x)+$/i.test(s)
}

function evaluate(text, opts) {
  var s = String(text || "").trim()
  if (!s) return { ok: false }
  var base = 10
  var m = s.match(/\s+(to|in|as)\s+(hex|bin|binary|oct|octal|dec|decimal)$/i)
  if (m) {
    var which = m[2].toLowerCase()
    base = which.indexOf("hex") === 0 ? 16 : which.indexOf("bin") === 0 ? 2 : which.indexOf("oct") === 0 ? 8 : 10
    s = s.slice(0, m.index)
  }
  if (!looksLikeMath(s) && !m) return { ok: false }
  var tokens = tokenize(s)
  if (!tokens || tokens.length === 0) return { ok: false }
  try {
    var p = new Parser(tokens, opts)
    var v = p.parseExpr()
    if (p.pos !== tokens.length) return { ok: false }
    if (v && typeof v === "object" && v.percent !== undefined) v = v.percent / 100
    if (typeof v !== "number" || isNaN(v)) return { ok: false }
    var display = base === 10 ? formatNumber(v, opts) : toBase(v, base)
    if (display === null) return { ok: false }
    return { ok: true, value: v, display: display, grouped: base === 10 ? groupThousands(display) : display, base: base }
  } catch (e) {
    return { ok: false }
  }
}

if (typeof module !== "undefined") {
  module.exports = { evaluate: evaluate, tokenize: tokenize, formatNumber: formatNumber, looksLikeMath: looksLikeMath, toBase: toBase }
}
