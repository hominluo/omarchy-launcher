// Heuristic scan for macOS-only code in a prebuilt extension.
import fs from "node:fs"
import path from "node:path"

// @raycast/utils is bundled into every extension and defines runAppleScript
// itself, so only call sites count: `(0,x.runAppleScript)(` or a bare call
// outside the definition, an osascript string used more than once, or an
// AppleScript source literal.
const MARKERS: Array<[RegExp, string, "unsupported" | "partial"]> = [
  [/\(0,\s*[A-Za-z_$][\w$]*\.runAppleScript\)\(|[^\w$.]runAppleScript\(`|tell application "|\.applescript\b/, "AppleScript", "unsupported"],
  [/(require|import)\("(swift|rust):/, "native macOS module (swift:/rust: import)", "unsupported"],
  [/\bopen -a\b|\/Applications\/|~\/Library\/|\/Library\/Application Support/, "macOS paths or apps", "partial"],
  [/\bdefaults (read|write)\b|\bmdfind\b|\bmdls\b|\bpbcopy\b|\bpbpaste\b|\bscreencapture\b|\bafplay\b|\bcaffeinate\b/, "macOS command-line tools", "partial"],
  [/getSelectedFinderItems|Action\.ShowInFinder|showInFinder/, "Finder integration", "partial"],
  [/runPowerShellScript|powershell\.exe/, "PowerShell", "partial"]
]

export interface CompatReport { status: "full" | "partial" | "unsupported"; notes: string[]; commands: Record<string, { status: string; notes: string[] }> }

function isMachO(file: string) {
  try {
    const fd = fs.openSync(file, "r"); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd)
    const magic = b.readUInt32BE(0)
    return magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcafebabe || magic === 0xcefaedfe || magic === 0xcffaedfe
  } catch { return false }
}

export function scan(dir: string, manifest: any): CompatReport {
  const report: CompatReport = { status: "full", notes: [], commands: {} }
  const worst = (a: string, b: string) => (a === "unsupported" || b === "unsupported") ? "unsupported" : (a === "partial" || b === "partial") ? "partial" : "full"
  for (const cmd of manifest.commands || []) {
    const file = path.join(dir, cmd.name + ".js")
    const entry = { status: "full", notes: [] as string[] }
    let src = ""
    try { src = fs.readFileSync(file, "utf8") } catch { entry.status = "unsupported"; entry.notes.push("bundle missing") }
    for (const [re, note, level] of MARKERS) if (re.test(src)) { entry.notes.push(note); entry.status = worst(entry.status, level) }
    const osascript = (src.match(/["'`]osascript["'`]/g) || []).length
    if (osascript > 2 && entry.notes.indexOf("AppleScript") < 0) { entry.notes.push("AppleScript"); entry.status = worst(entry.status, "unsupported") }
    if (cmd.mode === "menu-bar") { entry.notes.push("menu-bar command"); entry.status = worst(entry.status, "partial") }
    report.commands[cmd.name] = entry
    report.status = worst(report.status, entry.status) as any
    for (const n of entry.notes) if (report.notes.indexOf(n) < 0) report.notes.push(n)
  }
  const assets = path.join(dir, "assets")
  try {
    for (const f of fs.readdirSync(assets)) {
      const p = path.join(assets, f)
      if (fs.statSync(p).isFile() && (f.endsWith(".swift") || isMachO(p))) { report.notes.push("native macOS helper: " + f); report.status = "unsupported" }
    }
  } catch {}
  if (Array.isArray(manifest.platforms) && manifest.platforms.length === 1 && manifest.platforms[0] === "macOS" && report.status === "full") report.notes.push("declares macOS only")
  return report
}
