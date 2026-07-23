# Oh My OpenAI — Codex side-by-side rebuild

A customized side-by-side Codex (Codex Desktop) build that runs next to the official app on Intel macOS. It’s focused on local-friendly tweaks, safer defaults, and a set of small but useful runtime patches you can inspect and rebuild from source.

Badges: build | side-by-side | MIT

Overview

This repository contains the tools, patches, and build scripts used to produce a side-by-side Codex desktop runtime and launcher. The goal is not to replace upstream but to offer a reproducible, inspectable rebuild with optional behavior changes such as model presets, resource-saver limits, usage caps, and an isolated runtime/containerized profile.

Key features (what the code actually does)

- Side-by-side launcher + runtime
  - A separate launcher (io.haleclipse.codexdesktop.launcher) that embeds a private runtime (io.haleclipse.codexdesktop.runtime) so the rebuilt app can coexist with the official Codex install.
  - Builds for mac-x64 (Intel) and mac-arm64 are supported; side-by-side packaging scripts focus on mac-x64.
- Local task presets
  - Three visible presets exposed in the UI selector without changing native task history or AppServer transport: Chat, ChatGPT Work, and Codex. Switching updates the native selector and the model used for the next turn while preserving authoritative turn history in AppServer.
- Model / runtime patches
  - Patches that keep the latest GPT-5.6 named models available (Sol, Terra, Luna) and route certain handoffs or background resumes to specific model flavors.
- Usage & resource controls
  - Optional cumulative token caps and observed-quota percentage limits exposed under a /limits endpoint and enforced by the patched logic.
  - Bounded usage and telemetry stores to avoid unbounded growth.
  - Reduced defaults for detached/inactive browser instances (e.g., default to fewer pages and aggressive idle timeouts) to save CPU and memory.
- Observability & telemetry hooks
  - Exact AppServer token and prompt-cache telemetry are surfaced under /status endpoints for local inspection.
  - Scripts include test utilities to assert expected telemetry and usage deltas.
- Reproducible build tooling
  - Scripts to sync upstream, apply deterministic patches, check source, and build both runtimes and a side-by-side launcher. The built artifacts are reproducible by following the build steps below.
- Isolation & data location
  - Isolated profile and CODEX_HOME to keep runtime data separate from the official app.
  - Runtime data is stored under:

  ~/Library/Application Support/CodexDesktop-Rebuild/

What lives in this repo (important files)

- scripts/
  - patch-local-canonical-mode.js — local-mode and canonical-mode patching
  - patch-usage-controls.js — enforcement of usage caps and limits
  - patch-resource-saver.js — disables or tightens background/browser defaults
  - patch-latest-models.js — ensures named GPT-5.6 variants remain available
  - patch-all.js — convenience wrapper that applies the above patches
  - build-from-upstream.js — prepares a runtime build for the given platform
  - build-side-by-side-mac.js — embeds a runtime into a side-by-side launcher
  - sync-upstream.js — fetches upstream assets to a reproducible path
  - test-*.js — quick regressions for the most important patches
- src/mac-x64/_asar/ — compiled upstream application assets after patching
- package.json — build scripts and metadata (see scripts section below)

Quick verification & build

These commands are the canonical sequence used by the repo (order matters):

```sh
npm ci
npm run sync:installed:x64
node scripts/patch-all.js mac-x64
npm run test:latest-models
npm run test:local-mode
npm run test:usage-controls
npm run test:resource-saver
node scripts/patch-all.js mac-x64 --check
npm run build:mac-x64
npm run build:side-by-side:x64
```

Notes

- The build is ad-hoc signed and not notarized. On first launch you may need to Control-click → Open and allow in Keychain.
- The side-by-side build embeds a private runtime so user data and identifiers are separate from the official app.
- The code intentionally keeps task history authoritative in AppServer; switching presets does not mutate server-side history.

Helpful npm scripts (from package.json)

- npm run start / dev — start the patched app in development
- npm run patch — run patch-all.js
- npm run patch:mac — apply mac patches for both arm64 and x64
- npm run build:mac-x64 — build runtime for mac x64
- npm run build:side-by-side:x64 — create the side-by-side launcher that bundles the patched runtime
- npm run test:latest-models — verify latest-models patch
- npm run test:local-mode — verify local canonical-mode patch
- npm run test:usage-controls — verify usage caps
- npm run test:resource-saver — verify resource saver behavior

Security & privacy

- The rebuild keeps telemetry surface points for local inspection (/status) but the patched runtime exposes fewer default background resources and respects the configured limits.
- If you plan to run this build, audit the patches under scripts/ before launching and check the test utilities.

Installation (runtime paths)

Runtime data for the rebuilt side-by-side launcher is stored at:

~/Library/Application Support/CodexDesktop-Rebuild/

Installer artifact example (from earlier builds)

- Installer: out/Codex-side-by-side-mac-x64-26.715.31925.dmg
- Example SHA-256: 111e7dd8458ac36e973e7760a666120da16ccceaa9eb10e1c7a0684662ea2d18

Contributing

- Read the scripts in scripts/ to understand the patches and run the test files before opening anything.
- Keep patches small, well-documented, and reversible.

License — MIT

Copyright (c) 2026 random-guy-05

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
