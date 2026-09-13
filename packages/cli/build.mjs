import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import path from "node:path"
const here = path.dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile: path.resolve(here, "../../runtime/cli.js"),
  bundle: true, platform: "node", target: "node22", format: "cjs", minify: false, legalComments: "none",
  banner: { js: "#!/usr/bin/env node\n/* Omarchy Launcher CLI — built from packages/cli; do not edit. */" },
  logLevel: "info"
})
