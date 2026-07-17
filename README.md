# Oh My OpenAI

A customizable Intel macOS build of the OpenAI desktop experience, packaged as
**Codex.app** with the original blue Codex terminal-cloud icon. It uses an
isolated profile and bundle identity, so it can run beside the official
**ChatGPT.app** without sharing mutable local databases or session state. Its
native product-mode selector provides Codex, ChatGPT Work, and Chat as three
first-class modes in the same desktop renderer.

## Download

[Download Codex for Intel Mac](https://github.com/random-guy-05/oh-my-openai/releases/latest/download/Codex-Intel-x64.dmg)

Current packaged build:

- Upstream app version: `26.707.72221`
- Local build revision: `5307.6`
- Architecture: Intel `x86_64`
- SHA-256: `ba781b7a003cdf28c53b830bd03a99a9c639066bf7dfdfda7074369f643e91ef`

The DMG is ad-hoc signed and is not Apple-notarized. On first launch, macOS may
require **Control-click Codex.app > Open** or **Open Anyway** in Privacy &
Security.

## What this repository contains

- The complete rebuild and patch toolchain.
- A native Intel launcher named `Codex`.
- An isolated private runtime that can stay open with ChatGPT.
- The exact historical Codex adaptive icon catalog and fallback artwork.
- Structural frontend patches for model selection, native Chat routing, and
  side-by-side behavior.
- Manual and scheduled GitHub Actions builds.

Generated app bundles, the synchronized compiled/minified upstream application,
local profiles, authentication files, and `node_modules` are intentionally
excluded from Git. The repository contains the reproducible patch and packaging
toolchain, not OpenAI's original React/TypeScript source tree. Prebuilt DMGs are
distributed through GitHub Releases instead of repository history.

## Install the prebuilt DMG

1. Download and open `Codex-Intel-x64.dmg`.
2. Drag `Codex.app` into Applications.
3. Open Codex normally. If Gatekeeper blocks the first launch, use
   **Control-click > Open**.
4. Keep using the official ChatGPT app independently; both applications have
   unique bundle identifiers and isolated data directories.

Codex stores its private runtime and data under:

```text
~/Library/Application Support/CodexDesktop-Rebuild/
```

## Codex, ChatGPT Work, and Chat

The native product-mode selector has three choices:

- **Codex** keeps the native coding-oriented task experience.
- **ChatGPT Work** keeps the native create, learn, and explore experience.
- **Chat** opens the built-in ChatGPT history, projects, and conversation page
  at the route-scoped URL `/chat?mode=chat`.

Chat is part of the Codex/ChatGPT Work selector; it is not a separate sidebar
destination. Its route applies a distinct Chat accent and can remove
coding-specific tabs without changing the underlying conversations.

The Chat page uses the desktop application's existing ChatGPT conversation and
project data. It preserves server-side conversation identifiers, so existing
threads remain in the same history and can be continued normally. The patch does
not copy, migrate, rewrite, delete, or otherwise mutate chats.

### Chat models and usage path

- Chat exposes the upstream-supported, non-third-party ChatGPT models in its own
  model selector.
- Chat completions use the native `startCompletionStream` path rather than the
  Codex AppServer turn-start path used by Codex and ChatGPT Work.
- That transport separation keeps Chat on the ChatGPT chat usage allowance while
  Codex and ChatGPT Work continue to use their shared Codex usage allowance.
- Changing modes or models never rewrites existing thread metadata.

There is no remote-page overlay or second chat store. Chat is a native route in
the same compiled renderer, while the side-by-side application profile remains
locally isolated from the separately installed official ChatGPT app.

## Build it yourself

Requirements:

- An Intel Mac
- Node.js 24 or newer
- The official Intel ChatGPT app version `26.707.91948` in
  `/Applications/ChatGPT.app`
- Xcode Command Line Tools

```sh
npm ci
npm run sync:installed:x64
npm run patch -- mac-x64
npm run build:mac-x64
npm run build:side-by-side:x64
```

The downloadable side-by-side package is written to:

```text
out/Codex-side-by-side-mac-x64-<version>.dmg
```

Run the regression and source checks with:

```sh
npm run test:latest-models
npm run test:dedicated-chat
npm run check:source:mac-x64
node scripts/patch-all.js mac-x64 --check
```

The native Chat implementation and its structural regression test live in:

- `scripts/patch-dedicated-chat-mode.js`
- `scripts/test-dedicated-chat-mode-patch.js`

After changing the mode selector, Chat route, model filtering, or completion
transport, run the aggregate patch check and `npm run test:dedicated-chat` before
building the DMG. A release smoke test should switch Codex > Chat > ChatGPT Work,
continue an existing ChatGPT thread, verify projects and history are unchanged,
confirm the Chat model selector and completion path, restart the app, and keep
the official ChatGPT app open at the same time.

## Customize the frontend

After synchronization, the compiled renderer is extracted under:

```text
src/mac-x64/_asar/webview/assets/
```

This is compiled/minified application code, not OpenAI's original React or
TypeScript source and not the complete editable source tree for either Codex or
ChatGPT. Chunk names, minified identifiers, and component structure can change
with every upstream release. For durable customization:

1. Create a structural patch in `scripts/`.
2. Register it in `scripts/patch-all.js`.
3. Make the patch fail closed when expected anchors change.
4. Add a regression test.
5. Re-run the patch and side-by-side build commands above.

Use these implementations as references:

- `scripts/patch-latest-models.js`
- `scripts/patch-dedicated-chat-mode.js`
- `scripts/test-dedicated-chat-mode-patch.js`
- `scripts/patch-side-by-side-scheme.js`
- `scripts/test-latest-model-patch.js`
- `launcher/CodexLauncher.m`

Structural patches can customize the extracted native renderer, including the
product selector, `/chat?mode=chat` layout, Chat accent, visible tabs, history and
project presentation, and model selector. These files are compiled/minified
upstream output and are regenerated by synchronization; they are excluded from
Git and are not OpenAI's original source. Reconstructing readable code from a
compiled bundle is useful for targeted patches, but it is not equivalent to
possessing OpenAI's original application source.

For the full architecture, signing, icon, update, and profile-isolation details,
see [CUSTOM_BUILD.md](CUSTOM_BUILD.md).

## Repository layout

```text
launcher/                 Native side-by-side macOS launcher
resources/                Codex icons and shared packaged resources
scripts/                  Sync, patch, verification, and build tooling
.github/workflows/        Manual builds and upstream synchronization
CUSTOM_BUILD.md           Detailed Intel customization guide
```

## Important notices

This is an independent rebuild project and is not an official OpenAI release.
OpenAI, ChatGPT, and Codex names and artwork belong to their respective owners.
The repository does not contain user credentials or the generated upstream app
source. Review applicable licenses and terms before redistributing a customized
binary or making the repository public.

## Credits

- [OpenAI Codex](https://github.com/openai/codex) — Codex CLI
- [Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild) — upstream cross-platform rebuild
- [Electron Forge](https://www.electronforge.io/) — packaging toolchain
