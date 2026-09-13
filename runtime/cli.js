#!/usr/bin/env node
/* Omarchy Launcher CLI — built from packages/cli; do not edit. */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_node_fs4 = __toESM(require("node:fs"));
var import_node_path5 = __toESM(require("node:path"));
var import_node_child_process2 = require("node:child_process");

// src/store.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path2 = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");

// src/paths.ts
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var HOME = import_node_os.default.homedir();
var CONFIG_DIR = import_node_path.default.join(HOME, ".config", "omarchy-launcher");
var DATA_DIR = import_node_path.default.join(HOME, ".local", "share", "omarchy-launcher");
var STATE_DIR = import_node_path.default.join(HOME, ".local", "state", "omarchy-launcher");
var CACHE_DIR = import_node_path.default.join(HOME, ".cache", "omarchy-launcher");
var EXT_DIR = import_node_path.default.join(DATA_DIR, "extensions");
var INDEX_FILE = import_node_path.default.join(EXT_DIR, "index.json");
var SUPPORT_DIR = import_node_path.default.join(DATA_DIR, "support");
var PREFS_DIR = import_node_path.default.join(CONFIG_DIR, "prefs");
var SECRETS_DIR = import_node_path.default.join(DATA_DIR, "secrets");
var PLUGIN_ID = "io.github.hominluo.launcher";

// src/store.ts
var API = "https://backend.raycast.com/api/v1";
function resolveSpec(spec) {
  let s = spec.trim();
  let m = s.match(/raycast\.com\/([^/\s]+)\/([^/\s?#]+)/);
  if (m) return { owner: m[1], name: m[2] };
  m = s.match(/github\.com\/raycast\/extensions\/(?:tree|blob)\/[^/]+\/extensions\/([^/\s?#]+)/);
  if (m) return { owner: "", name: m[1] };
  m = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (m) return { owner: m[1], name: m[2] };
  m = s.match(/^([A-Za-z0-9_.-]+)$/);
  if (m) return { owner: "", name: m[1] };
  return null;
}
async function getJson(url) {
  const res = await fetch(url, { headers: { "accept": "application/json", "user-agent": "omarchy-launcher" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
async function search(query, perPage = 15) {
  const data = await getJson(`${API}/store_listings/search?q=${encodeURIComponent(query)}&per_page=${perPage}`);
  return Array.isArray(data && data.data) ? data.data : [];
}
async function lookup(spec) {
  if (spec.owner) return getJson(`${API}/extensions/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.name)}`);
  const hits = await search(spec.name, 25);
  const exact = hits.find((h) => h.name === spec.name);
  if (!exact) throw new Error(`no store extension named "${spec.name}"; try owner/name`);
  const owner = exact.owner && exact.owner.handle || exact.author && exact.author.handle;
  return getJson(`${API}/extensions/${encodeURIComponent(owner)}/${encodeURIComponent(spec.name)}`);
}
async function download(meta, dest) {
  const url = meta.download_url;
  if (!url) throw new Error("the store did not return a download URL");
  import_node_fs.default.mkdirSync(import_node_path2.default.join(CACHE_DIR, "downloads"), { recursive: true });
  const zip = import_node_path2.default.join(CACHE_DIR, "downloads", `${meta.name}-${String(meta.commit_sha || "latest").slice(0, 12)}.zip`);
  const res = await fetch(url, { headers: { "user-agent": "omarchy-launcher" } });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  import_node_fs.default.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const staging = import_node_fs.default.mkdtempSync(import_node_path2.default.join(CACHE_DIR, "stage-"));
  (0, import_node_child_process.execFileSync)("bsdtar", ["-xf", zip, "-C", staging]);
  const entries = import_node_fs.default.readdirSync(staging);
  const inner = entries.length === 1 ? import_node_path2.default.join(staging, entries[0]) : staging;
  import_node_fs.default.rmSync(dest, { recursive: true, force: true });
  import_node_fs.default.mkdirSync(import_node_path2.default.dirname(dest), { recursive: true });
  import_node_fs.default.renameSync(inner, dest);
  import_node_fs.default.rmSync(staging, { recursive: true, force: true });
  for (const f of import_node_fs.default.readdirSync(dest)) if (f.endsWith(".js.map")) import_node_fs.default.rmSync(import_node_path2.default.join(dest, f));
  const tools = import_node_path2.default.join(dest, "tools");
  try {
    for (const f of import_node_fs.default.readdirSync(tools)) if (f.endsWith(".js.map")) import_node_fs.default.rmSync(import_node_path2.default.join(tools, f));
  } catch {
  }
  return dest;
}

// src/registry.ts
var import_node_fs3 = __toESM(require("node:fs"));
var import_node_path4 = __toESM(require("node:path"));

// src/compat.ts
var import_node_fs2 = __toESM(require("node:fs"));
var import_node_path3 = __toESM(require("node:path"));
var MARKERS = [
  [/\(0,\s*[A-Za-z_$][\w$]*\.runAppleScript\)\(|[^\w$.]runAppleScript\(`|tell application "|\.applescript\b/, "AppleScript", "unsupported"],
  [/\bopen -a\b|\/Applications\/|~\/Library\/|\/Library\/Application Support/, "macOS paths or apps", "partial"],
  [/\bdefaults (read|write)\b|\bmdfind\b|\bmdls\b|\bpbcopy\b|\bpbpaste\b|\bscreencapture\b|\bafplay\b|\bcaffeinate\b/, "macOS command-line tools", "partial"],
  [/getSelectedFinderItems|Action\.ShowInFinder|showInFinder/, "Finder integration", "partial"],
  [/runPowerShellScript|powershell\.exe/, "PowerShell", "partial"]
];
function isMachO(file) {
  try {
    const fd = import_node_fs2.default.openSync(file, "r");
    const b = Buffer.alloc(4);
    import_node_fs2.default.readSync(fd, b, 0, 4, 0);
    import_node_fs2.default.closeSync(fd);
    const magic = b.readUInt32BE(0);
    return magic === 4277009102 || magic === 4277009103 || magic === 3405691582 || magic === 3472551422 || magic === 3489328638;
  } catch {
    return false;
  }
}
function scan(dir, manifest) {
  const report = { status: "full", notes: [], commands: {} };
  const worst = (a, b) => a === "unsupported" || b === "unsupported" ? "unsupported" : a === "partial" || b === "partial" ? "partial" : "full";
  for (const cmd of manifest.commands || []) {
    const file = import_node_path3.default.join(dir, cmd.name + ".js");
    const entry = { status: "full", notes: [] };
    let src = "";
    try {
      src = import_node_fs2.default.readFileSync(file, "utf8");
    } catch {
      entry.status = "unsupported";
      entry.notes.push("bundle missing");
    }
    for (const [re, note, level] of MARKERS) if (re.test(src)) {
      entry.notes.push(note);
      entry.status = worst(entry.status, level);
    }
    const osascript = (src.match(/["'`]osascript["'`]/g) || []).length;
    if (osascript > 2 && entry.notes.indexOf("AppleScript") < 0) {
      entry.notes.push("AppleScript");
      entry.status = worst(entry.status, "unsupported");
    }
    if (cmd.mode === "menu-bar") {
      entry.notes.push("menu-bar command");
      entry.status = worst(entry.status, "partial");
    }
    report.commands[cmd.name] = entry;
    report.status = worst(report.status, entry.status);
    for (const n of entry.notes) if (report.notes.indexOf(n) < 0) report.notes.push(n);
  }
  const assets = import_node_path3.default.join(dir, "assets");
  try {
    for (const f of import_node_fs2.default.readdirSync(assets)) {
      const p = import_node_path3.default.join(assets, f);
      if (import_node_fs2.default.statSync(p).isFile() && (f.endsWith(".swift") || isMachO(p))) {
        report.notes.push("native macOS helper: " + f);
        report.status = "unsupported";
      }
    }
  } catch {
  }
  if (Array.isArray(manifest.platforms) && manifest.platforms.length === 1 && manifest.platforms[0] === "macOS" && report.status === "full") report.notes.push("declares macOS only");
  return report;
}

// src/registry.ts
function readIndex() {
  try {
    const d = JSON.parse(import_node_fs3.default.readFileSync(INDEX_FILE, "utf8"));
    if (d && Array.isArray(d.extensions)) return d;
  } catch {
  }
  return { version: 1, extensions: [] };
}
function writeIndex(idx) {
  import_node_fs3.default.mkdirSync(EXT_DIR, { recursive: true });
  const tmp = INDEX_FILE + ".tmp";
  import_node_fs3.default.writeFileSync(tmp, JSON.stringify(idx, null, 2) + "\n");
  import_node_fs3.default.renameSync(tmp, INDEX_FILE);
}
function entryFor(dir, owner, name, install) {
  const manifest = JSON.parse(import_node_fs3.default.readFileSync(import_node_path4.default.join(dir, "package.json"), "utf8"));
  const compat = scan(dir, manifest);
  const iconFile = manifest.icon ? import_node_path4.default.join(dir, "assets", manifest.icon) : "";
  return {
    id: `${owner}/${name}`,
    owner,
    name,
    title: String(manifest.title || name),
    description: String(manifest.description || ""),
    icon: iconFile && import_node_fs3.default.existsSync(iconFile) ? iconFile : "",
    dir,
    source: install.source || "store",
    commit: String(install.commit || ""),
    apiVersion: String(install.apiVersion || ""),
    installedAt: install.installedAt || Date.now(),
    compat,
    preferences: manifest.preferences || [],
    commands: (manifest.commands || []).map((c) => ({
      name: c.name,
      title: c.title || c.name,
      subtitle: c.subtitle || "",
      description: c.description || "",
      mode: c.mode || "view",
      icon: c.icon && import_node_fs3.default.existsSync(import_node_path4.default.join(dir, "assets", c.icon)) ? import_node_path4.default.join(dir, "assets", c.icon) : "",
      keywords: c.keywords || [],
      arguments: c.arguments || [],
      preferences: c.preferences || [],
      interval: c.interval || "",
      disabledByDefault: c.disabledByDefault === true,
      compat: compat.commands[c.name] || { status: "full", notes: [] }
    })),
    tools: manifest.tools || []
  };
}
function rebuild() {
  const out = [];
  try {
    for (const owner of import_node_fs3.default.readdirSync(EXT_DIR)) {
      const od = import_node_path4.default.join(EXT_DIR, owner);
      if (!import_node_fs3.default.statSync(od).isDirectory()) continue;
      for (const name of import_node_fs3.default.readdirSync(od)) {
        const dir = import_node_path4.default.join(od, name);
        if (!import_node_fs3.default.existsSync(import_node_path4.default.join(dir, "package.json"))) continue;
        let install = {};
        try {
          install = JSON.parse(import_node_fs3.default.readFileSync(import_node_path4.default.join(dir, "install.json"), "utf8"));
        } catch {
        }
        try {
          out.push(entryFor(dir, owner, name, install));
        } catch (e) {
          process.stderr.write(`skipping ${dir}: ${e}
`);
        }
      }
    }
  } catch {
  }
  const idx = { version: 1, extensions: out.sort((a, b) => a.id.localeCompare(b.id)) };
  writeIndex(idx);
  return idx;
}

// src/index.ts
var USAGE = `launcher \u2014 Omarchy Launcher command line

  launcher ext search <query>            search the Raycast Store
  launcher ext install <owner/name|url>  install a store extension (prebuilt, no toolchain needed)
  launcher ext update [owner/name]       update one or every store extension
  launcher ext remove <owner/name>       remove an extension
  launcher ext list [--json]             installed extensions and their commands
  launcher ext reindex                   rebuild the extension index from disk
  launcher ext prefs <owner/name>        open the extension's preferences in the launcher
  launcher open [json]                   open the launcher (optional payload)
  launcher run <command-id>              run a launcher command, e.g. cmd:clipboard
  launcher url <uri>                     handle a raycast:// or omarchy-launcher:// link
  launcher status                        runtime status
`;
function shell(method, ...args) {
  const r = (0, import_node_child_process2.spawnSync)("omarchy-shell", [PLUGIN_ID, method, ...args], { encoding: "utf8" });
  return (r.stdout || "").trim();
}
function b64(json) {
  return Buffer.from(JSON.stringify(json)).toString("base64");
}
async function extInstall(spec) {
  const r = resolveSpec(spec);
  if (!r) throw new Error(`cannot parse "${spec}"; use owner/name or a store URL`);
  process.stdout.write(`Looking up ${r.owner ? r.owner + "/" : ""}${r.name}\u2026
`);
  const meta = await lookup(r);
  if (meta.kill_listed_at) throw new Error("this extension was removed from the store");
  const owner = meta.owner && meta.owner.handle || meta.author && meta.author.handle || r.owner || "unknown";
  const dest = import_node_path5.default.join(EXT_DIR, owner, meta.name);
  process.stdout.write(`Downloading ${meta.title} (${owner}/${meta.name}, api ${meta.api_version})\u2026
`);
  await download(meta, dest);
  import_node_fs4.default.writeFileSync(import_node_path5.default.join(dest, "install.json"), JSON.stringify({ source: "store", owner, name: meta.name, commit: meta.commit_sha, apiVersion: meta.api_version, installedAt: Date.now(), storeUrl: meta.store_url || "" }, null, 2));
  const idx = readIndex();
  const entry = entryFor(dest, owner, meta.name, JSON.parse(import_node_fs4.default.readFileSync(import_node_path5.default.join(dest, "install.json"), "utf8")));
  idx.extensions = idx.extensions.filter((e) => e.id !== entry.id).concat([entry]).sort((a, b) => a.id.localeCompare(b.id));
  writeIndex(idx);
  process.stdout.write(`Installed ${entry.title}: ${entry.commands.map((c) => c.title).join(", ")}
`);
  if (entry.compat.status !== "full") process.stdout.write(`Compatibility: ${entry.compat.status} (${entry.compat.notes.join("; ")})
`);
  const required = entry.preferences.filter((p) => p.required && p.default === void 0);
  if (required.length) process.stdout.write(`Needs configuration before first run: ${required.map((p) => p.title || p.name).join(", ")} \u2014 the launcher will ask.
`);
  shell("reindex");
}
async function extUpdate(spec) {
  const idx = readIndex();
  const targets = spec ? idx.extensions.filter((e) => e.id === spec || e.name === spec) : idx.extensions.filter((e) => e.source === "store");
  if (!targets.length) throw new Error("nothing to update");
  for (const e of targets) {
    const meta = await lookup({ owner: e.owner, name: e.name });
    if (meta.commit_sha === e.commit) {
      process.stdout.write(`${e.id}: up to date
`);
      continue;
    }
    process.stdout.write(`${e.id}: ${String(e.commit).slice(0, 7)} \u2192 ${String(meta.commit_sha).slice(0, 7)}
`);
    await extInstall(`${e.owner}/${e.name}`);
  }
}
function extRemove(spec) {
  const idx = readIndex();
  const e = idx.extensions.find((x) => x.id === spec || x.name === spec);
  if (!e) throw new Error(`not installed: ${spec}`);
  import_node_fs4.default.rmSync(e.dir, { recursive: true, force: true });
  idx.extensions = idx.extensions.filter((x) => x.id !== e.id);
  writeIndex(idx);
  process.stdout.write(`Removed ${e.id}
`);
  shell("reindex");
}
function extList(json) {
  const idx = readIndex();
  if (json) {
    process.stdout.write(JSON.stringify(idx, null, 2) + "\n");
    return;
  }
  if (!idx.extensions.length) {
    process.stdout.write("No extensions installed. Try: launcher ext install thomas/hacker-news\n");
    return;
  }
  for (const e of idx.extensions) {
    process.stdout.write(`${e.id}  ${e.title}  [${e.compat.status}]
`);
    for (const c of e.commands) process.stdout.write(`    ${c.name.padEnd(28)} ${c.title}  (${c.mode}${c.compat && c.compat.status !== "full" ? ", " + c.compat.status : ""})
`);
  }
}
async function extSearch(query) {
  const hits = await search(query);
  if (!hits.length) {
    process.stdout.write("No results.\n");
    return;
  }
  for (const h of hits) {
    const owner = h.owner && h.owner.handle || h.author && h.author.handle || "?";
    const mac = Array.isArray(h.platforms) && h.platforms.length === 1 && h.platforms[0] === "macOS" ? "  (macOS only)" : "";
    process.stdout.write(`${(owner + "/" + h.name).padEnd(40)} ${h.title}${mac}
`);
  }
}
function handleUrl(uri) {
  let u;
  try {
    u = new URL(uri);
  } catch {
    throw new Error("not a URL: " + uri);
  }
  const parts = (u.host + u.pathname).split("/").filter(Boolean);
  const q = u.searchParams;
  const parse = (v) => {
    if (!v) return void 0;
    try {
      return JSON.parse(v);
    } catch {
      return void 0;
    }
  };
  if (parts[0] === "extensions" && parts.length >= 4) {
    const payload = { extension: `${parts[1]}/${parts[2]}`, command: parts[3], arguments: parse(q.get("arguments")) || {}, context: parse(q.get("context")), launchType: q.get("launchType") || "userInitiated", fallbackText: q.get("fallbackText") || void 0 };
    process.stdout.write(shell("open", b64(payload)) + "\n");
    return;
  }
  if (parts[0] === "oauth") {
    process.stdout.write(shell("oauth", b64({ state: q.get("state"), code: q.get("code"), error: q.get("error") })) + "\n");
    return;
  }
  if (parts[0] === "script-commands" && parts[1]) {
    process.stdout.write(shell("open", b64({ query: decodeURIComponent(parts[1]) })) + "\n");
    return;
  }
  if (parts[0] === "confetti") {
    (0, import_node_child_process2.spawnSync)("omarchy-notification-send", ["\u{1F389}", "Confetti!"]);
    return;
  }
  if (parts[0] === "quicklink" && parts[1]) {
    process.stdout.write(shell("open", b64({ command: "ql:" + parts[1], arguments: { query: q.get("query") || "" } })) + "\n");
    return;
  }
  if (parts[0] === "open") {
    process.stdout.write(shell("open", b64({ command: q.get("view") ? "cmd:" + q.get("view") : void 0, query: q.get("query") || "" })) + "\n");
    return;
  }
  if (parts[0] === "toggle" || parts.length === 0) {
    process.stdout.write(shell("toggle") + "\n");
    return;
  }
  throw new Error("unsupported link: " + uri);
}
async function main(argv) {
  const [cmd, sub, ...rest] = argv;
  for (const d of [CONFIG_DIR, DATA_DIR, STATE_DIR, EXT_DIR, PREFS_DIR]) import_node_fs4.default.mkdirSync(d, { recursive: true });
  switch (cmd) {
    case "ext":
      if (sub === "install") {
        for (const s of rest) await extInstall(s);
        return;
      }
      if (sub === "update") {
        await extUpdate(rest[0]);
        return;
      }
      if (sub === "remove" || sub === "uninstall") {
        extRemove(rest[0]);
        return;
      }
      if (sub === "list" || sub === void 0) {
        extList(rest.includes("--json"));
        return;
      }
      if (sub === "search") {
        await extSearch(rest.join(" "));
        return;
      }
      if (sub === "reindex") {
        const idx = rebuild();
        process.stdout.write(`${idx.extensions.length} extension(s)
`);
        shell("reindex");
        return;
      }
      if (sub === "prefs") {
        process.stdout.write(shell("open", b64({ command: "cmd:preferences", arguments: { extension: rest[0] } })) + "\n");
        return;
      }
      break;
    case "open":
      process.stdout.write(shell("open", b64(sub ? JSON.parse(sub) : {})) + "\n");
      return;
    case "run":
      process.stdout.write(shell("run", sub) + "\n");
      return;
    case "toggle":
      process.stdout.write(shell("toggle") + "\n");
      return;
    case "url":
      handleUrl(sub);
      return;
    case "status":
      process.stdout.write(shell("status") + "\n");
      return;
    case "-h":
    case "--help":
    case "help":
    case void 0:
      process.stdout.write(USAGE);
      return;
  }
  process.stderr.write(USAGE);
  process.exit(1);
}
main(process.argv.slice(2)).catch((e) => {
  process.stderr.write("launcher: " + (e && e.message || e) + "\n");
  process.exit(1);
});
