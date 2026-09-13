# Omarchy Launcher

A Raycast-style launcher that runs *inside* the Omarchy shell as a native
plugin: one hotkey, one search field, apps and commands ranked by how you use
them, a keyboard-first UI that follows your Omarchy theme, and a runtime that
runs extensions from the Raycast Store.

![Launcher](preview.png)

## What it does

**Root search** — applications, commands, quicklinks, snippets, script
commands, open windows, extension commands, and every action of the stock
Omarchy menu (with its breadcrumb) in one list. Ranking follows the stock
menu's rules (prefix › word-boundary › substring › acronym) plus aliases,
favorites, and usage history (frecency). The empty field shows Suggestions
from your recent use. Type an expression and the calculator answers inline
(`2*(3+4)^2 to hex`, `15% of 80`, `10 km in mi`, `72f to c`); when nothing
matches well, fallback quicklinks offer to search the web with what you typed.

**Built-in commands** (all searchable; each can get an alias, a global hotkey,
and a favorite flag from Preferences or the Ctrl+K action panel):

| Command | What it does |
|---|---|
| Clipboard History | The shell's own clipboard history with a preview pane, pins, paste/copy/open/delete |
| Search Snippets / Create Snippet | Text snippets with `{clipboard}` `{date}` `{time}` `{uuid}` `{cursor}` `{argument name="x"}` placeholders; paste or copy |
| Search Quicklinks / Create Quicklink | URLs with a `{query}` placeholder (Google, GitHub, Arch Wiki, … seeded); also root fallbacks |
| Search Emoji & Symbols | Grid of emoji plus common symbols and kaomoji; recents first |
| Window management | Left/Right/Top/Bottom Half, Thirds, Quarters, Center, Maximize, Almost Maximize, Reasonable Size, Fullscreen, Tile, Float, Pin, Move to Display/Workspace, Scratchpad, Close, Close Others — as individual commands, so each can be bound |
| Switch Windows | Focus, close, float, or pull any open window to the current workspace |
| System | Lock, Sleep, Hibernate, Log Out, Restart, Shut Down, Screensaver, Trash, Night Light, Do Not Disturb, Stay Awake, Toggle Bar, volume/mute/mic, media keys, brightness, Wi-Fi, Bluetooth, theme and background switching, gaps/transparency toggles, Restart Shell, Update Omarchy, Text Size, Keybindings |
| Kill Process | Live process table sorted by CPU or memory |
| Search Files | `fd` over your home (skips FUSE mounts), preview pane, open / reveal / terminal / copy path / trash |
| Run Shell Command | Enter runs in a floating terminal, Ctrl+Enter runs quietly and shows the output |
| Floating Notes / Search Notes / New Note | An always-on-top Markdown notepad that outlives the launcher; notes are files under the state dir |
| Start/Stop Focus Session | Countdown with optional Do Not Disturb, a bar countdown, and a notification at the end |
| Set Reminder / Show Reminders | `omarchy reminder` with a form ("15", "1h", or "14:30") |
| Pick Color / Color History | `hyprpicker`, then HEX/RGB/HSL/QML formats from a grid of swatches |
| Take Screenshot / Screenshot Window / Full Screen, Capture Text (OCR), Scan QR Code, Record Screen | The Omarchy capture tools, reachable without a PRINT key |
| Omarchy Menu | The stock menu tree, browsable, with its `when:`/`checked:` guards |
| Launcher Preferences | Hotkey, per-command alias/hotkey/favorite/enable, file-search scope, calculator, extension preferences |

**Raycast extensions.** `launcher ext install <owner/name>` downloads the
prebuilt bundle straight from the Raycast Store (no Node toolchain needed for
installs) and its commands appear in root search. The runtime is a Node
sidecar that renders the extension's React tree natively through the same
view model the built-ins use: lists with sections, accessories and detail
panes, grids, forms, detail pages with metadata, action panels with
shortcuts, toasts, alerts, dropdown accessories, navigation, LocalStorage,
Cache, preferences (with a form for required ones), Clipboard, `open`, OAuth
(PKCE with the `raycast://` redirect), and Hyprland-backed WindowManagement.
Extensions that call AppleScript or ship macOS binaries are flagged at
install time. Menu-bar commands and `AI.ask` are not wired up yet.

**Keyboard.** Raycast's ⌘ is Ctrl here. `↑`/`↓` or `Ctrl+P`/`Ctrl+N` move,
`Enter` primary action, `Ctrl+Enter` secondary, `Ctrl+K` action panel,
`Tab` autocompletes the top result, `Ctrl+U` clears, `Esc`/`Backspace` go
back, `Ctrl+,` preferences, `Ctrl+Shift+,` configure the selected command,
`Ctrl+Shift+F` favorite, `Ctrl+Shift+C` copy, `Alt+↑/↓` cycle a dropdown
accessory, `Ctrl+Enter` submits a form. Per-action shortcuts declared by
extensions work with Ctrl in place of ⌘.

## Install

```bash
omarchy plugin add https://github.com/hominluo/omarchy-launcher.git
bash ~/.config/omarchy/plugins/io.github.hominluo.launcher/setup.sh
```

`setup.sh` enables the plugin, creates its config/state directories, and adds
a `SUPER + D` binding to `~/.config/hypr/bindings.lua` inside a marker block
(a timestamped backup of the file is written first). Pick another key with
`--hotkey "SUPER + R"`, change it later from Launcher Preferences, or skip
the binding with `--no-hotkey` and bind it yourself:

```lua
o.bind("SUPER + D", "Launcher", "omarchy-shell shell toggle io.github.hominluo.launcher")
```

A bar button appears next to the Omarchy menu icon (left click opens the
launcher, right click the Omarchy menu; the tooltip shows the hotkey and the
icon lights up while the launcher is open). To keep the launcher without the
button, move its entry from `bar.layout` to `plugins` in
`~/.config/omarchy/shell.json`:

```json
"plugins": [{ "id": "io.github.hominluo.launcher" }]
```

### Extensions

Extensions need Node.js 22 or newer (`omarchy pkg add nodejs npm`). Then:

```bash
launcher ext search github
launcher ext install thomas/hacker-news     # owner/name from the store URL
launcher ext list
launcher ext update                         # every store extension
launcher ext remove thomas/hacker-news
```

Extensions can also be built from source, which needs `npm` (the build uses
the esbuild that ships with `@raycast/api`): a local checkout, any git URL
(`#subdir` optional), or a folder of the official repo, e.g.
`launcher ext install https://github.com/raycast/extensions/tree/main/extensions/hacker-news`.

`launcher` lives in `bin/` of the plugin; add it to your `PATH` or call it
by path. Extensions land in `~/.local/share/omarchy-launcher/extensions/`,
their data in `…/support/`, their preferences in
`~/.config/omarchy-launcher/prefs/`. `raycast://extensions/<owner>/<name>/<command>`
deeplinks are handled by `launcher url <uri>` (register it as the
`x-scheme-handler/raycast` handler if you want browsers to open them).

## Using it from scripts

```bash
omarchy-shell shell toggle io.github.hominluo.launcher              # toggle
omarchy-shell shell toggle io.github.hominluo.launcher '{"query":"vol"}'
omarchy-shell shell toggle io.github.hominluo.launcher '{"command":"clipboard"}'
omarchy-shell io.github.hominluo.launcher run cmd:wm-left-half       # run a command by id
omarchy-shell io.github.hominluo.launcher open "$(printf '%s' '{"query":"a,b"}' | base64 -w0)"
omarchy-shell io.github.hominluo.launcher status
```

Payloads with commas must go through the base64 `open` route: the shell's IPC
splits arguments on commas. Command ids are visible in Preferences ›
Commands ("Copy Deeplink" in any action panel copies a ready-made call).

## Script Commands

Drop Raycast-format scripts into `~/.config/omarchy-launcher/scripts/`
(or add folders under `scriptDirs` in `settings.json`); `examples/scripts/`
has two to start from:

```bash
#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Uptime
# @raycast.mode inline
# @raycast.refreshTime 1m
# @raycast.packageName System
# @raycast.icon ⏱️
uptime -p
```

Modes `silent`, `compact` (toast), `fullOutput` (streamed page), and
`inline` (result shown as the row's subtitle) work; `argument1..3` become a
form; `needsConfirmation` asks first. AppleScript scripts are listed as
macOS-only.

## Files

| Path | Purpose |
|---|---|
| `~/.config/omarchy-launcher/settings.json` | `hotkey`, per-command overrides (`commands`), `fileSearchRoots`, `fileSearchExcludes`, `fileSearchHidden`, `calculator.angle`, `scriptDirs` |
| `~/.config/omarchy-launcher/{snippets,quicklinks}.json` | Your snippets and quicklinks (edited by the launcher, hand-editable) |
| `~/.config/omarchy-launcher/prefs/*.json` | Extension preferences (mode 0600) |
| `~/.local/state/omarchy-launcher/` | Frecency, clipboard pins, notes, colors, focus state, emoji recents |
| `~/.local/share/omarchy-launcher/` | Installed extensions, their support data, OAuth tokens |

All of them hot-reload; hand edits apply without restarting the shell.

## Development

```bash
git clone https://github.com/hominluo/omarchy-launcher.git ~/.config/omarchy/plugins/io.github.hominluo.launcher
omarchy-shell shell rescanPlugins
omarchy plugin enable io.github.hominluo.launcher --after omarchy.menu
npm test                      # unit tests for lib/*.js (node --test)
omarchy plugin validate .     # the manifest checks the shell enforces
omarchy restart shell         # after QML changes: the window is kept loaded, so hot reload does not re-instantiate it
```

The extension runtime and the CLI are TypeScript under `packages/`; their
bundles in `runtime/` are committed because the plugin installer never runs
code. Rebuild with `npm run build` in `packages/ext-host` and `packages/cli`
(dependencies install with `bin-links=false` so the plugin folder stays free
of symlinks, which the validator forbids). `packages/ext-host/test/harness.js
<extensionDir> <command>` drives the sidecar without the shell. A hidden
"Dev: Render Fixture" command renders the view-model fixtures in
`tests/fixtures/`.

Logs: `journalctl --user -t omarchy-shell -f` (extension output is prefixed
with the extension id).

Layout: `Service.qml` is the headless core (index, ranking, state files, IPC,
built-ins, extension host), `Launcher.qml` owns the window, `ui/` holds the
renderers, `builtins/` the commands, `lib/` the pure JS shared with the
tests, `data/` the command catalogs and the Raycast-icon glyph map, `ext/`
the sidecar bridge, `bin/` helper scripts.

## Requirements

Omarchy 4.x (Quickshell shell). Node.js 22+ only for extensions.

## License

MIT — see [LICENSE](LICENSE).
