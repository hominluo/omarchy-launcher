# Changelog

## 1.0.3 — 2026-09-18

Security hardening after the second marketplace review.

- **Store installs are built here from the pinned commit.** The store's
  prebuilt zip (an unsigned download with no digest) is no longer installed;
  the CLI fetches `raycast/extensions` at the exact `commit_sha` the store
  lists, verifies the checkout is at that commit, requires a committed
  lockfile whose every package is a registry.npmjs.org tarball with an
  integrity hash, runs `npm ci --ignore-scripts` with every relevant npm
  setting pinned on the command line, and bundles with the system
  `/usr/bin/esbuild`. Git installs are pinned the same way (`#<sha>`,
  `--commit`, or a ref resolved once and printed). Provenance lands in
  `install.json`; origins live in `origins.json`, written only by the CLI,
  so `ext update` never trusts a file the extension can rewrite.
- The CLI asks before building: source, lockfile, toolchain, declared
  settings (secrets marked) and the reminder that extensions run with your
  full privileges (`--yes` to skip). Native `.node` addons are refused.
- `omarchy-launcher://` is the only URL scheme handled; `raycast://` and
  `com.raycast://` registrations are removed on setup. A link may open a
  view or fill the search box; extension launches and quicklinks show a
  confirmation card (Cancel by default) with the arguments matched against
  the command's declared ones; catalog commands are never executed from a
  link. OAuth callbacks need a non-empty state; the redirect URL is now
  `omarchy-launcher://oauth?package_name=Extension`.
- Extension-supplied targets (`open`, `showInFinder`, `trash`, Open
  actions, detail links) go to programs as argument vectors — web, mail and
  existing local paths only — never through `bash -lc`; window addresses
  and bounds are validated before `hyprctl`; OAuth `providerId` is
  sanitized before it names a token file.
- Everything an extension renders is bounded (rows, sections, text,
  markdown, actions, form fields, one frame ≤ 8 MiB — an oversized frame
  ends the session with a reason); remote images are fetched by the sidecar
  (2 MiB, sniffed PNG/JPEG/GIF/WebP, cached 0600) and loaded from disk;
  markdown images that point at the network become links; the shell never
  fetches a URL an extension chose. Script Command output is capped and
  rendered on a timer; toasts, HUD and search text are bounded; AI
  responses are cut at 1 MiB.
- Extension preferences and provider keys are written by
  `launcher write-file` (0600 from creation, atomic, never through a link)
  instead of a shell redirect; quicklinks, snippets, emoji recents and
  focus state use atomic writes; `bindings.lua` is written atomically and
  old backups are pruned; `settings.json` and the `.desktop` handler are
  written through temp files; `wm.sh` requires `XDG_RUNTIME_DIR` and
  validates window addresses.
- `assertInsideExtDir` resolves symlinks; the index skips symlinked or
  oddly named directories and lists only plainly named commands, tools and
  icons; store responses are size-capped, validated and control-character
  stripped. `node packages/<pkg>/build.mjs --check` verifies the committed
  bundles match the sources.

- After review: `open(target, application)` accepts the `.desktop` path
  `getApplications()` hands out and falls back to the default handler for
  an unusable app id instead of blocking the target; image sources, link
  targets and quick-look paths get a URL-sized cap rather than the label
  cap; `open?view=shell` and `notes-new` never open from a link; a launch
  that first asks for a required setting keeps its arguments; installing
  from a local checkout keeps that checkout's bin links; only definitive
  image failures are remembered for the session; `setup.sh` leaves a
  `settings.json` it cannot parse alone; window addresses are accepted with
  or without the `0x` prefix.

## 1.0.2 — 2026-09-17

Validate install directory names; stop trusting pathnames twice
(`atomicWrite`, `safeSegment`, `assertInsideExtDir`).

## 1.0.1 — 2026-09-14

Split the sidecar bundle into `ext-host.js` and `vendor.js`.

## 1.0.0 — 2026-09-14

First release.
