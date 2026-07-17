# Intel Codex + ChatGPT Work + native Chat build

This branch rebuilds the current official Intel macOS application as `Codex.app`
while preserving the bundled Codex CLI and ChatGPT Work interface, and adds Chat
as a third native product mode. The supported upstream baseline is Intel app
version `26.707.91948`.

## Current behavior

- Source application: `/Applications/ChatGPT.app`
- Required architecture: `x86_64`
- Codex/Work visible model family: `gpt-5.6-sol`, `gpt-5.6-terra`, and
  `gpt-5.6-luna`; hidden internal models remain available to app internals.
- Chat uses the upstream-supported non-third-party models exposed by the native
  ChatGPT model selector.
- ChatGPT Work features, including plugins, sites, pull requests, subagents, and
  artifacts, are left intact.
- The Codex/ChatGPT Work selector has a third **Chat** option. The previous
  standalone Chat sidebar row is removed.
- Chat navigates to the route-scoped `/chat?mode=chat` page built into the native
  renderer, with its existing history, projects, and conversation views.
- Existing server-side conversation IDs remain unchanged and every available
  thread can be continued; the patch performs no chat migration or mutation.
- Chat completions use `startCompletionStream`, separate from the Codex/Work
  AppServer turn path and its shared usage allowance.
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

## Native Chat mode architecture

Chat is a third value in the existing Codex/ChatGPT Work product-mode selector,
not another navigation row. Selecting it navigates the same renderer to
`/chat?mode=chat`. The `mode=chat` query value scopes the Chat-specific layout,
accent, and tab visibility without forking or transforming conversation data.

The route renders the application's built-in ChatGPT history, projects, and
conversation page. It reads the signed-in account's existing server-side data
and retains the original conversation identifiers. Opening, continuing, or
switching a thread uses that same record; the patch does not import, export,
clone, migrate, rewrite, or delete chats.

Chat's model selector filters to upstream-supported models that are not marked
as third-party. Sending from Chat invokes the native `startCompletionStream`
transport. Codex and ChatGPT Work retain their AppServer turn-start transport,
so their shared Codex usage path is not substituted for Chat's separate ChatGPT
chat usage path.

This design uses no remote-page overlay. Chat is patched entirely within the
compiled native renderer and its existing application data flow. The separate
install boundary remains the side-by-side launcher's unique bundle identity,
private runtime, `CODEX_HOME`, and Electron profile; that local isolation allows
the official ChatGPT app and rebuilt Codex app to remain open concurrently.

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
The side-by-side bundle uses a local build revision so LaunchServices refreshes
renamed bundles and icon metadata reliably.

Run a non-mutating patch verification with:

```sh
npm run test:latest-models
npm run test:dedicated-chat
npm run check:source:mac-x64
node scripts/patch-all.js mac-x64 --check
```

The build fails closed if the source is not an official OpenAI Intel bundle,
the synchronized hashes do not match, the model-patch anchors change, the
native-Chat route, selector, model, or transport anchors change, the official CLI
changes, ASAR integrity cannot be updated, or signing verification fails. The
side-by-side protocol and native Chat patches parse affected JavaScript and
require their markers and structural invariants, preventing a marker-only check
from accepting invalid code.

## Frontend customization

The extracted frontend is under `src/mac-x64/_asar/webview/assets`. This is the
compiled/minified renderer, not OpenAI's original React/TypeScript source, but
it can be customized and repackaged. It is not a complete source release, and
beautifying or deminifying it does not recover original component names, types,
comments, tests, or build inputs. Upstream chunk and symbol changes can break a
patch even when the visible feature still exists. Durable customizations should
therefore be implemented as structural patch scripts in `scripts/` and
registered in `scripts/patch-all.js`.
`scripts/patch-latest-models.js` is the reference implementation: it parses the
target bundles, requires exact structural matches, applies idempotent markers,
and verifies the result.

For a frontend change:

1. Add or update a structural patch in `scripts/`.
2. Register it in `scripts/patch-all.js`.
3. Run `npm run patch -- mac-x64` and `node scripts/patch-all.js mac-x64 --check`.
4. Run the feature regression, including `npm run test:dedicated-chat` for any
   mode-selector, Chat route, model-filter, or completion-transport change.
5. Run `npm run build:mac-x64` and `npm run build:side-by-side:x64`.

The last command produces the self-contained side-by-side DMG. The launcher
compares a deterministic full-runtime fingerprint, so a customized build
updates the private installed runtime even when the upstream version is unchanged.
`scripts/patch-side-by-side-scheme.js` is the reference for coordinated
main-process and renderer edits. Native Chat mode is implemented and checked
by:

- `scripts/patch-dedicated-chat-mode.js`
- `scripts/test-dedicated-chat-mode-patch.js`

The extracted native shell, selector, `/chat?mode=chat` page, styles, tabs,
history/project presentation, and model picker can be patched. The synchronized
assets are compiled/minified generated output and are intentionally excluded
from Git; OpenAI's original React source, component names, types, comments,
tests, and build inputs are not present. The patch scripts are the maintainable
customization layer and must be revalidated against each upstream build.

## Local signing notes

The customized application is ad-hoc signed because the original OpenAI
signature cannot survive an ASAR change. Electron helpers are deep-signed with
sanitized upstream entitlements; the separately executed official Codex CLI is
kept byte-for-byte and retains its official signature.

This local build is not Apple-notarized. On first normal launch, macOS may
require **Control-click Codex.app > Open** (or **Open Anyway** in Privacy &
Security). The launcher, private runtime, data profile, and URL registration are
separate from the official ChatGPT app, so both can run at the same time.
