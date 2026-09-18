#!/usr/bin/env node
/* Omarchy Launcher CLI — built from packages/cli; do not edit. */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
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

// lib/launcher-url.js
var require_launcher_url = __commonJS({
  "lib/launcher-url.js"(exports2, module2) {
    var SCHEME = "omarchy-launcher:";
    var SEG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
    var VIEW = /^[A-Za-z0-9][A-Za-z0-9:._\/-]{0,200}$/;
    var MAX_TEXT = 4096;
    var MAX_JSON = 16 * 1024;
    var MAX_STATE = 256;
    function text(value, max) {
      return typeof value === "string" ? value.slice(0, max || MAX_TEXT) : void 0;
    }
    function jsonObject(value) {
      if (typeof value !== "string" || value.length > MAX_JSON) return void 0;
      try {
        var parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
      } catch (e) {
        return void 0;
      }
    }
    function plainStrings(value) {
      var obj = jsonObject(value);
      if (!obj) return {};
      var out = {};
      for (var key in obj) {
        if (!SEG.test(key)) continue;
        var v = obj[key];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = String(v).slice(0, MAX_TEXT);
      }
      return out;
    }
    function segment(value, what) {
      if (!SEG.test(value || "")) throw new Error("unsupported link: bad " + what);
      return value;
    }
    function parseLauncherUrl2(uri) {
      var u;
      try {
        u = new URL(String(uri));
      } catch (e) {
        throw new Error("not a URL: " + String(uri).slice(0, 120));
      }
      if (u.protocol !== SCHEME) throw new Error("unsupported scheme " + u.protocol + "//; only omarchy-launcher:// links are handled");
      var parts = (u.host + u.pathname).split("/").filter(Boolean).map(function(p) {
        try {
          return decodeURIComponent(p);
        } catch (e) {
          return p;
        }
      });
      var q = u.searchParams;
      var head = parts[0] || "";
      if (head === "extensions") {
        if (parts.length < 4) throw new Error("unsupported link: extensions/<owner>/<name>/<command>");
        var owner = segment(parts[1], "owner"), name = segment(parts[2], "extension"), command = segment(parts[3], "command");
        return { method: "open", payload: {
          extension: owner + "/" + name,
          command,
          arguments: plainStrings(q.get("arguments")),
          context: jsonObject(q.get("context")),
          fallbackText: text(q.get("fallbackText")),
          launchType: "userInitiated",
          origin: "url"
        } };
      }
      if (head === "oauth") {
        var state = text(q.get("state"), MAX_STATE);
        if (!state) throw new Error("unsupported link: oauth without state");
        return { method: "oauth", payload: { state, code: text(q.get("code")), error: text(q.get("error")) } };
      }
      if (head === "script-commands") {
        if (!parts[1]) throw new Error("unsupported link: script-commands/<query>");
        return { method: "open", payload: { query: parts[1].slice(0, MAX_TEXT), origin: "url" } };
      }
      if (head === "quicklink") {
        return { method: "open", payload: { command: "ql:" + segment(parts[1], "quicklink"), arguments: { query: (q.get("query") || "").slice(0, MAX_TEXT) }, origin: "url" } };
      }
      if (head === "open") {
        var view = q.get("view") || "";
        if (view && !VIEW.test(view)) throw new Error("unsupported link: bad view");
        return { method: "open", payload: {
          command: view ? view.indexOf(":") >= 0 ? view : "cmd:" + view : void 0,
          query: (q.get("query") || "").slice(0, MAX_TEXT),
          origin: "url"
        } };
      }
      if (head === "confetti") return { method: "confetti" };
      if (head === "toggle" || parts.length === 0) return { method: "toggle" };
      throw new Error("unsupported link: " + head);
    }
    if (typeof module2 !== "undefined") {
      module2.exports = { parseLauncherUrl: parseLauncherUrl2, SCHEME };
    }
  }
});

// packages/cli/src/index.ts
var import_node_fs7 = __toESM(require("node:fs"));
var import_node_path7 = __toESM(require("node:path"));
var import_node_readline = __toESM(require("node:readline"));
var import_node_child_process3 = require("node:child_process");

// packages/cli/src/fsio.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path2 = __toESM(require("node:path"));
var import_node_crypto = require("node:crypto");

// packages/cli/src/paths.ts
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
var ORIGINS_FILE = import_node_path.default.join(DATA_DIR, "origins.json");
var SRC_CACHE_DIR = import_node_path.default.join(CACHE_DIR, "src");
var NPM_CACHE_DIR = import_node_path.default.join(CACHE_DIR, "npm");

// packages/cli/src/fsio.ts
var { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = import_node_fs.default.constants;
function atomicWrite(file, data, mode = 384) {
  const dir = import_node_path2.default.dirname(file);
  import_node_fs.default.mkdirSync(dir, { recursive: true });
  let tmp = "", fd = -1;
  for (let i = 0; i < 32 && fd < 0; i++) {
    tmp = import_node_path2.default.join(dir, `.${import_node_path2.default.basename(file)}.${(0, import_node_crypto.randomBytes)(8).toString("hex")}.tmp`);
    try {
      fd = import_node_fs.default.openSync(tmp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  if (fd < 0) throw new Error(`could not create a temporary file beside ${file}`);
  try {
    const st = import_node_fs.default.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid() || st.nlink !== 1) throw new Error(`unexpected file at ${tmp}; refusing to write`);
    import_node_fs.default.writeSync(fd, data);
    import_node_fs.default.fsyncSync(fd);
    import_node_fs.default.closeSync(fd);
    fd = -1;
    import_node_fs.default.renameSync(tmp, file);
  } catch (e) {
    if (fd >= 0) try {
      import_node_fs.default.closeSync(fd);
    } catch {
    }
    try {
      import_node_fs.default.unlinkSync(tmp);
    } catch {
    }
    throw e;
  }
}
var SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function safeSegment(value, what) {
  const s = String(value ?? "");
  if (!SEGMENT.test(s)) throw new Error(`${what} "${s}" is not a safe directory name`);
  return s;
}
function plainName(value) {
  return typeof value === "string" && SEGMENT.test(value);
}
function safeRelDir(value, what) {
  const s = String(value ?? "").replace(/^\/+|\/+$/g, "");
  if (!s) throw new Error(`${what} is empty`);
  const parts = s.split("/");
  for (const part of parts) safeSegment(part, what);
  return parts.join("/");
}
function cleanText(value, max = 200) {
  return String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f‪-‮⁦-⁩]/g, "").slice(0, max);
}
function sha256File(file) {
  return (0, import_node_crypto.createHash)("sha256").update(import_node_fs.default.readFileSync(file)).digest("hex");
}
function assertInsideExtDir(p) {
  const abs = import_node_path2.default.resolve(p);
  let extReal, parentReal;
  try {
    extReal = import_node_fs.default.realpathSync(EXT_DIR);
  } catch {
    throw new Error(`refusing to touch ${p}: ${EXT_DIR} does not exist`);
  }
  try {
    parentReal = import_node_fs.default.realpathSync(import_node_path2.default.dirname(abs));
  } catch {
    throw new Error(`refusing to touch ${p}: its parent does not exist`);
  }
  const rel = import_node_path2.default.relative(extReal, import_node_path2.default.join(parentReal, import_node_path2.default.basename(abs)));
  if (!rel || rel === ".." || rel.startsWith(".." + import_node_path2.default.sep) || import_node_path2.default.isAbsolute(rel)) throw new Error(`refusing to touch ${p}: not inside ${EXT_DIR}`);
  let st = null;
  try {
    st = import_node_fs.default.lstatSync(abs);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (st && st.isSymbolicLink()) throw new Error(`refusing to touch ${p}: it is a symlink`);
}
function copyTreeNoSymlinks(src, dst, maxBytes = 50 * 1024 * 1024) {
  let total = 0;
  const walk = (from, to) => {
    import_node_fs.default.mkdirSync(to, { recursive: true });
    for (const name of import_node_fs.default.readdirSync(from)) {
      const s = import_node_path2.default.join(from, name), d = import_node_path2.default.join(to, name);
      const st = import_node_fs.default.lstatSync(s);
      if (st.isDirectory()) {
        walk(s, d);
        continue;
      }
      if (!st.isFile()) throw new Error(`${s} is not a regular file; refusing to copy it`);
      total += st.size;
      if (total > maxBytes) throw new Error(`assets exceed ${Math.round(maxBytes / (1024 * 1024))} MB; refusing to install`);
      import_node_fs.default.copyFileSync(s, d, import_node_fs.default.constants.COPYFILE_EXCL);
    }
  };
  walk(src, dst);
}

// packages/cli/src/store.ts
var API = "https://backend.raycast.com/api/v1";
var MAX_RESPONSE = 4 * 1024 * 1024;
var TIMEOUT_MS = 2e4;
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
  const res = await fetch(url, { headers: { "accept": "application/json", "user-agent": "omarchy-launcher" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const type = res.headers.get("content-type") || "";
  if (!/json/i.test(type)) throw new Error(`the store answered with ${type || "no content type"}, not JSON`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE) throw new Error("store response too large");
  const chunks = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (!reader) throw new Error("empty store response");
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE) {
      await reader.cancel();
      throw new Error("store response too large");
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function search(query, perPage = 15) {
  const n = Math.max(1, Math.min(50, Math.floor(perPage)));
  const data = await getJson(`${API}/store_listings/search?q=${encodeURIComponent(query)}&per_page=${n}`);
  return Array.isArray(data && data.data) ? data.data : [];
}
function validateMeta(raw, fallbackOwner = "") {
  if (!raw || typeof raw !== "object") throw new Error("the store answered with something that is not a listing");
  const owner = safeSegment(raw.owner && raw.owner.handle || raw.author && raw.author.handle || fallbackOwner || "unknown", "store owner");
  const name = safeSegment(raw.name, "store extension name");
  const commit = String(raw.commit_sha || "");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`the store lists no full commit for ${owner}/${name}; cannot pin it`);
  const rel = String(raw.relative_path || "").replace(/\/+$/, "");
  const m = rel.match(/^extensions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/);
  if (!m) throw new Error(`the store lists an unexpected source path "${rel}" for ${owner}/${name}`);
  return {
    owner,
    name,
    title: cleanText(raw.title || name, 120),
    commit,
    relativePath: rel,
    apiVersion: cleanText(raw.api_version || "", 32),
    storeUrl: cleanText(raw.store_url || "", 300),
    killListedAt: raw.kill_listed_at ? String(raw.kill_listed_at) : null
  };
}
async function lookup(spec) {
  if (spec.owner) return validateMeta(await getJson(`${API}/extensions/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.name)}`), spec.owner);
  const hits = await search(spec.name, 25);
  const exact = hits.find((h) => h && h.name === spec.name);
  if (!exact) throw new Error(`no store extension named "${spec.name}"; try owner/name`);
  const owner = exact.owner && exact.owner.handle || exact.author && exact.author.handle;
  return validateMeta(await getJson(`${API}/extensions/${encodeURIComponent(owner)}/${encodeURIComponent(spec.name)}`), owner);
}

// packages/cli/src/build.ts
var import_node_fs2 = __toESM(require("node:fs"));
var import_node_path3 = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");
var ESBUILD = process.env.OMARCHY_LAUNCHER_ESBUILD || "/usr/bin/esbuild";
function run(cmd, args, cwd, timeoutMs = 5 * 60 * 1e3) {
  const r = (0, import_node_child_process.spawnSync)(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs });
  if (r.error) throw new Error(`${import_node_path3.default.basename(cmd)} ${args.slice(0, 2).join(" ")} failed: ${r.error.message}`);
  if (r.status !== 0) {
    const out = String(r.stderr || r.stdout || "");
    throw new Error(`${import_node_path3.default.basename(cmd)} ${args.slice(0, 2).join(" ")} failed:
${out.trim().slice(-1500)}`);
  }
  return r.stdout;
}
function esbuildVersion() {
  let out = "";
  try {
    out = run(ESBUILD, ["--version"], process.cwd(), 3e4);
  } catch (e) {
    if (/ENOENT|failed: spawnSync/.test(String(e.message)) || !import_node_fs2.default.existsSync(ESBUILD)) throw new Error(`esbuild is not installed at ${ESBUILD}; run: omarchy pkg add esbuild`);
    throw e;
  }
  const v = out.trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) throw new Error(`${ESBUILD} did not report a version`);
  return v;
}
function findEntry(src, name, tools = false) {
  const base = tools ? import_node_path3.default.join(src, "src", "tools") : import_node_path3.default.join(src, "src");
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    const p = import_node_path3.default.join(base, name + ext);
    if (import_node_fs2.default.existsSync(p)) return p;
  }
  return null;
}
function build(src, provenance, log2) {
  const manifest = JSON.parse(import_node_fs2.default.readFileSync(import_node_path3.default.join(src, "package.json"), "utf8"));
  if (!manifest.name) throw new Error("package.json has no name");
  const name = safeSegment(manifest.name, "extension name");
  const owner = safeSegment(manifest.owner || manifest.author || "local", "extension owner");
  const dest = import_node_path3.default.join(EXT_DIR, owner, name);
  import_node_fs2.default.mkdirSync(import_node_path3.default.dirname(dest), { recursive: true });
  assertInsideExtDir(dest);
  const staging = import_node_fs2.default.mkdtempSync(dest + ".building-");
  try {
    bundle(src, manifest, staging, log2);
  } catch (e) {
    import_node_fs2.default.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  assertInsideExtDir(dest);
  import_node_fs2.default.rmSync(dest, { recursive: true, force: true });
  import_node_fs2.default.renameSync(staging, dest);
  log2(`  built with esbuild ${provenance.esbuildVersion}, lockfile ${provenance.lockfileSha256.slice(0, 12)}`);
  return { dir: dest, manifest, owner, name };
}
function bundle(src, manifest, staging, log2) {
  const common = [
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=cjs",
    "--jsx=automatic",
    "--minify",
    "--sourcemap=linked",
    "--log-level=warning",
    "--external:@raycast/api",
    "--external:react",
    "--external:react/jsx-runtime",
    "--external:react/jsx-dev-runtime",
    "--external:swift:*",
    "--external:rust:*",
    // Raycast's native-module imports (macOS only); the compat scan flags them
    // No loader for .node: a native addon would be code the host runs without
    // ever having been reviewed as JavaScript; the build fails instead.
    "--loader:.swift=empty",
    "--loader:.ps1=text",
    "--loader:.md=text",
    '--define:process.env.NODE_ENV="production"'
  ];
  for (const cmd of manifest.commands || []) {
    if (!plainName(cmd.name)) {
      log2(`  skipping command ${JSON.stringify(cmd.name)}: not a plain name`);
      continue;
    }
    const entry = findEntry(src, cmd.name);
    if (!entry) {
      log2(`  skipping ${cmd.name}: no src/${cmd.name}.{tsx,ts,jsx,js}`);
      continue;
    }
    log2(`  bundling ${cmd.name}`);
    run(ESBUILD, [entry, `--outfile=${import_node_path3.default.join(staging, cmd.name + ".js")}`, ...common], src);
  }
  if (Array.isArray(manifest.tools) && manifest.tools.length) {
    import_node_fs2.default.mkdirSync(import_node_path3.default.join(staging, "tools"), { recursive: true });
    for (const tool of manifest.tools) {
      if (!plainName(tool.name)) {
        log2(`  skipping tool ${JSON.stringify(tool.name)}: not a plain name`);
        continue;
      }
      const entry = findEntry(src, tool.name, true);
      if (!entry) continue;
      log2(`  bundling tool ${tool.name}`);
      run(ESBUILD, [entry, `--outfile=${import_node_path3.default.join(staging, "tools", tool.name + ".js")}`, ...common], src);
    }
  }
  import_node_fs2.default.copyFileSync(import_node_path3.default.join(src, "package.json"), import_node_path3.default.join(staging, "package.json"));
  const assets = import_node_path3.default.join(src, "assets");
  if (import_node_fs2.default.existsSync(assets)) {
    if (!import_node_fs2.default.lstatSync(assets).isDirectory()) throw new Error("assets is not a directory");
    copyTreeNoSymlinks(assets, import_node_path3.default.join(staging, "assets"));
  }
  for (const dir of [staging, import_node_path3.default.join(staging, "tools")]) {
    let names = [];
    try {
      names = import_node_fs2.default.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of names) if (f.endsWith(".js.map")) import_node_fs2.default.rmSync(import_node_path3.default.join(dir, f));
  }
}

// packages/cli/src/source.ts
var import_node_fs3 = __toESM(require("node:fs"));
var import_node_path4 = __toESM(require("node:path"));
var import_node_crypto2 = require("node:crypto");
var import_node_child_process2 = require("node:child_process");
var MONOREPO = "https://github.com/raycast/extensions.git";
var COMMIT = /^[0-9a-f]{40}$/;
var REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;
var GIT_URL = /^(https:\/\/[^\s#]+|ssh:\/\/[^\s#]+|git@[^\s:#]+:[^\s#]+|file:\/\/\/[^\s#]+)$/;
var MAX_LOCKFILE = 16 * 1024 * 1024;
var REGISTRY = "https://registry.npmjs.org/";
function run2(cmd, args, cwd, opts = {}) {
  const r = (0, import_node_child_process2.spawnSync)(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: opts.timeoutMs ?? 15 * 60 * 1e3,
    env: opts.env ?? process.env
  });
  if (r.error) throw new Error(`${import_node_path4.default.basename(cmd)} ${args.slice(0, 2).join(" ")} failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${import_node_path4.default.basename(cmd)} ${args.slice(0, 2).join(" ")} failed:
${String(r.stderr || r.stdout || "").trim().slice(-1500)}`);
  return String(r.stdout || "");
}
function isCommit(value) {
  return typeof value === "string" && COMMIT.test(value);
}
function checkRef(value) {
  if (!REF.test(value) || value.includes("..") || value.endsWith(".lock") || value.startsWith("-")) throw new Error(`"${value}" is not a usable git ref`);
  return value;
}
function checkGitUrl(value) {
  if (!GIT_URL.test(value) || value.startsWith("-")) throw new Error(`"${value}" is not a supported git URL (https://, ssh://, git@host:path or file:///)`);
  return value;
}
async function resolveInstallSpec(spec, flags = {}, log2 = () => {
}) {
  const s = spec.trim();
  if (import_node_fs3.default.existsSync(s) && import_node_fs3.default.existsSync(import_node_path4.default.join(s, "package.json"))) return { kind: "local", dir: import_node_path4.default.resolve(s) };
  let m = s.match(/^https?:\/\/github\.com\/raycast\/extensions\/(?:tree|blob)\/([^/?#]+)\/extensions\/([^/?#]+)\/?$/);
  if (m) {
    const subdir = "extensions/" + safeSegment(m[2], "extension directory");
    const pinned = flags.commit ?? (isCommit(m[1]) ? m[1] : void 0);
    const ref = pinned ? void 0 : checkRef(flags.ref ?? m[1]);
    return pinGit(MONOREPO, pinned, ref, subdir, log2);
  }
  m = s.match(/^([^#\s]+)(?:#(.+))?$/);
  if (m && /^(https?:\/\/|ssh:\/\/|git@|file:\/\/\/)/.test(m[1]) && !/raycast\.com\//.test(m[1])) {
    let url = m[1];
    if (/^https?:\/\/github\.com\/[^/]+\/[^/#]+$/.test(url) && !url.endsWith(".git")) url += ".git";
    checkGitUrl(url);
    const fragment = m[2];
    let pinned = flags.commit;
    let subdir = flags.subdir;
    if (fragment) {
      if (isCommit(fragment)) pinned = pinned ?? fragment;
      else subdir = subdir ?? fragment;
    }
    if (subdir !== void 0) subdir = safeRelDir(subdir, "subdirectory");
    const ref = pinned ? void 0 : flags.ref ? checkRef(flags.ref) : void 0;
    return pinGit(url, pinned, ref, subdir, log2);
  }
  const r = resolveSpec(s);
  if (!r) throw new Error(`cannot parse "${spec}"; use owner/name, a store URL, a git URL or a directory`);
  log2(`Looking up ${r.owner ? r.owner + "/" : ""}${r.name}\u2026`);
  const meta = await lookup(r);
  return storeSpec(meta);
}
function storeSpec(meta) {
  if (meta.killListedAt) throw new Error("this extension was removed from the store");
  return {
    kind: "store",
    owner: meta.owner,
    name: meta.name,
    title: meta.title,
    commit: meta.commit,
    subdir: meta.relativePath,
    url: MONOREPO,
    apiVersion: meta.apiVersion,
    storeUrl: meta.storeUrl
  };
}
async function pinGit(url, commit, ref, subdir, log2) {
  if (commit && !isCommit(commit)) throw new Error("the commit must be the full 40-hex SHA");
  if (!commit) {
    commit = resolveRef(url, ref ?? "HEAD");
    log2(`${url} ${ref ?? "HEAD"} pinned to ${commit}`);
  }
  return { kind: "git", url, commit, ref, subdir };
}
function resolveRef(url, ref) {
  const wants = ref === "HEAD" ? ["HEAD"] : [`refs/heads/${ref}`, `refs/tags/${ref}^{}`, `refs/tags/${ref}`, ref];
  const out = run2("git", ["ls-remote", "--exit-code", "--", url, ...wants], process.cwd(), { env: gitEnv(), timeoutMs: 6e4 });
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const pick = (suffix) => lines.find((l) => l.endsWith("	" + suffix));
  const line = pick(`refs/tags/${ref}^{}`) || pick(`refs/heads/${ref}`) || pick(`refs/tags/${ref}`) || (ref === "HEAD" ? pick("HEAD") : void 0) || lines[0];
  const sha = line ? line.split("	")[0] : "";
  if (!isCommit(sha)) throw new Error(`could not resolve "${ref}" at ${url}`);
  return sha;
}
function gitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" };
}
var GIT_OPTS = [
  "-c",
  "protocol.allow=never",
  "-c",
  "protocol.https.allow=always",
  "-c",
  "protocol.ssh.allow=always",
  "-c",
  "protocol.file.allow=always",
  "-c",
  "core.symlinks=false",
  "-c",
  "submodule.recurse=false",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "advice.detachedHead=false"
];
function fetchPinned(url, commit, subdir, ref, log2) {
  if (!isCommit(commit)) throw new Error("the commit must be the full 40-hex SHA");
  const key = (0, import_node_crypto2.createHash)("sha1").update(url + "#" + (subdir || "")).digest("hex").slice(0, 16);
  const keyDir = import_node_path4.default.join(SRC_CACHE_DIR, key);
  const dir = import_node_path4.default.join(keyDir, commit);
  const src = subdir ? import_node_path4.default.join(dir, subdir) : dir;
  const git = (args, cwd = dir) => run2("git", [...GIT_OPTS, ...args], cwd, { env: gitEnv() });
  let reuse = false;
  if (import_node_fs3.default.existsSync(import_node_path4.default.join(dir, ".git"))) {
    try {
      reuse = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim() === commit && import_node_fs3.default.lstatSync(import_node_path4.default.join(src, "package.json")).isFile();
    } catch {
      reuse = false;
    }
  }
  if (!reuse) {
    import_node_fs3.default.rmSync(dir, { recursive: true, force: true });
    import_node_fs3.default.mkdirSync(dir, { recursive: true });
    git(["init", "-q", "--initial-branch=main", dir], keyDir);
    git(["remote", "add", "origin", url]);
    log2(`Fetching ${url} @ ${commit.slice(0, 12)}${subdir ? " (" + subdir + ")" : ""}\u2026`);
    const fetchArgs = ["fetch", "-q", "--depth=1", "--filter=blob:none", "--no-tags", "--no-recurse-submodules", "origin"];
    try {
      git([...fetchArgs, commit]);
    } catch (e) {
      if (!/not our ref|unadvertised object|does not allow request|couldn't find remote ref|Could not find/i.test(String(e.message))) throw e;
      git([...fetchArgs, ref || "HEAD"]);
      const got = git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]).trim();
      if (got !== commit) throw new Error(`${url} ${ref || "HEAD"} moved to ${got.slice(0, 12)} since it was resolved (${commit.slice(0, 12)}); run the install again`);
    }
    if (subdir) git(["sparse-checkout", "set", "--cone", subdir]);
    git(["checkout", "-q", "--detach", "FETCH_HEAD"]);
  }
  const head = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  if (head !== commit) throw new Error(`checkout is at ${head.slice(0, 12)}, not the pinned ${commit.slice(0, 12)}`);
  if (git(["cat-file", "-t", commit]).trim() !== "commit") throw new Error(`${commit} is not a commit`);
  let pkg;
  try {
    pkg = import_node_fs3.default.lstatSync(import_node_path4.default.join(src, "package.json"));
  } catch {
    throw new Error(`no package.json in ${src}`);
  }
  if (!pkg.isFile()) throw new Error(`${import_node_path4.default.join(src, "package.json")} is not a regular file`);
  for (const other of import_node_fs3.default.readdirSync(keyDir)) if (other !== commit) import_node_fs3.default.rmSync(import_node_path4.default.join(keyDir, other), { recursive: true, force: true });
  return { dir, src };
}
function checkLockfile(src) {
  const candidates = ["npm-shrinkwrap.json", "package-lock.json"].map((n) => import_node_path4.default.join(src, n));
  const file = candidates.find((f) => {
    try {
      return import_node_fs3.default.lstatSync(f).isFile();
    } catch {
      return false;
    }
  });
  if (!file) throw new Error("no package-lock.json; the launcher only builds extensions with a committed npm lockfile");
  if (import_node_fs3.default.lstatSync(file).size > MAX_LOCKFILE) throw new Error("the lockfile is unreasonably large; refusing to build");
  let lock;
  try {
    lock = JSON.parse(import_node_fs3.default.readFileSync(file, "utf8"));
  } catch {
    throw new Error("the lockfile is not valid JSON");
  }
  if (!lock || typeof lock !== "object" || !(Number(lock.lockfileVersion) >= 2) || !lock.packages || typeof lock.packages !== "object") {
    throw new Error("the lockfile is lockfileVersion 1 or malformed; a v2+ package-lock.json is required");
  }
  let packages = 0;
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === "") continue;
    if (!/(^|\/)node_modules\//.test(key) || entry.link === true) throw new Error(`lockfile entry "${key}" is a workspace or link; only registry packages are accepted`);
    if (entry.inBundle === true) {
      packages++;
      continue;
    }
    if (typeof entry.resolved !== "string" || !entry.resolved.startsWith(REGISTRY)) throw new Error(`"${key}" resolves to ${entry.resolved ?? "(nothing)"}; only ${REGISTRY} tarballs are accepted`);
    if (typeof entry.integrity !== "string" || !/^sha(512|256|1)-[A-Za-z0-9+/=]+$/.test(entry.integrity)) throw new Error(`"${key}" has no integrity hash in the lockfile`);
    packages++;
  }
  return { file, sha256: sha256File(file), packages };
}
function npmCi(src, log2, opts = {}) {
  import_node_fs3.default.mkdirSync(NPM_CACHE_DIR, { recursive: true });
  const userRc = import_node_path4.default.join(NPM_CACHE_DIR, "empty-user.npmrc"), globalRc = import_node_path4.default.join(NPM_CACHE_DIR, "empty-global.npmrc");
  for (const rc of [userRc, globalRc]) import_node_fs3.default.writeFileSync(rc, "", { mode: 384 });
  log2("Installing dependencies (npm ci, scripts disabled, registry.npmjs.org only)\u2026");
  const args = [
    "ci",
    "--ignore-scripts",
    opts.binLinks ? "--bin-links" : "--no-bin-links",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
    "--no-update-notifier",
    "--registry=" + REGISTRY,
    "--strict-ssl=true",
    "--replace-registry-host=never",
    "--workspaces=false",
    "--include-workspace-root=false",
    "--install-links=false",
    "--foreground-scripts=false",
    "--global=false",
    "--location=project",
    "--prefix=" + src,
    "--cache=" + NPM_CACHE_DIR
  ];
  const env = {
    ...process.env,
    npm_config_userconfig: userRc,
    npm_config_globalconfig: globalRc,
    npm_config_ignore_scripts: "true",
    NODE_OPTIONS: "",
    GIT_TERMINAL_PROMPT: "0"
  };
  run2("npm", args, src, { env });
}

// packages/cli/src/registry.ts
var import_node_fs5 = __toESM(require("node:fs"));
var import_node_path6 = __toESM(require("node:path"));

// packages/cli/src/compat.ts
var import_node_fs4 = __toESM(require("node:fs"));
var import_node_path5 = __toESM(require("node:path"));
var MARKERS = [
  [/\(0,\s*[A-Za-z_$][\w$]*\.runAppleScript\)\(|[^\w$.]runAppleScript\(`|tell application "|\.applescript\b/, "AppleScript", "unsupported"],
  [/(require|import)\("(swift|rust):/, "native macOS module (swift:/rust: import)", "unsupported"],
  [/\bopen -a\b|\/Applications\/|~\/Library\/|\/Library\/Application Support/, "macOS paths or apps", "partial"],
  [/\bdefaults (read|write)\b|\bmdfind\b|\bmdls\b|\bpbcopy\b|\bpbpaste\b|\bscreencapture\b|\bafplay\b|\bcaffeinate\b/, "macOS command-line tools", "partial"],
  [/getSelectedFinderItems|Action\.ShowInFinder|showInFinder/, "Finder integration", "partial"],
  [/runPowerShellScript|powershell\.exe/, "PowerShell", "partial"]
];
function isMachO(file) {
  try {
    const fd = import_node_fs4.default.openSync(file, "r");
    const b = Buffer.alloc(4);
    import_node_fs4.default.readSync(fd, b, 0, 4, 0);
    import_node_fs4.default.closeSync(fd);
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
    const file = import_node_path5.default.join(dir, cmd.name + ".js");
    const entry = { status: "full", notes: [] };
    let src = "";
    try {
      src = import_node_fs4.default.readFileSync(file, "utf8");
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
  const assets = import_node_path5.default.join(dir, "assets");
  try {
    for (const f of import_node_fs4.default.readdirSync(assets)) {
      const p = import_node_path5.default.join(assets, f);
      if (import_node_fs4.default.statSync(p).isFile() && (f.endsWith(".swift") || isMachO(p))) {
        report.notes.push("native macOS helper: " + f);
        report.status = "unsupported";
      }
    }
  } catch {
  }
  if (Array.isArray(manifest.platforms) && manifest.platforms.length === 1 && manifest.platforms[0] === "macOS" && report.status === "full") report.notes.push("declares macOS only");
  return report;
}

// packages/cli/src/registry.ts
function readIndex() {
  try {
    const d = JSON.parse(import_node_fs5.default.readFileSync(INDEX_FILE, "utf8"));
    if (d && Array.isArray(d.extensions)) return d;
  } catch {
  }
  return { version: 1, extensions: [] };
}
function writeIndex(idx) {
  import_node_fs5.default.mkdirSync(EXT_DIR, { recursive: true });
  atomicWrite(INDEX_FILE, JSON.stringify(idx, null, 2) + "\n", 420);
}
function assetPath(dir, value) {
  if (!plainName(value)) return "";
  const p = import_node_path6.default.join(dir, "assets", value);
  try {
    return import_node_fs5.default.lstatSync(p).isFile() ? p : "";
  } catch {
    return "";
  }
}
function entryFor(dir, owner, name, install) {
  const manifest = JSON.parse(import_node_fs5.default.readFileSync(import_node_path6.default.join(dir, "package.json"), "utf8"));
  const commands = (Array.isArray(manifest.commands) ? manifest.commands : []).filter((c) => c && plainName(c.name));
  const tools = (Array.isArray(manifest.tools) ? manifest.tools : []).filter((t) => t && plainName(t.name));
  const compat = scan(dir, { ...manifest, commands });
  return {
    id: `${owner}/${name}`,
    owner,
    name,
    title: String(manifest.title || name),
    description: String(manifest.description || ""),
    icon: assetPath(dir, manifest.icon),
    dir,
    source: install.source || "store",
    commit: String(install.commit || ""),
    apiVersion: String(install.apiVersion || ""),
    installedAt: install.installedAt || Date.now(),
    compat,
    preferences: Array.isArray(manifest.preferences) ? manifest.preferences : [],
    commands: commands.map((c) => ({
      name: c.name,
      title: c.title || c.name,
      subtitle: c.subtitle || "",
      description: c.description || "",
      mode: c.mode || "view",
      icon: assetPath(dir, c.icon),
      keywords: Array.isArray(c.keywords) ? c.keywords : [],
      arguments: Array.isArray(c.arguments) ? c.arguments : [],
      preferences: Array.isArray(c.preferences) ? c.preferences : [],
      interval: c.interval || "",
      disabledByDefault: c.disabledByDefault === true,
      compat: compat.commands[c.name] || { status: "full", notes: [] }
    })),
    tools
  };
}
function rebuild() {
  const out = [];
  const isDir = (p) => {
    try {
      return import_node_fs5.default.lstatSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  try {
    for (const owner of import_node_fs5.default.readdirSync(EXT_DIR)) {
      const od = import_node_path6.default.join(EXT_DIR, owner);
      if (!SEGMENT.test(owner) || !isDir(od)) continue;
      for (const name of import_node_fs5.default.readdirSync(od)) {
        const dir = import_node_path6.default.join(od, name);
        if (!SEGMENT.test(name) || !isDir(dir)) continue;
        if (!import_node_fs5.default.existsSync(import_node_path6.default.join(dir, "package.json"))) continue;
        let install = {};
        try {
          install = JSON.parse(import_node_fs5.default.readFileSync(import_node_path6.default.join(dir, "install.json"), "utf8"));
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

// packages/cli/src/origins.ts
var import_node_fs6 = __toESM(require("node:fs"));
function readOrigins() {
  try {
    const d = JSON.parse(import_node_fs6.default.readFileSync(ORIGINS_FILE, "utf8"));
    if (d && typeof d === "object" && d.origins && typeof d.origins === "object") return d.origins;
  } catch {
  }
  return {};
}
function writeOrigins(origins) {
  atomicWrite(ORIGINS_FILE, JSON.stringify({ version: 1, origins }, null, 2) + "\n", 384);
}
function setOrigin(id, origin) {
  const all = readOrigins();
  all[id] = origin;
  writeOrigins(all);
}
function deleteOrigin(id) {
  const all = readOrigins();
  if (!(id in all)) return;
  delete all[id];
  writeOrigins(all);
}

// packages/cli/src/index.ts
var import_launcher_url = __toESM(require_launcher_url());
var USAGE = `launcher \u2014 Omarchy Launcher command line

  launcher ext search <query>            search the Raycast Store
  launcher ext install <owner/name|url>  install a store extension: built here from its pinned commit in raycast/extensions
  launcher ext install <dir|git-url>     build and install from source; git-url#<40-hex sha> pins a commit
      [--ref <branch|tag>] [--commit <sha>] [--subdir <dir>] [--yes]
  launcher ext update [owner/name]       update one or every extension from its recorded origin
  launcher ext remove <owner/name>       remove an extension
  launcher ext list [--json]             installed extensions and their commands
  launcher ext reindex                   rebuild the extension index from disk
  launcher ext prefs <owner/name>        open the extension's preferences in the launcher
  launcher open [json]                   open the launcher (optional payload)
  launcher run <command-id>              run a launcher command, e.g. cmd:clipboard
  launcher menu [id|alias]               open the Omarchy menu browser (e.g. settings, system, style.font)
  launcher url <omarchy-launcher://\u2026>    handle a launcher link (extension launches and quicklinks are confirmed first)
  launcher write-file --mode 600 -- <path>   write one JSON line from stdin atomically (used by the shell for secrets)
  launcher status                        runtime status

Every install needs git, npm and esbuild (omarchy pkg add esbuild). Extensions run with your
full user privileges once launched; the install prompt lists what each one declares.
`;
function shell(method, ...args) {
  const r = (0, import_node_child_process3.spawnSync)("omarchy-shell", [PLUGIN_ID, method, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  return (r.stdout || "").trim();
}
function b64(json) {
  return Buffer.from(JSON.stringify(json)).toString("base64");
}
var log = (line) => process.stdout.write(line + "\n");
function parseFlags(rest) {
  const out = { args: [], yes: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--") {
      out.args.push(...rest.slice(i + 1));
      break;
    } else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--json") out.json = true;
    else if (a === "--ref") out.ref = rest[++i];
    else if (a === "--commit") out.commit = rest[++i];
    else if (a === "--subdir") out.subdir = rest[++i];
    else if (a === "--mode") out.mode = rest[++i];
    else if (a.startsWith("--ref=")) out.ref = a.slice(6);
    else if (a.startsWith("--commit=")) out.commit = a.slice(9);
    else if (a.startsWith("--subdir=")) out.subdir = a.slice(9);
    else if (a.startsWith("--mode=")) out.mode = a.slice(7);
    else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else out.args.push(a);
  }
  return out;
}
function describe(spec) {
  if (spec.kind === "local") return spec.dir;
  if (spec.kind === "store") return `${spec.url} @ ${spec.commit} (${spec.subdir})`;
  return `${spec.url} @ ${spec.commit}${spec.subdir ? " (" + spec.subdir + ")" : ""}${spec.ref ? " [" + spec.ref + "]" : ""}`;
}
async function askYes(question) {
  const rl = import_node_readline.default.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((resolve) => rl.question(question, resolve));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
async function confirmInstall(spec, manifest, lock, esbuild, yes) {
  const title = cleanText(manifest.title || manifest.name, 120);
  log(`
Install ${title} (${cleanText(manifest.owner || manifest.author || "local", 64)}/${cleanText(manifest.name, 128)})`);
  log(`  source:   ${describe(spec)}`);
  log(`  deps:     npm ci --ignore-scripts from ${import_node_path7.default.basename(lock.file)} (${lock.packages} packages, all from registry.npmjs.org)`);
  log(`  build:    esbuild ${esbuild} (${ESBUILD})`);
  const prefs = [];
  for (const p of Array.isArray(manifest.preferences) ? manifest.preferences : []) prefs.push(p);
  for (const c of Array.isArray(manifest.commands) ? manifest.commands : []) for (const p of Array.isArray(c.preferences) ? c.preferences : []) prefs.push({ ...p, command: c.name });
  if (prefs.length) {
    log("  settings the extension declares:");
    for (const p of prefs) {
      const tags = [String(p.type || "textfield")];
      if (p.required) tags.push("required");
      if (p.type === "password") tags.push("secret");
      log(`    ${cleanText(p.name, 64)}${p.command ? " (" + cleanText(p.command, 64) + ")" : ""}: ${tags.join(", ")}`);
    }
  }
  log("  Extensions run with your full user privileges once launched: they can read and write your files, run programs and use the network.");
  if (yes) return;
  if (!process.stdin.isTTY) throw new Error("refusing to install without confirmation; pass --yes");
  if (!await askYes("Continue? [y/N] ")) throw new Error("install cancelled");
}
function pruneLegacyDownloads() {
  import_node_fs7.default.rmSync(import_node_path7.default.join(CACHE_DIR, "downloads"), { recursive: true, force: true });
  try {
    for (const n of import_node_fs7.default.readdirSync(CACHE_DIR)) if (n.startsWith("stage-")) import_node_fs7.default.rmSync(import_node_path7.default.join(CACHE_DIR, n), { recursive: true, force: true });
  } catch {
  }
}
async function installSpec(spec, yes) {
  pruneLegacyDownloads();
  const src = spec.kind === "local" ? spec.dir : fetchPinned(spec.url, spec.commit, spec.subdir, spec.kind === "git" ? spec.ref : void 0, log).src;
  const manifest = JSON.parse(import_node_fs7.default.readFileSync(import_node_path7.default.join(src, "package.json"), "utf8"));
  safeSegment(manifest.name, "extension name");
  safeSegment(manifest.owner || manifest.author || "local", "extension owner");
  const lock = checkLockfile(src);
  const esbuild = esbuildVersion();
  await confirmInstall(spec, manifest, lock, esbuild, yes);
  npmCi(src, log, { binLinks: spec.kind === "local" });
  const built = build(src, { lockfileSha256: lock.sha256, esbuildVersion: esbuild }, log);
  const id = `${built.owner}/${built.name}`;
  const record = {
    source: spec.kind,
    owner: built.owner,
    name: built.name,
    commit: spec.kind === "local" ? "" : spec.commit,
    apiVersion: spec.kind === "store" ? spec.apiVersion : "",
    installedAt: Date.now(),
    url: spec.kind === "local" ? "" : spec.url,
    subdir: spec.kind === "local" ? "" : spec.subdir || "",
    ref: spec.kind === "git" ? spec.ref || "" : "",
    lockfileSha256: lock.sha256,
    esbuildVersion: esbuild,
    nodeVersion: process.version
  };
  if (spec.kind === "store") record.storeUrl = spec.storeUrl;
  if (spec.kind === "git") record.origin = spec.url + (spec.subdir ? "#" + spec.subdir : "");
  if (spec.kind === "local") record.origin = spec.dir;
  atomicWrite(import_node_path7.default.join(built.dir, "install.json"), JSON.stringify(record, null, 2), 420);
  const origin = spec.kind === "store" ? { kind: "store", owner: spec.owner, name: spec.name, commit: spec.commit } : spec.kind === "git" ? { kind: "git", url: spec.url, ref: spec.ref, commit: spec.commit, subdir: spec.subdir } : { kind: "local", dir: spec.dir };
  setOrigin(id, origin);
  const idx = readIndex();
  const entry = entryFor(built.dir, built.owner, built.name, record);
  idx.extensions = idx.extensions.filter((e) => e.id !== entry.id).concat([entry]).sort((a, b) => a.id.localeCompare(b.id));
  writeIndex(idx);
  log(`Installed ${entry.title}: ${entry.commands.map((c) => c.title).join(", ")}`);
  if (entry.compat.status !== "full") log(`Compatibility: ${entry.compat.status} (${entry.compat.notes.join("; ")})`);
  const required = entry.preferences.filter((p) => p.required && p.default === void 0);
  if (required.length) log(`Needs configuration before first run: ${required.map((p) => p.title || p.name).join(", ")} \u2014 the launcher will ask.`);
  shell("reindex");
}
async function extInstall(specText, flags) {
  const spec = await resolveInstallSpec(specText, { ref: flags.ref, commit: flags.commit, subdir: flags.subdir }, log);
  await installSpec(spec, flags.yes);
}
async function extUpdate(specText, flags) {
  const idx = readIndex();
  const origins = readOrigins();
  const targets = specText ? idx.extensions.filter((e) => e.id === specText || e.name === specText) : idx.extensions;
  if (!targets.length) throw new Error("nothing to update");
  for (const e of targets) {
    const origin = origins[e.id];
    if (!origin) {
      log(`${e.id}: no recorded origin (installed by an older release); reinstall it once with 'launcher ext install'`);
      continue;
    }
    if (origin.kind === "store") {
      const meta = await lookup({ owner: origin.owner, name: origin.name });
      if (meta.commit === origin.commit) {
        log(`${e.id}: up to date`);
        continue;
      }
      log(`${e.id}: ${origin.commit.slice(0, 7)} \u2192 ${meta.commit.slice(0, 7)}`);
      await installSpec(storeSpec(meta), flags.yes);
    } else if (origin.kind === "git") {
      if (!origin.ref) {
        log(`${e.id}: pinned to ${origin.commit.slice(0, 12)}; nothing to update`);
        continue;
      }
      const commit = resolveRef(origin.url, origin.ref);
      if (commit === origin.commit) {
        log(`${e.id}: up to date`);
        continue;
      }
      log(`${e.id}: ${origin.commit.slice(0, 7)} \u2192 ${commit.slice(0, 7)}`);
      await installSpec({ kind: "git", url: origin.url, ref: origin.ref, commit, subdir: origin.subdir }, flags.yes);
    } else {
      log(`${e.id}: rebuilding from ${origin.dir}`);
      await installSpec({ kind: "local", dir: origin.dir }, flags.yes);
    }
  }
}
function extRemove(spec) {
  const idx = readIndex();
  const e = idx.extensions.find((x) => x.id === spec || x.name === spec);
  if (!e) throw new Error(`not installed: ${spec}`);
  const dir = import_node_path7.default.join(EXT_DIR, e.owner, e.name);
  assertInsideExtDir(dir);
  import_node_fs7.default.rmSync(dir, { recursive: true, force: true });
  idx.extensions = idx.extensions.filter((x) => x.id !== e.id);
  writeIndex(idx);
  deleteOrigin(e.id);
  log(`Removed ${e.id}`);
  shell("reindex");
}
function extList(json) {
  const idx = readIndex();
  if (json) {
    process.stdout.write(JSON.stringify(idx, null, 2) + "\n");
    return;
  }
  if (!idx.extensions.length) {
    log("No extensions installed. Try: launcher ext install thomas/hacker-news");
    return;
  }
  for (const e of idx.extensions) {
    log(`${e.id}  ${cleanText(e.title, 120)}  [${e.compat.status}]`);
    for (const c of e.commands) log(`    ${c.name.padEnd(28)} ${cleanText(c.title, 120)}  (${c.mode}${c.compat && c.compat.status !== "full" ? ", " + c.compat.status : ""})`);
  }
}
async function extSearch(query) {
  const hits = await search(query);
  if (!hits.length) {
    log("No results.");
    return;
  }
  for (const h of hits) {
    if (!h || typeof h !== "object") continue;
    const owner = cleanText(h.owner && h.owner.handle || h.author && h.author.handle || "?", 64);
    const mac = Array.isArray(h.platforms) && h.platforms.length === 1 && h.platforms[0] === "macOS" ? "  (macOS only)" : "";
    log(`${(owner + "/" + cleanText(h.name, 128)).padEnd(40)} ${cleanText(h.title, 120)}${mac}`);
  }
}
function handleUrl(uri) {
  const r = (0, import_launcher_url.parseLauncherUrl)(uri);
  if (r.method === "confetti") {
    (0, import_node_child_process3.spawnSync)("omarchy-notification-send", ["\u{1F389}", "Confetti!"]);
    return;
  }
  if (r.method === "toggle") {
    process.stdout.write(shell("toggle") + "\n");
    return;
  }
  process.stdout.write(shell(r.method, b64(r.payload)) + "\n");
}
function writeFile(flags) {
  const target = flags.args[0];
  if (!target || !import_node_path7.default.isAbsolute(target)) throw new Error("write-file needs an absolute path");
  const mode = flags.mode === void 0 ? 384 : parseInt(flags.mode, 8);
  if (!(mode === 384 || mode === 420)) throw new Error("write-file --mode must be 600 or 644");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(import_node_path7.default.basename(target))) throw new Error("write-file only writes plain .json names");
  import_node_fs7.default.mkdirSync(import_node_path7.default.dirname(target), { recursive: true, mode: 448 });
  const parent = import_node_fs7.default.realpathSync(import_node_path7.default.dirname(target));
  const allowed = [CONFIG_DIR, STATE_DIR].map((d) => {
    try {
      return import_node_fs7.default.realpathSync(d);
    } catch {
      return d;
    }
  });
  if (!allowed.some((d) => parent === d || parent.startsWith(d + import_node_path7.default.sep))) throw new Error(`write-file only writes under ${CONFIG_DIR} or ${STATE_DIR}`);
  const chunks = [];
  let total = 0;
  const buf = Buffer.alloc(65536);
  for (; ; ) {
    let n = 0;
    try {
      n = import_node_fs7.default.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === "EAGAIN") continue;
      if (e.code === "EOF") break;
      throw e;
    }
    if (n === 0) break;
    total += n;
    if (total > 1024 * 1024) throw new Error("write-file input exceeds 1 MiB");
    chunks.push(Buffer.from(buf.subarray(0, n)));
    if (buf.subarray(0, n).includes(10)) break;
  }
  const text = Buffer.concat(chunks).toString("utf8").split("\n")[0];
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("write-file expects one line of JSON on stdin");
  }
  if (!data || typeof data !== "object") throw new Error("write-file expects a JSON object");
  atomicWrite(import_node_path7.default.join(parent, import_node_path7.default.basename(target)), JSON.stringify(data, null, 2) + "\n", mode);
}
async function main(argv) {
  const [cmd, sub, ...rest] = argv;
  for (const d of [CONFIG_DIR, DATA_DIR, STATE_DIR, EXT_DIR]) import_node_fs7.default.mkdirSync(d, { recursive: true });
  import_node_fs7.default.mkdirSync(PREFS_DIR, { recursive: true, mode: 448 });
  switch (cmd) {
    case "ext": {
      if (sub === "install") {
        const f = parseFlags(rest);
        if (!f.args.length) throw new Error("ext install needs a spec");
        for (const s of f.args) await extInstall(s, f);
        return;
      }
      if (sub === "update") {
        const f = parseFlags(rest);
        await extUpdate(f.args[0], f);
        return;
      }
      if (sub === "build") {
        const f = parseFlags(rest);
        await extInstall(f.args[0] || ".", f);
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
        log(`${idx.extensions.length} extension(s)`);
        shell("reindex");
        return;
      }
      if (sub === "prefs") {
        process.stdout.write(shell("open", b64({ command: "cmd:preferences", arguments: { extension: rest[0] } })) + "\n");
        return;
      }
      break;
    }
    case "open":
      process.stdout.write(shell("open", b64(sub ? JSON.parse(sub) : {})) + "\n");
      return;
    case "run":
      process.stdout.write(shell("run", sub) + "\n");
      return;
    case "menu":
      process.stdout.write(shell("menu", sub || "root") + "\n");
      return;
    case "toggle":
      process.stdout.write(shell("toggle") + "\n");
      return;
    case "url":
      handleUrl(sub);
      return;
    case "write-file":
      writeFile(parseFlags([sub, ...rest].filter((x) => x !== void 0)));
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
