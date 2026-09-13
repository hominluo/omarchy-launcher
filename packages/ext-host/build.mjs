// Bundles the sidecar (main thread + worker in one file) into runtime/ext-host.js.
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, "../../runtime/ext-host.js")

await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile: out,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: "linked",
  minify: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "#!/usr/bin/env node\n/* Omarchy Launcher extension host — built from packages/ext-host; do not edit. */" },
  logLevel: "info"
})
