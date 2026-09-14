# Omarchy Launcher

A Raycast-style launcher that runs *inside* the Omarchy shell as a native
plugin: one hotkey, one search field, apps and commands ranked by how you use
them, a keyboard-first UI that follows your Omarchy theme, and a runtime that
runs extensions from the Raycast Store.

![Launcher](preview.png)

## What it does

**The default page** (empty search field) is four sections, Raycast's root
with the Omarchy menu folded in:

| Section | Rows |
|---|---|
| Favorites | The commands you pinned (`Ctrl+Shift+F`), in your order (`Ctrl+Shift+↑/↓`); hidden until you pin something; "Edit" in the header opens Preferences › Favorites |
| Suggestions | Your most-used entries by frecency, at most 5 (fewer when favorites take the space, so the personal rows stay above the fold) |
| Omarchy | The stock menu's root — Apps, Learn, Trigger, Style, Setup, Install, Remove, Update, About, System — with a preview of each submenu; `Enter` or `→` opens it as a nested list, `Backspace`/`←` comes back |
| Commands | Everything else A–Z with a type label (Application, Command, System, Window, Quicklink, Snippet, Script, AI, or the extension's name); "Install Extensions…" and "Set Up AI…" rows appear here only until you have done so |

**Root search** — typing collapses the page into one ranked list:
applications, commands, quicklinks, snippets, script commands, open windows,
extension commands, the Omarchy categories (`settings` → Setup, `uninstall` →
Remove, `power-menu` → System, exactly like `omarchy menu summon`) and every
action of the stock menu with its breadcrumb. Ranking follows the stock
menu's rules (prefix › word-boundary › substring › acronym) plus aliases,
favorites, and usage history (frecency); `Ctrl+Shift+R` resets an entry's
ranking, `Ctrl+Shift+D` disables it. Some things the typed text *is* get an
inline row: an expression (`2*(3+4)^2 to hex`, `15% of 80`, `10 km in mi`,
`72f to c`, `ans*2`), a URL or domain (`github.com/raycast` → Open in
Browser), a colour (`#ff8000`, `rgb(255,128,0)`, `hsl(30,100%,50%)` → swatch
with HEX/RGB/HSL/QML copies), a path (`~/Doc`, `/usr/sh` → files and folders
there), and `alias text` runs a quicklink, script, or extension command that
takes an argument with `text` filled in. When nothing matches well, a
"Files" section shows the best-ranked files for the words you typed and the
fallback commands (quicklinks with `{query}`, Search Files, Ask AI, Run
Shell Command, Search Snippets, scripts with an argument; pick and order
them from "Edit" on the fallback header or Preferences › Fallback Commands)
offer to take the query.

**Omarchy menu parity.** Every stock row is here: submenus hide when their
`when:` guards leave nothing visible, `checked:` rows show a ✓ and stay open
while they toggle, provider submenus (Style › Font, power profiles) enumerate
live, typing inside a category ranks that level and adds an "Inside <Label>"
section of everything beneath it, and `omarchy-shell io.github.hominluo.launcher
menu settings` (or `launcher menu style.font`) opens a category by id or
alias. The Apps category is the launcher's own browser (Recently Used, then
A–Z) with Open / Copy Name / .desktop actions such as "New Private Window" /
Hide / Uninstall (`Delete`) on every row.

**Built-in commands** (all searchable; each can get an alias, a global hotkey,
and a favorite flag from Preferences or the Ctrl+K action panel):

| Command | What it does |
|---|---|
| Clipboard History | The shell's own clipboard history with a preview pane, pins, paste/copy/open/delete |
| Search Snippets / Create Snippet | Text snippets with `{clipboard}` `{selection}` `{date}` `{time}` `{uuid}` `{cursor}` `{argument name="x"}` placeholders (arguments without a default are asked for in a form); paste or copy |
| Search Quicklinks / Create Quicklink | URLs with a `{query}` placeholder (Google, GitHub, Arch Wiki, … seeded); also root fallbacks |
| Search Emoji & Symbols | Grid of emoji plus common symbols and kaomoji; recents first |
| Window management | Left/Right/Top/Bottom Half, Thirds, Quarters, Center, Maximize (also Height/Width only), Almost Maximize, Reasonable Size, Restore Previous Size, Move Up/Down/Left/Right, Fullscreen, Tile, Float, Pin, Move to Display, Move to Workspace 1–9 / Next / Previous, Switch to Next/Previous Workspace, Scratchpad (Minimize), Close, Close Others — as individual commands, so each can be bound |
| Switch Windows | Focus, close, float, or pull any open window to the current workspace |
| System | Lock, Sleep, Hibernate, Log Out, Restart, Shut Down, Screensaver, Trash, Show Desktop, Night Light, Do Not Disturb, Stay Awake, Toggle Bar, Crash Capture, Screensaver, Workspace Layout, 1-Window Ratio, Battery Percentage, Touchpad, Touchscreen, Laptop Display, Mirror Display, Hybrid GPU (each toggle shows a ✓ for its current state), volume up/down/mute/set to 0–100%, mic, media keys, brightness, Wi-Fi, Bluetooth, network and disk speed tests, theme and background switching, gaps/transparency toggles, Restart Shell, Update Omarchy, Text Size, Keybindings |
| Kill Process | Live process table sorted by CPU or memory |
| Search Files / Search File Contents | `fd` over your home ranked for relevance (exact and prefix names first, project folders over toolchain and SDK noise, recent files up), size and modification time in the preview, a names / contents switch (`Alt+↓`) that runs `ripgrep` and shows the matching lines, "Recently Modified" when the field is empty; open / reveal / terminal / editor / copy path / copy file / trash |
| Run Shell Command | Enter runs in a floating terminal, Ctrl+Enter runs quietly and shows the output |
| Floating Notes / Search Notes / New Note | An always-on-top Markdown notepad that outlives the launcher; notes are files under the state dir |
| Start/Stop Focus Session | Countdown with optional Do Not Disturb, a bar countdown, and a notification at the end |
| Set Reminder / Show Reminders | `omarchy reminder` with a form ("15", "1h", or "14:30") |
| Pick Color / Color History | `hyprpicker`, then HEX/RGB/HSL/QML formats from a grid of swatches |
| Take Screenshot / Screenshot Window / Full Screen, Capture Text (OCR), Scan QR Code, Record Screen | The Omarchy capture tools, reachable without a PRINT key |
| Omarchy Menu | The stock menu tree, browsable ("Go…"), with its `when:`/`checked:` guards, providers, and per-level search |
| Favorites / Fallback Commands | Reorder or remove pinned rows; choose what a query is handed to when nothing matches |
| Launcher Preferences | Hotkey, Default Page (sections, suggestion count, placeholder, search history), per-command alias/hotkey/favorite/enable, file-search scope, calculator, AI providers, extension preferences |

**Raycast extensions.** `launcher ext install <owner/name>` downloads the
prebuilt bundle straight from the Raycast Store (no Node toolchain needed for
installs) and its commands appear in root search. The runtime is a Node
sidecar that renders the extension's React tree natively through the same
view model the built-ins use: lists with sections, accessories and detail
panes, grids, forms, detail pages with metadata, action panels with
shortcuts, toasts, alerts, dropdown accessories, navigation, LocalStorage,
Cache, preferences (with a form for required ones), Clipboard, `open`, OAuth
(PKCE with the `raycast://` redirect), Hyprland-backed WindowManagement,
menu-bar commands (persistent sessions shown as bar buttons), and `AI.ask`
through the configured provider. Commands that declare `arguments` prompt
for them in a form, or take the text after their alias as the first one.
Extensions that call AppleScript or ship macOS binaries are flagged at
install time.

**Keyboard.** Raycast's ⌘ is Ctrl here. `↑`/`↓` or `Ctrl+P`/`Ctrl+N` move,
`Ctrl+↑/↓` jump between sections, `Alt+1`…`Alt+9` run the n-th visible row,
`Enter` primary action, `Ctrl+Enter` secondary, `Ctrl+K` action panel,
`→` opens a menu row (or the selected row when the field is empty), `←`
goes back, `Tab` autocompletes the selected row (a second `Tab` runs it),
`↑` on the first row recalls earlier queries (`↓` walks forward, `Esc`
restores what you typed), `Ctrl+U` clears, `Esc`/`Backspace` go back,
`Ctrl+,` preferences, `Ctrl+Shift+,` configure the selected command,
`Ctrl+Shift+F` favorite, `Ctrl+Shift+↑/↓` reorder favorites,
`Ctrl+Shift+R` reset ranking, `Ctrl+Shift+D` disable, `Delete` uninstall an
application, `Ctrl+Shift+C` copy, `Alt+↑/↓` cycle a dropdown accessory,
`Ctrl+Enter` submits a form. Per-action shortcuts declared by extensions
work with Ctrl in place of ⌘. The window holds exclusive keyboard focus, so
these chords win over Hyprland binds while it is open.

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
omarchy-shell io.github.hominluo.launcher menu settings              # an Omarchy category by id or alias
omarchy-shell shell toggle io.github.hominluo.launcher '{"menu":"style.font"}'
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
| `~/.config/omarchy-launcher/settings.json` | `hotkey`, per-command overrides (`commands`), `favoritesOrder`, `fallbackCommands`, `favoritesSection.show`, `suggestionsSection.show`, `suggestionsCap`, `omarchySection.{show,apps}`, `commandsSection.{show,apps}`, `rootPlaceholder`, `searchHistory.enabled`, `fileSearchRoots`, `fileSearchExcludes`, `fileSearchHidden`, `calculator.angle`, `scriptDirs`, `menuBarCommands` |
| `~/.config/omarchy-launcher/{snippets,quicklinks}.json` | Your snippets and quicklinks (edited by the launcher, hand-editable) |
| `~/.config/omarchy-launcher/prefs/*.json` | Extension preferences (mode 0600) |
| `~/.local/state/omarchy-launcher/` | Frecency, search history, clipboard pins, notes, colors, focus state, emoji recents |
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

## Not there yet

- The stock menu's dmenu-style `select`/`input` modes (`omarchy-menu-select`,
  `omarchy-menu-input`) still open the stock menu; scripts call it directly.
  The launcher will accept the same payload
  (`{"mode":"select","prompt":…,"options":[…],"selectionFile":…,"doneFile":…}`)
  once those scripts can be pointed at it.
- Raycast's compact window mode, currency and date arithmetic in the
  calculator, system-wide snippet expansion, and Quick Look.
- AI chat history, Skills, and MCP tools for the AI layer.

## Requirements

Omarchy 4.x (Quickshell shell). Node.js 22+ only for extensions.

## License

MIT — see [LICENSE](LICENSE).
