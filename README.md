# Oh My OpenAI — Codex (side‑by‑side rebuild)

![build badge](https://img.shields.io/badge/build-unknown-lightgrey) ![side-by-side](https://img.shields.io/badge/side--by--side-YES-blue) ![license](https://img.shields.io/badge/license-MIT-yellow)

A tidy, inspectable rebuild of the Codex desktop runtime and launcher for Intel macOS — runs next to the official app, ships local-friendly patches, and keeps everything auditable.

---

## Table of contents
- [Quick summary](#quick-summary)  
- [What this repo actually does](#what-this-repo-actually-does)  
- [Quick start / build](#quick-start--build)  
- [Important files & scripts](#important-files--scripts)  
- [Install / runtime paths](#install--runtime-paths)  
- [Security / audit notes](#security--audit-notes)  
- [License (short)](#license-short)  
- [Contributing](#contributing)

---

## Quick summary
This repository contains scripts and small deterministic patches that produce a "side‑by‑side" Codex Desktop build: a launcher that embeds a private runtime so the rebuilt app can coexist with the official Codex install. Focus areas: reproducible builds, model-routing patches, usage/resource controls, and local observability for debugging.

---

## What this repo actually does
- Side‑by‑side launcher & isolated runtime
  - Launcher: `io.haleclipse.codexdesktop.launcher`
  - Private runtime: `io.haleclipse.codexdesktop.runtime`
  - Keeps profiles and runtime data separate from the official app.

- Local task presets (UI-visible)
  - Exposes three presets in a selector: **Chat**, **ChatGPT Work**, **Codex**.
  - Switching updates the native model selector for the *next turn* but preserves authoritative AppServer task history.

- Model & routing patches
  - Keeps named GPT-5.6 variants (Sol / Terra / Luna) available and routes handoffs/background resumes to configured flavors.

- Usage & resource controls
  - Optional cumulative token caps and percentage quota limits (`/limits`) enforced via patched logic.
  - Bounded usage/telemetry stores to avoid unbounded growth.
  - Reduced defaults for detached/inactive browser instances (fewer pages, shorter idle timeouts) to save CPU/RAM.

- Observability
  - Local `/status` endpoints surface token and prompt-cache telemetry for inspection.
  - Test scripts validate telemetry/usage deltas.

- Reproducible build tooling
  - Scripts to sync upstream artifacts, apply deterministic patches, run checks, and produce platform builds + a side‑by‑side launcher.

---

## Quick start / build (canonical sequence)
Follow these steps in order — they’re intentionally sequential:

```bash
# install deps
npm ci

# get upstream assets (uses installed upstream if available)
npm run sync:installed:x64

# apply mac-x64 patches
node scripts/patch-all.js mac-x64

# smoke tests for patches
npm run test:latest-models
npm run test:local-mode
npm run test:usage-controls
npm run test:resource-saver

# sanity check then build
node scripts/patch-all.js mac-x64 --check
npm run build:mac-x64
npm run build:side-by-side:x64
```

Tip: run the `test:*` scripts between patch and build to catch issues early.

---

## Important files & scripts
- scripts/
  - `patch-local-canonical-mode.js` — local/canonical mode patching  
  - `patch-usage-controls.js` — usage-cap enforcement, `/limits`  
  - `patch-resource-saver.js` — resource-saver/background tweaks  
  - `patch-latest-models.js` — ensure GPT-5.6 variants are present  
  - `patch-all.js` — convenience wrapper for all patches  
  - `build-from-upstream.js` — prepare a runtime for a platform  
  - `build-side-by-side-mac.js` — embed runtime into launcher  
  - `sync-upstream.js` — fetch upstream assets reproducibly  
  - `test-*.js` — small regression/test utilities

- `src/mac-x64/_asar/` — patched upstream application assets  
- `package.json` — scripts and metadata

Helpful npm scripts (from package.json)
- `npm run start` / `npm run dev` — dev run  
- `npm run patch` — run `patch-all.js`  
- `npm run patch:mac` — mac patches (arm64 + x64)  
- `npm run build:mac-x64` — build mac x64 runtime  
- `npm run build:side-by-side:x64` — package side-by-side launcher

---

## Install / runtime paths
- Runtime data for the side‑by‑side build:  
  `~/Library/Application Support/CodexDesktop-Rebuild/`

- Example artifact (from earlier builds):  
  `out/Codex-side-by-side-mac-x64-26.715.31925.dmg`  
  Example SHA‑256: `111e7dd8458ac36e973e7760a666120da16ccceaa9eb10e1c7a0684662ea2d18`

> Note: the build artifact is ad‑hoc signed and not notarized. Gatekeeper prompts on first launch are expected (Control‑click → Open).

---

## Security / audit notes
- The repo exposes local telemetry endpoints for inspection. Nothing here automatically transmits data to third parties — audit `scripts/` before running builds.
- Keep patches small and reversible; tests exist to help validate behavior.

---

## License (short)
Licensed under MIT. Copyright (c) 2026 random-guy-05.  
(Per your request the full MIT boilerplate has been removed from the README — add a `LICENSE` file with the canonical text if you want the full legal copy.)

---

## Contributing
1. Read the patch scripts in `scripts/`.  
2. Run the `test-*.js` helpers locally before opening PRs.  
3. Keep patches small, documented, and reversible.

---

## Visuals / screenshots
(Place screenshots in `/assets/` and reference them here.)

![screenshot placeholder](https://via.placeholder.com/800x300.png?text=Add+your+screenshot+to+/assets)

Made with care — want it to look even nicer? I can:
- add a polished SVG header,  
- add real CI/status badges (once CI exists),  
- create a dedicated `LICENSE` file with the canonical MIT text, or  
- add a short "Usage / Quick Start" with example screenshots and commands.
