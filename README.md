# Oh My OpenAI

A customizable Intel macOS build of the current OpenAI desktop experience,
packaged as **Codex.app** with the original blue Codex terminal-cloud icon.
It uses an isolated profile and bundle identity, so it can run beside the
official **ChatGPT.app** without sharing mutable databases or session state.

## Download

[Download Codex for Intel Mac](https://github.com/random-guy-05/oh-my-openai/releases/latest/download/Codex-Intel-x64.dmg)

Current packaged build:

- Upstream app version: `26.707.72221`
- Local build revision: `5307.2`
- Architecture: Intel `x86_64`
- SHA-256: `4574b210784a80c7ec9fc0b8c1b6ae514b2e7c94901beeb86d06527d402c5365`

The DMG is ad-hoc signed and is not Apple-notarized. On first launch, macOS may
require **Control-click Codex.app > Open** or **Open Anyway** in Privacy &
Security.

## What this repository contains

- The complete rebuild and patch toolchain.
- A native Intel launcher named `Codex`.
- An isolated private runtime that can stay open with ChatGPT.
- The exact historical Codex adaptive icon catalog and fallback artwork.
- Structural frontend patches for model selection and side-by-side behavior.
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
npm run check:source:mac-x64
node scripts/patch-all.js mac-x64 --check
```

## Customize the frontend

After synchronization, the compiled renderer is extracted under:

```text
src/mac-x64/_asar/webview/assets/
```

This is compiled/minified application code, not OpenAI's original React or
TypeScript source. For durable customization:

1. Create a structural patch in `scripts/`.
2. Register it in `scripts/patch-all.js`.
3. Make the patch fail closed when expected anchors change.
4. Add a regression test.
5. Re-run the patch and side-by-side build commands above.

Use these implementations as references:

- `scripts/patch-latest-models.js`
- `scripts/patch-side-by-side-scheme.js`
- `scripts/test-latest-model-patch.js`
- `launcher/CodexLauncher.m`

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
