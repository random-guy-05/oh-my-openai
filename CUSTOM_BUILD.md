# Intel Codex + ChatGPT Work build

This branch rebuilds the current official Intel macOS application as `Codex.app`
while preserving the bundled Codex CLI and the ChatGPT Work interface.

## Current behavior

- Source application: `/Applications/ChatGPT.app`
- Required architecture: `x86_64`
- Visible model family: `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`
- Hidden internal models remain available to application internals.
- ChatGPT Work features, including Chat, plugins, sites, pull requests,
  subagents, and artifacts, are left intact.
- New turns fall back to Sol when a saved legacy model is no longer visible.
  Existing thread metadata is not rewritten.

## Refresh and rebuild

Install dependencies once:

```sh
npm install
```

Snapshot a verified official Intel application, apply every patch, and build:

```sh
npm run sync:installed:x64
npm run patch -- mac-x64
npm run build:mac-x64
```

The build is written to:

```text
out/mac-x64/Codex.app
out/Codex-mac-x64-<version>.dmg
```

To package the customized runtime behind a unique launcher that can run beside
the official ChatGPT app, use:

```sh
npm run build:side-by-side:x64
```

The top-level launcher uses the unique identifier
`io.haleclipse.codexdesktop.launcher`. It installs a uniquely identified runtime
(`io.haleclipse.codexdesktop.runtime`) under
`~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`, removes
the duplicate `codex://` registration, and uses the persistent isolated profile
at `~/Library/Application Support/CodexDesktop-Rebuild/Profile`. Finder,
LaunchServices, and Electron therefore do not confuse it with
`/Applications/ChatGPT.app`.

The runtime also receives its own `CODEX_HOME` at
`~/Library/Application Support/CodexDesktop-Rebuild/CodexHome`. On first launch,
the launcher copies only `auth.json` and `config.toml` from `~/.codex` with
private permissions. SQLite databases, global state, histories, and sessions are
not shared, so the official ChatGPT app and Codex can keep independent backend
processes open simultaneously.

The outer launcher owns `codex-rebuild://` and forwards those deep links to the
private runtime with the isolated profile. The runtime itself owns no URL scheme,
so cold deep-link launches cannot bypass profile isolation.
Packaged macOS builds also use Electron's single-instance lock, allowing warm
links and Finder reopens to reuse the existing private runtime safely.

The standalone output is written to:

```text
out/side-by-side-mac-x64/Codex.app
out/Codex-side-by-side-mac-x64-<version>.dmg
```

The launcher embeds the signed runtime as a non-application payload and installs
it on first launch. A content fingerprint makes subsequent customized builds
update the private runtime even when the upstream version number is unchanged.
Existing installs are migrated atomically from `Codex Runtime.app` to `Codex.app`;
the isolated `Profile` and `CodexHome` directories are left untouched.
Both bundles use the repository's original blue Codex terminal icon from
`resources/electron.icns` and the exact historical adaptive icon catalog from
`resources/CodexAssets.car`. The runtime restores the historical `icon` base
name and replaces every ICNS/Dock PNG fallback plus the Alerts helper icon, so
Finder, Dock, settings previews, and system alerts cannot select ChatGPT artwork.
The side-by-side bundle uses a local `.2` build revision so LaunchServices
refreshes renamed bundles and icon metadata reliably.

Run a non-mutating patch verification with:

```sh
npm run test:latest-models
npm run check:source:mac-x64
node scripts/patch-all.js mac-x64 --check
```

The build fails closed if the source is not an official OpenAI Intel bundle,
the synchronized hashes do not match, the model-patch anchors change, the
official CLI changes, ASAR integrity cannot be updated, or signing verification
fails. The side-by-side protocol patch also parses every affected main-process
bundle as JavaScript, preventing a marker-only check from accepting invalid code.

## Frontend customization

The extracted frontend is under `src/mac-x64/_asar/webview/assets`. This is the
compiled/minified renderer, not OpenAI's original React/TypeScript source, but
it can be customized and repackaged. Durable customizations should be implemented as
structural patch scripts in `scripts/` and registered in `scripts/patch-all.js`.
`scripts/patch-latest-models.js` is the reference implementation: it parses the
target bundles, requires exact structural matches, applies idempotent markers,
and verifies the result.

For a frontend change:

1. Add or update a structural patch in `scripts/`.
2. Register it in `scripts/patch-all.js`.
3. Run `npm run patch -- mac-x64` and `node scripts/patch-all.js mac-x64 --check`.
4. Run `npm run build:mac-x64` and `npm run build:side-by-side:x64`.

The last command produces the self-contained side-by-side DMG. The launcher
compares a deterministic full-runtime fingerprint, so a customized build
updates the private installed runtime even when the upstream version is unchanged.
`scripts/patch-side-by-side-scheme.js` is the reference for coordinated
main-process and renderer edits.

## Local signing notes

The customized application is ad-hoc signed because the original OpenAI
signature cannot survive an ASAR change. Electron helpers are deep-signed with
sanitized upstream entitlements; the separately executed official Codex CLI is
kept byte-for-byte and retains its official signature.

This local build is not Apple-notarized. On first normal launch, macOS may
require **Control-click Codex.app > Open** (or **Open Anyway** in Privacy &
Security). The launcher, private runtime, data profile, and URL registration are
separate from the official ChatGPT app, so both can run at the same time.
