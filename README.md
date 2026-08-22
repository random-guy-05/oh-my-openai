# Oh My OpenAI — A Community Rebuild of Codex

Oh My OpenAI is a readable, inspectable side-by-side rebuild of the Codex
desktop runtime and launcher for macOS. It packages the **stock** official
Codex runtime with a launcher that starts bundled **enhancement services**
(an OpenAI-compatible gateway dashboard, more to come) — no app-bundle
patches, nothing to re-apply when upstream updates.

## Quick Install (Homebrew)

**One-liner:**

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

Or if you'd like to tap for easier upgrades:

```sh
brew tap random-guy-05/oh-my-openai https://github.com/random-guy-05/oh-my-openai.git
brew install --cask codex-desktop
```

The cask downloads the latest DMG, installs `Codex.app` to `/Applications`,
strips the Gatekeeper quarantine (the build is ad-hoc signed), and opens the
app automatically. On first launch the launcher extracts its private runtime
from the embedded payload, starts the bundled enhancements, and opens Codex.

To update to a new release:

```sh
brew upgrade --cask codex-desktop
```

To uninstall (removes the app and all private runtime data):

```sh
brew uninstall --zap --cask codex-desktop
```

> **Note:** The tap URL is explicit because the repository is not prefixed
> with `homebrew-`. This is intentional — the cask lives alongside the build
> scripts in the same repo.

## Current build (26.803.41515)

- **Stock runtime**: the runtime payload is the official OpenAI Intel app,
  uniquely identified (`io.haleclipse.codexdesktop.runtime`) and isolated
  under `~/Library/Application Support/CodexDesktop-Rebuild/`. No bundle
  patches.
- **Enhancements layer**: the launcher starts bundled services before Codex
   and stops them cleanly on quit — including raw SIGTERM/SIGINT/SIGHUP.
   Command-line tools are staged alongside and invoked with
    `node scripts/enhancement-tool.js <Codex.app> <id>`; web dashboards open
    inside the command center's WKWebView and native apps use the isolated
    `CODEX_HOME` environment.
- **Native command center**: a menu bar item (square-grid icon) lists every
   enhancement — opencodex gateway (in-app window or browser), NerfTrack usage
    dashboard, and Codex Web GPT — plus **Enhancements Settings…**: one
  native window with an enable toggle, status, **view selector**, and Open
  button per feature. Choices persist in NSUserDefaults.
- **opencodex** (service, `http://127.0.0.1:10100`) — local OpenAI-compatible
  gateway with model passthrough and custom-provider routing
  (config: `~/.codex/opencodex.config.toml`).
- **nerftrack** (native app) — full local usage, quota, diagnostics, history,
  and API-equivalent value dashboard.

The bundled NerfTrack release is distributed under its upstream GPL-3.0-only
license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **codex-chatgpt-web** (launcher-managed service + in-app web dashboard) —
  the upstream loopback ChatGPT Web bridge runs as a hidden local service,
  while the command-center menu opens a local Codex Web GPT dashboard in the
  existing WKWebView. The dashboard exposes bridge health, diagnostics, setup
  status, and a same-window ChatGPT Web link; no second app is launched.

## Quick summary
- Name: Oh My OpenAI (side-by-side rebuild of Codex)
- Platform focus: mac-x64 (Intel); launcher compiled as x86_64
- Purpose: stock Codex plus launcher-managed enhancement services, packaged
  and distributed as a single app

---

## What makes this different

1) **No patch pipeline**
   The runtime is byte-for-byte the official app (renamed bundle id and
   executable for side-by-side isolation). Upstream updates can never break
   customizations — there are none to re-apply. The previous patch system
   (chat presets, custom-providers UI, resource-saver, feature gates) was
   removed entirely in favor of this setup.

2) **Enhancements live outside the app bundle**
   Services are staged into `Contents/Resources/enhancements/` at build time
   by `scripts/bundle-enhancements.js` (npm sources declared in
   `enhancements/manifest.json`, arch-verified, sha256-recorded) and are
   started by the launcher before Codex launches. They never modify the
   runtime.

3) **Clean lifecycle**
   Enhancements are tracked by PID; quitting the app (or sending
   SIGTERM/SIGINT/SIGHUP) stops them. Per-service logs live in
   `~/Library/Application Support/CodexDesktop-Rebuild/enhancements/`.

4) **Isolated runtime**
   The launcher installs a fingerprinted private runtime under
   `~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`, keeping
   CODEX_HOME and profile data isolated from the official app.

---

## Files to inspect (where the magic lives)

- `launcher/CodexLauncher.m` — Objective-C launcher: enhancement lifecycle,
  private-runtime install, isolated profile, URL scheme
- `enhancements/manifest.json` — source manifest of bundled enhancements
- `scripts/bundle-enhancements.js` — stages enhancement packages into the
  wrapper and writes the effective manifest (fail-closed)
- `scripts/build-side-by-side-mac.js` — wrapper build: launcher compile,
  payload embed, enhancement bundling, signing, DMG
- `scripts/build-from-upstream.js` — standard (non-side-by-side) build
- `scripts/sync-upstream.js` — upstream sync (appcast download or
  `--installed-x64` snapshot of `/Applications/ChatGPT.app`)
- `scripts/install-verified-side-by-side.js` — verified installer for the
  built side-by-side app

---

## Quick build

From the installed official app (fastest):

```bash
npm ci
node scripts/build-side-by-side-mac.js --runtime /Applications/ChatGPT.app
```

Standard pipeline:

```bash
npm run sync:installed:x64    # snapshot the installed official app
npm run build:mac-x64         # standard runtime + DMG
npm run build:side-by-side:x64
```

Outputs land in `out/`: the wrapper app (`out/side-by-side-mac-x64/Codex.app`)
and the DMG (`out/Codex-side-by-side-mac-x64-<version>.dmg`). See
`CUSTOM_BUILD.md` for details.

Before packaging, run the local release checks:

```bash
npm test
npm run doctor
```

`doctor` validates the enhancement manifest. To validate a built app's staged
commands as well, pass it explicitly:

```bash
node scripts/verify-enhancements.js --app out/side-by-side-mac-x64/Codex.app
```

---

## Runtime & install paths
- Isolated runtime path: `~/Library/Application Support/CodexDesktop-Rebuild/`
  (the launcher installs `Codex.app` inside this folder)
- Enhancement logs: `~/Library/Application Support/CodexDesktop-Rebuild/enhancements/`
- opencodex dashboard: `http://127.0.0.1:10100`

## Manual Installation

Download the DMG from the [latest release](https://github.com/random-guy-05/oh-my-openai/releases),
open it, and drag **Codex** to Applications. The build is ad-hoc signed and
not notarized, so first launch may require Control-click → Open and a
Keychain Always Allow approval.

## License

Oh My OpenAI is released under the MIT license.

---

## Contributing
- Add services by declaring them in `enhancements/manifest.json` (npm source,
  start command, port); the bundler verifies the binary at build time.
- Keep the launcher compiling with `-Wall -Wextra -Wpedantic -Werror` — the
  build treats warnings as errors.
