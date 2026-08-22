# Intel Codex custom build

The side-by-side Intel build is **stock Codex + an enhancements layer**. There
is no patch pipeline: the runtime is the official OpenAI app, packaged with a
launcher that starts bundled enhancement services. Custom behavior lives in
the enhancements, not in edited app bundles.

Supported upstream: any current official Intel macOS app
(`/Applications/ChatGPT.app`, `com.openai.codex`, x86_64).

## Architecture

The wrapper app (`out/side-by-side-mac-x64/Codex.app`) embeds:

- `Contents/MacOS/CodexLauncher` — the Objective-C launcher.
- `Contents/Resources/Codex.payload` — the stock runtime, uniquely identified
  (bundle id `io.haleclipse.codexdesktop.runtime`, executable renamed to
  `Codex`) so it never conflicts with the official app.
- `Contents/Resources/enhancements/` — bundled services: the effective
  `manifest.json` plus one staged directory per enhancement. Staged by
  `scripts/bundle-enhancements.js` before the wrapper is signed.

On first launch the launcher atomically installs its fingerprinted private
runtime under `~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`.
It starts enhancements before spawning Codex and stops them cleanly on quit,
including raw SIGTERM/SIGINT/SIGHUP (which never reach
`applicationWillTerminate:`). `CODEX_HOME` and the Electron user-data path are
isolated inside the support directory; the official app's data is untouched
and runtime upgrades keep the profile and Codex home.

## Enhancements

The side-by-side wrapper can carry enhancement services that the launcher
starts before Codex and stops cleanly on quit (including raw SIGTERM/SIGINT/
SIGHUP, which never reach `applicationWillTerminate:`), plus staged tools the
user invokes on demand.

- Source manifest: `enhancements/manifest.json` (versioned, per-platform).
- Bundler: `scripts/bundle-enhancements.js` resolves each source, verifies
  declared executables (exists, executable, matching arch), records
  `resolvedVersion` + sha256, and writes the effective
  `Contents/Resources/enhancements/manifest.json` inside the wrapper before
  the wrapper is signed. Dry-run with `--plan`; build-time failures abort the
  build.
- Sources: `npm:<spec>` (package at the enhancement root) and
  `github:<owner>/<repo>@<tag>` (repo tarball extracted to `source/`, or —
  with `asset` + `sha256` — a pinned release asset verified on download).
  `dependencies` installs extra npm packages into the same staging tree.
 - Types: `service` (launcher-managed `startCommand`, optional `config.port`)
   and `tool` (either a command-line tool or a native app bundle). Command-line
   tools are invoked via `scripts/enhancement-tool.js`, which sets `CODEX_HOME`
   to the app's isolated CodexHome; native apps open from the command center.
   Tools are ignored by the launcher's lifecycle.
- UI descriptors: each enhancement can declare `ui` (`label`, `kind`,
  `openLabel`, `url`). The launcher renders a native command center from
  them: a menu bar item with one entry per enhancement and an
   **Enhancements Settings…** window (enable toggle, status, view selector,
   Open button per feature; persisted in NSUserDefaults). `kind: web` opens
   the URL in an in-app WKWebView window or the browser, `kind: app` opens a
   bundled native app, and `kind: terminal` launches a terminal workflow.
- Runtime: the launcher reads the manifest from its own bundle, starts each
  service in its staged directory, and appends per-enhancement logs to
  `~/Library/Application Support/CodexDesktop-Rebuild/enhancements/<id>.log`.
  Enhancement failures never block Codex launch.

Bundled in the current build:

- `opencodex` (service, port 10100) — local OpenAI-compatible gateway
  dashboard, run by the staged bun runtime.
- `nerftrack` (native app) — full local usage, quota, diagnostics, and
  API-equivalent value dashboard bundled from the pinned macOS Intel release.
  Its upstream GPL-3.0-only notice is recorded in `THIRD_PARTY_NOTICES.md`.
- `codex-chatgpt-web` (service, port 17842) — the upstream loopback ChatGPT
  Web bridge plus a small repo-owned dashboard overlay. The command center
  opens the dashboard in the existing WKWebView; it shows bridge health,
  diagnostics, setup state, and ChatGPT Web without launching another app.

Current `enhancements/manifest.json` targets `mac-x64`; the bundler fails
closed for other platforms until they are added.

## Rebuild workflow

Directly from the installed official app (fastest):

```sh
node scripts/build-side-by-side-mac.js --runtime /Applications/ChatGPT.app
```

Or through the standard pipeline (sync → build → side-by-side):

```sh
npm run sync:installed:x64    # snapshot the installed official app
npm run build:mac-x64         # standard runtime + DMG
npm run build:side-by-side:x64
```

Skip the DMG with `node scripts/build-side-by-side-mac.js --skip-dmg`.
The build fails closed on missing sources, arch mismatches, or failed
enhancement verification.

Run `npm test && npm run doctor` before packaging. After a build, validate the
staged application with:

```sh
node scripts/verify-enhancements.js --app out/side-by-side-mac-x64/Codex.app
```

The release artifacts land in `out/`: the wrapper app
(`out/side-by-side-mac-x64/Codex.app`) and the DMG
(`out/Codex-side-by-side-mac-x64-<version>.dmg`). Install the wrapper by
dragging it to Applications, or use `npm run install:side-by-side` after a
build.
