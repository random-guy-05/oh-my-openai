# Intel Codex + ChatGPT Work + Chat build

This branch rebuilds the current official Intel macOS application as `Codex.app`
while preserving the bundled Codex CLI and the ChatGPT Work interface, and adds
a dedicated live Chat mode backed by `chatgpt.com`.

## Current behavior

- Source application: `/Applications/ChatGPT.app`
- Required architecture: `x86_64`
- Visible model family: `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`
- Hidden internal models remain available to application internals.
- ChatGPT Work features, including Chat, plugins, sites, pull requests,
  subagents, and artifacts, are left intact.
- The Codex/ChatGPT Work selector has a third **Chat** option. The previous
  standalone Chat sidebar row is removed.
- Chat uses the real `chatgpt.com` application and the signed-in account's
  server-side conversation history, not a locally reimplemented chat UI.
- Entering Chat preserves the mounted native route, task, draft, and running
  work so returning to Codex or ChatGPT Work restores the previous state.
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

## Dedicated Chat mode architecture

Chat is a third value in the existing Codex/ChatGPT Work product-mode selector,
not another navigation row. Its renderer state is separate from the native
conversation-detail mode used by Codex and ChatGPT Work. Selecting Chat overlays
a full-window live surface while leaving the native React tree mounted. On exit,
the previous native mode and route regain focus without reconstructing the task.

The live surface is an Electron `<webview>` created with exactly:

```text
partition="persist:codex-chatgpt-live"
src="about:blank"
```

The main process recognizes that exact partition before the generic browser
sidebar manager. It permits at most one pending or attached Chat guest per
primary window, replaces renderer-supplied preferences with hardened values,
and rejects a non-blank initial URL. The guest has no preload, Node integration,
plugins, popup privilege, nested webviews, or Codex IPC bridge. It runs with
sandboxing, context isolation, and web security enabled.

The dedicated persistent partition is stored beneath:

```text
~/Library/Application Support/CodexDesktop-Rebuild/Profile
```

It is separate from the official ChatGPT app, checkout webviews, and
`persist:codex-browser-app`. Mode changes and normal guest destruction do not
clear it. One guest is owned by each primary Codex window, while cookies and
server-side ChatGPT history can be shared through the dedicated partition.

Authentication reuses the app's existing Codex access-token refresh and
ChatGPT `/api/auth/link-session` handoff. Each new guest is rebound to the
currently active Codex account rather than copying credentials or mutable
profile files from the official ChatGPT app. The main process derives the
authoritative account ID from the refreshed access token. The renderer's
active-account value is used only as part of the React key that remounts the
guest after an account switch; it is never sent as account identity. If
authentication or guest hardening fails, attachment closes rather than falling
back to a broader origin or privileged renderer configuration; Retry creates a
fresh hardened guest.

Main-frame navigation is restricted to `https://chatgpt.com` after the initial
`about:blank`. Same-origin popup requests are loaded in the existing guest;
ordinary external HTTP(S) destinations are handed to the external browser.
Other schemes and cross-origin redirects are denied. Session permissions are
deny-by-default and require the requesting, embedding, and security origins to
match ChatGPT. Sanitized clipboard writes are the only intended grant. Media
capture is denied because the guest remains mounted while hidden, preventing a
previous camera or microphone grant from continuing invisibly in another mode.

This boundary is what allows the real web conversation history to coexist with
custom native Codex chrome without exposing filesystem or Electron privileges
to remote content. It also means the official ChatGPT app and the rebuilt Codex
app can remain open concurrently with independent local profiles.

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
npm run test:dedicated-chat
npm run check:source:mac-x64
node scripts/patch-all.js mac-x64 --check
```

The build fails closed if the source is not an official OpenAI Intel bundle,
the synchronized hashes do not match, the model-patch anchors change, the
dedicated-Chat renderer or main-process anchors change, the official CLI changes,
ASAR integrity cannot be updated, or signing verification fails. The
side-by-side protocol and dedicated Chat patches parse affected JavaScript and
require their security markers and structural invariants, preventing a
marker-only check from accepting invalid code.

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
   mode-selector, Chat guest, session, or navigation-policy change.
5. Run `npm run build:mac-x64` and `npm run build:side-by-side:x64`.

The last command produces the self-contained side-by-side DMG. The launcher
compares a deterministic full-runtime fingerprint, so a customized build
updates the private installed runtime even when the upstream version is unchanged.
`scripts/patch-side-by-side-scheme.js` is the reference for coordinated
main-process and renderer edits. Dedicated Chat mode is implemented and checked
by:

- `scripts/patch-dedicated-chat-mode.js`
- `scripts/test-dedicated-chat-mode-patch.js`

The extracted native shell, selector, styles, and trusted toolbar can be patched.
The page inside Chat mode is live content served by `chatgpt.com`; its original
React source is not in this repository. The supported implementation does not
inject JavaScript into that page or weaken its origin boundary. Consequently,
source-level redesign of the remote ChatGPT website is not a capability of this
rebuild, even though the local Electron integration around it is customizable.

## Local signing notes

The customized application is ad-hoc signed because the original OpenAI
signature cannot survive an ASAR change. Electron helpers are deep-signed with
sanitized upstream entitlements; the separately executed official Codex CLI is
kept byte-for-byte and retains its official signature.

This local build is not Apple-notarized. On first normal launch, macOS may
require **Control-click Codex.app > Open** (or **Open Anyway** in Privacy &
Security). The launcher, private runtime, data profile, and URL registration are
separate from the official ChatGPT app, so both can run at the same time.
