// Bundles the sidecar into two committed files under runtime/:
//   ext-host.js  — the launcher's own code (main thread + worker), unminified
//   vendor.js    — react, react-reconciler, scheduler, minified
// Keeping React out of ext-host.js keeps that file small enough to review
// (and under the marketplace's 512 KiB per-file scan limit).
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const runtime = path.resolve(here, "../../runtime")
const VENDORED = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-reconciler", "react-reconciler/constants", "scheduler"]

// Rewrites `import x from "react"` (and the require() calls in
// patch-require.ts) to reads from runtime/vendor.js, located next to the
// bundle at run time so worker threads and the main thread share one copy.
const vendorPlugin = {
  name: "vendor-react",
  setup(b) {
    const filter = new RegExp("^(" + VENDORED.map((n) => n.replace(/[/-]/g, "\\$&")).join("|") + ")$")
    b.onResolve({ filter }, (args) => ({ path: args.path, namespace: "vendor" }))
    b.onLoad({ filter: /.*/, namespace: "vendor" }, (args) => ({
      contents: `module.exports = require(require("node:path").join(__dirname, "vendor.js"))[${JSON.stringify(args.path)}]`,
      loader: "js"
    }))
  }
}

await build({
  entryPoints: [path.join(here, "src/vendor-entry.cjs")],
  outfile: path.join(runtime, "vendor.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "/* Omarchy Launcher extension host vendor bundle: react 19.3.0, react-reconciler 0.34.0, scheduler (production builds, minified). Built by packages/ext-host/build.mjs; do not edit. */" },
  logLevel: "info"
})

await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile: path.join(runtime, "ext-host.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: "linked",
  minify: false,
  legalComments: "none",
  plugins: [vendorPlugin],
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "#!/usr/bin/env node\n/* Omarchy Launcher extension host — built from packages/ext-host; do not edit. React lives in vendor.js. */" },
  logLevel: "info"
})
