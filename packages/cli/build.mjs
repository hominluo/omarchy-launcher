// Builds runtime/cli.js. `--check` rebuilds in memory and fails when the
// committed bundle differs from what the sources produce.
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import path from "node:path"
const here = path.dirname(fileURLToPath(import.meta.url))
const check = process.argv.includes("--check")
const outfile = path.resolve(here, "../../runtime/cli.js")
const result = await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile,
  bundle: true, platform: "node", target: "node22", format: "cjs", minify: false, legalComments: "none",
  banner: { js: "#!/usr/bin/env node\n/* Omarchy Launcher CLI — built from packages/cli; do not edit. */" },
  logLevel: check ? "warning" : "info",
  write: !check
})
if (check) {
  const fresh = Buffer.from(result.outputFiles[0].contents)
  if (!fresh.equals(fs.readFileSync(outfile))) { console.error(`${outfile} does not match the sources; run: node packages/cli/build.mjs`); process.exit(1) }
  console.log(`${outfile} matches the sources`)
}
