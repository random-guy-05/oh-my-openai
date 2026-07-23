# Community Codex — a ChatGPT‑style Codex rebuild

Community Codex is a readable, inspectable side‑by‑side rebuild of the Codex desktop runtime and launcher for macOS. It turns the Codex Electron client into a ChatGPT‑like experience while preserving upstream task history and AppServer transport — a Community edition of Codex built for chat-first workflows.

This README emphasizes the novel features implemented in the codebase, especially the chat mode and presets, and explains how this is effectively a ChatGPT app adapted to the Codex runtime.

---

## Quick summary
- Name: Community Codex (side‑by‑side rebuild)
- Platform focus: mac-x64 (Intel) with mac-arm64 supported
- Purpose: expose ChatGPT‑style chat mode and presets inside the native Codex client, plus usage/resource controls, observability, and reproducible build tooling

---

## What makes Community Codex different (novel features)
These are the actual features implemented in the repository (look in `scripts/` and `src/mac-x64/_asar/` for the code):

1) Chat first, sticky chat behavior
- Implements a ChatGPT‑style chat mode that is "sticky": the composer, send control, and conversation flow behave like a chat app without breaking native Codex history. Look at `scripts/_apply-sticky-chat-v43.js` and `scripts/_apply-chat-models-v37.js` for the runtime hooks and ASAR injection.
- Sticky send: the patched send flow (`CDRStickyChatSend` and associated bridge hooks) ensures new messages are appended to the existing conversation rather than triggering navigations or undesired surface changes.
- Background resume & handoffs are routed to a lightweight GPT-5.6 flavor (Luna Light) to resume state or fetch context without consuming the heavier model budget.

2) Chat model picker mapped to AppServer models
- The Chat mode originally used a ChatGPT catalog; Community Codex maps that catalog back to the local AppServer model picker so users can keep the familiar ChatGPT UI while running Sol/Terra/Luna models provided by the Codex backend.
- See `scripts/_apply-chat-models-v37.js` and `scripts/_inspect-model-picker-state2.js` for how the patch extracts model picker helpers and publishes AppServer-compatible model lists.

3) UI‑visible presets (Chat, ChatGPT Work, Codex) with safe semantics
- Three presets are exposed in the selector but they intentionally do not change route, AppServer task id, transcript ownership, or history hydration. The code stores only the selected preset (`cdr-product-mode`) and updates the visible native selector for the *next* turn only.
- The selector colorization and model/effort mapping are local UI conveniences; authoritative history remains on AppServer and all thread reads/hydration use upstream `thread/read` with `includeTurns: true` (see `CUSTOM_BUILD.md` and `scripts/patch-local-canonical-mode.js`).

4) Seamless chat + minimal server-side mutation
- Patches (e.g., `patch-local-canonical-mode.js`) use careful surface-only edits: setMode-only selectors, local `cdr-local-mode-change` events, and safe composer/controller replacements so that server-side identifiers remain stable.
- The test harness `scripts/test-local-canonical-mode-patch.js` validates that patched bundles preserve required call sites and parse cleanly with Acorn.

5) Usage controls and telemetry for local inspection
- `patch-usage-controls.js` adds exact AppServer token and prompt-cache counters, observed account quota deltas, and optional per-task caps accessible via a local `/limits` endpoint.
- Telemetry and prompt-cache counters are exposed under `/status` for local inspection; tests assert expected deltas.

6) Resource saver / lifecycle tuning
- `patch-resource-saver.js` reduces detached/inactive defaults (e.g., from 32 pages / 30 minutes to 8 pages / 10 minutes) and tightens background defaults to save CPU and memory while keeping upstream protections.

7) Side‑by‑side packaging and isolated runtime
- The outer launcher installs a fingerprinted private runtime under `~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`, keeping CODEX_HOME and profile data isolated from the official app. Packaging scripts (`build-side-by-side-mac.js`, `build-from-upstream.js`) handle embedding the patched runtime into a launcher.

---

## Why this is a ChatGPT-style app for Codex
Community Codex adapts the ChatGPT UX and conversation semantics into the Codex client by:

- Mapping ChatGPT model listings to AppServer models, so the Chat UI selects Sol/Terra/Luna models rather than the original ChatGPT cloud catalog.
- Providing a sticky, chat‑like composer and send flow so conversations feel like a chat app and messages append naturally.
- Preserving server‑authoritative task history and thread reads (no covert server-side rewriting), so the rebuild is UX‑focused rather than invasive.

In short: the repo makes Codex behave like ChatGPT's chat app while keeping data, IDs, and history consistent with the original Codex AppServer.

---

## Files to inspect (where the magic lives)
- scripts/patch-local-canonical-mode.js — selector/composer/controller patches and durable notes
- scripts/_apply-sticky-chat-v43.js — sticky chat assembly, installs a patched ASAR
- scripts/_apply-chat-models-v37.js — converts ChatGPT catalog entries into AppServer model picker lists
- scripts/patch-usage-controls.js — token counters, `/limits` logic
- scripts/patch-resource-saver.js — lifecycle and detached tab defaults
- scripts/patch-latest-models.js — keeps Sol/Terra/Luna variants surfaced
- scripts/patch-all.js — runs all patches in a deterministic sequence
- scripts/test-*.js — local tests that verify patch invariants using Acorn-based parsing and targeted asserts
- src/mac-x64/_asar/ — patched runtime assets after the patches are applied

---

## Quick build & verification
Follow the repo canonical sequence (these scripts are in package.json):

```bash
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

If you want the side‑by‑side launcher only, `npm run build:side-by-side:x64` packages the patched runtime into the launcher (after building the runtime).

---

## Runtime & install paths
- Isolated runtime path: `~/Library/Application Support/CodexDesktop-Rebuild/` (the launcher installs `Codex.app` inside this folder)

---

## License
Community Codex is released under the MIT license. A full `LICENSE` file can be added if you want the canonical text in the repo.

---

## Contributing
- Read the patch scripts in `scripts/` and run their `test-*.js` helpers before opening PRs.
- Keep patches focused and reversible; all patch scripts parse target bundles with Acorn and fail closed on unexpected upstream drift.

---

Want me to make the README prettier or add a LICENSE file? See suggestions below.
