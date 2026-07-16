# Oh My OpenAI

A customizable Intel macOS build of the current OpenAI desktop experience,
packaged as **Codex.app** with the original blue Codex terminal-cloud icon.
It uses an isolated profile and bundle identity, so it can run beside the
official **ChatGPT.app** without sharing mutable databases, cookies, or session
state. Its product-mode selector provides Codex, ChatGPT Work, and a dedicated
live Chat surface backed by the real `chatgpt.com` web application.

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
- Structural frontend patches for model selection, dedicated Chat mode, and
  side-by-side behavior.
- Manual and scheduled GitHub Actions builds.

Generated app bundles, downloaded upstream sources, local profiles,
authentication files, and `node_modules` are intentionally excluded from Git.
Prebuilt DMGs are distributed through GitHub Releases instead of repository
history.

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

The existing product-mode selector has three choices:

- **Codex** keeps the native coding-oriented task experience.
- **ChatGPT Work** keeps the native create, learn, and explore experience.
- **Chat** opens the real `chatgpt.com` interface as a dedicated full-window
  live surface, including conversations synchronized by the signed-in account.

Chat is part of the Codex/ChatGPT Work selector; it is not a separate sidebar
destination. The old standalone Chat sidebar row is removed so there is one
unambiguous way to enter the live web experience.

Switching to Chat does not tear down or navigate away from the native Codex
renderer. The native route, selected task, drafts, scroll position, and running
work stay mounted behind the Chat surface. Returning to Codex or ChatGPT Work
restores that state instead of starting a new local session.

### Chat data and security boundary

- Chat runs in the dedicated persistent Electron partition
  `persist:codex-chatgpt-live` inside the rebuild's isolated profile.
- The partition preserves the live Chat login between mode changes and app
  restarts, but it is not shared with the official ChatGPT app or the Codex
  browser-use partition.
- The guest starts at `about:blank`; the main process links the existing Codex
  account session and then loads only the `https://chatgpt.com` origin. The
  authoritative account ID is derived from the refreshed access token; the
  renderer's active-account value is used only to remount the guest after an
  account switch and is never transported as identity.
- The remote page receives no Codex preload, Node.js access, filesystem access,
  nested webviews, or `electronBridge` IPC. Context isolation, sandboxing, and
  web security remain enabled.
- Cross-origin main-frame navigation is denied. Normal external links open in
  the user's external browser instead of inheriting the Chat guest's session.
- Permission handling is deny-by-default and origin checked. Sanitized
  clipboard writes are supported. Microphone/camera capture is denied in this
  retained guest so it cannot continue invisibly after switching modes.

The live conversation list and messages come from ChatGPT's servers. Local
profile isolation protects the official app's mutable state; it does not create
a second copy of server-side conversations.

## Build it yourself

Requirements:

- An Intel Mac
- Node.js 24 or newer
- The current official ChatGPT app in `/Applications/ChatGPT.app`
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

The dedicated Chat implementation and its structural regression test live in:

- `scripts/patch-dedicated-chat-mode.js`
- `scripts/test-dedicated-chat-mode-patch.js`

After changing either the renderer integration or main-process guest policy,
run the aggregate patch check and `npm run test:dedicated-chat` before building
the DMG. A release smoke test should also switch Codex > Chat > ChatGPT Work,
verify that the native task state survives, restart the app to verify the
isolated Chat session, and keep the official ChatGPT app open at the same time.

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

Structural patches can customize the extracted native renderer, the mode
selector, and the trusted local chrome around Chat. The contents of the live
Chat surface are served by `chatgpt.com`; this repository does not contain that
website's React source. DOM injection or broad security-policy relaxation is
intentionally not used, so arbitrary source-level customization of the remote
ChatGPT interface is outside the supported scope. Reconstructing readable code
from a compiled bundle is useful for targeted patches, but it is not equivalent
to possessing OpenAI's original application source.

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
