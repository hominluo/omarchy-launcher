// Shell quoting for the places that hand a path or a typed command to bash.
// The launcher lives under $HOME, which may contain spaces, and a single
// argument spliced into a command line unquoted is split into several words.

// One argument, single-quoted: every character except a quote is literal,
// and a quote is closed, escaped and reopened.
function quote(value) {
  return "'" + String(value === undefined || value === null ? "" : value).replace(/'/g, "'\\''") + "'"
}

// The argv for "run this typed command and show its output". The text goes
// through eval as one argument, so its own syntax (a trailing &, a pipe, a
// comment) is parsed exactly as typed: appending " 2>&1 | head" to the text
// would rewrite its last command and, after a comment, cap nothing at all.
function silentArgs(cmd) {
  return ['bash', '-lc', 'eval "$1" 2>&1 | head -c 20000', '--', String(cmd === undefined || cmd === null ? "" : cmd)]
}

if (typeof module !== "undefined") {
  module.exports = { quote: quote, silentArgs: silentArgs }
}
