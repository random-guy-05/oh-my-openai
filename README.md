# Oh My OpenAI — A Community Rebuild of Codex

Oh My OpenAI is a readable, inspectable side-by-side rebuild of the Codex
desktop runtime and launcher for macOS. It packages the **stock** official
Codex runtime with a launcher that starts bundled **enhancement services**
(an OpenAI-compatible gateway and ChatGPT Web bridge). A narrowly scoped,
build-verified Electron integration adds these controls to the existing
right-side Codex menu; the launcher owns service lifecycle and configuration.

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

## Current build (26.818.41509)

- **Official runtime base**: the runtime payload is derived from the official
  OpenAI Intel app, uniquely identified (`io.haleclipse.codexdesktop.runtime`)
  and isolated under `~/Library/Application Support/CodexDesktop-Rebuild/`.
  The build adds only the verified right-side enhancements menu integration.
- **Enhancements layer**: the launcher starts bundled services before Codex
   and stops them cleanly on quit — including raw SIGTERM/SIGINT/SIGHUP.
   Command-line tools are staged alongside and invoked with
    `node scripts/enhancement-tool.js <Codex.app> <id>`; web dashboards open
    inside the command center's WKWebView and native apps use the isolated
    `CODEX_HOME` environment.
- **Native command center**: the Codex icon on the right side of the macOS menu
   bar lists every enhancement — OpenCodex gateway (in-app window or browser), NerfTrack usage
    dashboard, and Codex Web GPT — plus **Enhancements Settings…**: one
  native window with an enable toggle, status, **view selector**, and Open
  button per feature. Choices persist in NSUserDefaults.
- **opencodex** (service, `http://127.0.0.1:10100`) — local OpenAI-compatible
  gateway with model passthrough and custom-provider routing
  (private config: `~/Library/Application Support/CodexDesktop-Rebuild/OpenCodexHome/config.json`).
- **nerftrack** (native app) — full local usage, quota, diagnostics, history,
  and API-equivalent value dashboard.

The bundled NerfTrack release is distributed under its upstream GPL-3.0-only
license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **codex-chatgpt-web** (launcher-managed service + in-app web dashboard) —
   the upstream loopback ChatGPT Web bridge runs as a hidden local service,
   while the command-center menu opens a local Codex Web GPT dashboard in the
   existing WKWebView. The dashboard exposes bridge health, diagnostics, setup
   status, and a **Connect ChatGPT** action that starts the bundled upstream
   setup flow automatically; the dashboard itself remains in Codex and no
   terminal command or second dashboard app is required.
   OpenCodex and ChatGPT Web run side by side: OpenCodex keeps the primary
   `CodexHome` route at `127.0.0.1:10100`, while ChatGPT Web uses the private
   `ChatGPTWebHome` route and never replaces the OpenCodex configuration.

## Quick summary
- Name: Oh My OpenAI (side-by-side rebuild of Codex)
- Platform focus: mac-x64 (Intel); launcher compiled as x86_64
- Purpose: stock Codex plus launcher-managed enhancement services, packaged
  and distributed as a single app

---

## What makes this different

1) **Small, release-gated integration surface**
   The previous broad patch system (chat presets, custom-provider UI rewrites,
   resource-saver changes, and feature gates) is gone. The only Electron
   integration adds the enhancement controls to the existing status menu.
   Packaging fails if the pinned upstream bundle shape cannot be integrated,
   and `npm run verify:artifact` checks the marker inside the final ASAR.

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
   OAuth credentials are never copied from `~/.codex`; the side-by-side app
   signs in independently so refresh-token rotation cannot sign another app out.

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

After building, run the complete artifact gate:

```bash
npm run verify:artifact -- out/side-by-side-mac-x64/Codex.app
```

This starts both service stacks in temporary isolated homes, verifies the
Responses API route and slash-containing model aliases, proves shutdown leaves
no bridge behind, checks that no auth file is copied, validates the packaged
menu integration, and performs a deep code-signature check.

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
- ChatGPT Web dashboard: `http://127.0.0.1:17842`

## First launch and connection

1. Open Codex normally. The launcher starts OpenCodex and ChatGPT Web before
   opening the private Codex runtime.
2. Sign into the side-by-side Codex app once. This login is intentionally
   independent from the official ChatGPT/Codex installation.
3. From the right-side Codex icon, choose **Connect ChatGPT Web**. Complete the
   dedicated ChatGPT browser sign-in once; the app verifies the composer,
   refreshes the model catalog, and restarts only the private runtime.
4. Open **Settings…** from the same menu to see live readiness. “Running” means
   the complete route is usable, not merely that a local process exists.

If startup fails, the launcher now keeps Codex closed rather than opening it
with a dead model route. Use **Settings… → Copy Diagnostics** and reveal the
enhancement logs from **Sandbox & Paths** when reporting an issue.

## Manual Installation

Download the DMG from the [latest release](https://github.com/random-guy-05/oh-my-openai/releases),
open it, and drag **Codex** to Applications. The build is ad-hoc signed and
not notarized, so first launch may require Control-click → Open.

## License

Oh My OpenAI is released under the MIT license.

---

## Contributing
- Add services by declaring them in `enhancements/manifest.json` (npm source,
  start command, port); the bundler verifies the binary at build time.
- Keep the launcher compiling with `-Wall -Wextra -Wpedantic -Werror` — the
  build treats warnings as errors.
