const test = require("node:test")
const assert = require("node:assert/strict")
const F = require("../lib/Files.js")

const NOW = 1_800_000_000
const NUL = String.fromCharCode(0)
const cand = (path, extra) => Object.assign({ path, isDir: false, mtime: NOW - 90 * 86400, size: 10 }, extra || {})

test("exact and prefix name matches beat deep substring hits", () => {
  const rows = F.rank([
    cand("/home/u/Android/Sdk/sources/android/health/ReadMedicalResourcesInitialRequest.java"),
    cand("/home/u/Github/Omarchy/README.md"),
    cand("/home/u/Downloads/ComfyUI-master/custom_nodes/x/y/README.md"),
    cand("/home/u/Documents/readme-notes.txt"),
  ], "readme", 10, NOW)
  assert.equal(rows[0].path, "/home/u/Github/Omarchy/README.md")
  assert.ok(rows[rows.length - 1].path.indexOf("Android/Sdk") >= 0, "sdk noise ranks last")
})

test("multi-term queries need every term in the path and prefer terms in the name", () => {
  const rows = F.rank([
    cand("/home/u/Documents/invoice-2026.pdf"),
    cand("/home/u/Documents/2026/invoice.pdf"),
    cand("/home/u/Documents/receipt.pdf"),
  ], "invoice 2026", 10, NOW)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].path, "/home/u/Documents/invoice-2026.pdf")
})

test("recent files get a bump; an exact base name still wins", () => {
  const rows = F.rank([
    cand("/home/u/tmp/notes.md"),
    cand("/home/u/tmp/notes-old.md", { mtime: NOW - 3600 }),
  ], "notes", 10, NOW)
  assert.equal(rows[0].path, "/home/u/tmp/notes.md")
  const rows2 = F.rank([cand("/home/u/tmp/a-notes.md"), cand("/home/u/tmp/b-notes.md", { mtime: NOW - 3600 })], "notes", 10, NOW)
  assert.equal(rows2[0].path, "/home/u/tmp/b-notes.md")
})

test("parseStat reads mtime/size/type and strips directory slashes", () => {
  const rows = F.parseStat("1700000000\t42\tregular file\t/home/u/a.txt\n1700000001\t4096\tdirectory\t/home/u/Docs/\n\nbad line\n")
  assert.equal(rows.length, 2)
  assert.equal(rows[0].size, 42)
  assert.equal(rows[1].isDir, true)
  assert.equal(rows[1].path, "/home/u/Docs")
})

test("content hits group by path with up to three lines", () => {
  const out = ["/home/u/a.md" + NUL + "3:hello world", "/home/u/a.md" + NUL + "10:  hello again", "/home/u/b.txt" + NUL + "1:hello",
    "/home/u/a.md" + NUL + "11:x", "/home/u/a.md" + NUL + "12:y", ""].join("\n")
  const hits = F.parseContentHits(out)
  assert.equal(hits.length, 2)
  assert.equal(hits[0].path, "/home/u/a.md")
  assert.equal(hits[0].hits.length, 3)
  assert.equal(hits[0].hits[1].text, "hello again")
  assert.equal(hits[0].hits[1].line, 10)
})

test("commands quote arguments and escape the fd pattern", () => {
  const cmd = F.nameCommand("my file (1)", { roots: ["/home/u/My Docs"], excludes: [".git"], maxResults: 5 })
  assert.ok(cmd.indexOf("'fd'") === 0)
  assert.ok(cmd.indexOf("'/home/u/My Docs'") > 0)
  assert.ok(cmd.indexOf("'file'") > 0)
  assert.ok(cmd.indexOf("stat --printf") > 0)
  const rg = F.contentCommand("TODO: fix", { roots: ["/home/u"] })
  assert.ok(rg.indexOf("'--fixed-strings'") > 0 && rg.indexOf("'TODO: fix'") > 0 && rg.indexOf("timeout 8") === 0)
})

test("icons, sizes and ages", () => {
  assert.equal(F.kindOf("/x/a.PDF", false), "pdf")
  assert.equal(F.kindOf("/x/a", true), "dir")
  assert.equal(F.kindOf("/x/a.unknown", false), "file")
  assert.equal(F.formatSize(512), "512 B")
  assert.equal(F.formatSize(1536), "1.5 KB")
  assert.equal(F.formatSize(5 * 1024 * 1024), "5 MB")
  assert.equal(F.formatAge(NOW - 120, NOW), "2 min ago")
  assert.equal(F.formatAge(NOW - 3 * 86400, NOW), "3 d ago")
  assert.match(F.formatAge(NOW - 400 * 86400, NOW), /^\d{4}-\d{2}-\d{2}$/)
})
