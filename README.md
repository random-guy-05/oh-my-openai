# Oh My OpenAI — A Community Rebuild of Codex

Community Codex is a readable, inspectable side‑by‑side rebuild of the Codex desktop runtime and launcher for macOS. It turns the Codex Electron client into a ChatGPT‑like experience while preserving upstream task history and AppServer transport — a Community edition of Codex built for chat-first workflows.

This README emphasizes the novel features implemented in the codebase, especially the chat mode and presets, and explains how this is effectively a ChatGPT app adapted to the Codex runtime.

## Quick Install (Homebrew)

**One-liner:**

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

Or if you'd like to tap for easier upgrades:

```sh
brew tap random-guy-05/oh-my-openai https://github.com/random-guy-05/oh-my-openai.git
brew install --cask codex-desktop
```

The cask downloads the latest DMG, installs `Codex.app` to `/Applications`,
strips the Gatekeeper quarantine (the build is ad-hoc signed), and opens the
app automatically. On first launch the launcher extracts its private runtime
from the embedded payload and starts Codex.

To update to a new release:

```sh
brew upgrade --cask codex-desktop
```

To uninstall (removes the app and all private runtime data):

```sh
brew uninstall --zap --cask codex-desktop
```

> **Note:** The tap URL is explicit because the repository is not prefixed
> with `homebrew-`. This is intentional — the cask lives alongside the build
> scripts in the same repo.

## Current build (26.721.41059) — July 30, 2026

### Recent fixes
- **Custom Providers settings — fully functional**: The settings panel now correctly renders with working React hooks bindings. Add custom models by base URL and API key directly from Settings. Supports Responses-compatible providers with env-var credential recommendations. Secrets are never cached in local storage.
- **Chat lifecycle — fully polished**: Stop button correctly switches back to Send icon after stream completes. Mode switching (ChatGPT ↔ Chat ↔ Codex) navigates properly before reloading — no more stuck loading screens.
- **Chat → Codex thread preservation**: Chat thread context is saved on mode switch so conversations can be resumed when switching back.
- **Correct Chat navigation**: Chat sends navigate to `/local/<task-id>` using the app's internal router (`Kf.dispatchHostMessage`) instead of `window.location.hash`, ensuring reliable routing.
- **Live stream smoothing**: Real stream snapshots are rendered at a short, even cadence, with a bounded final drain instead of an artificial post-response word replay.
- **Complete mixed history**: Persisted Chat rows remain visible beside native Codex rows after changing modes or tasks, without replacing native turn IDs.
- **Clean handoffs**: Chat and Codex exchange only the missing transcript delta as hidden context; the message the user sees remains exactly what they typed.

---

## Quick summary
- Name: Community Codex (side‑by‑side rebuild)
- Platform focus: mac-x64 (Intel) with mac-arm64 supported
- Purpose: expose ChatGPT‑style chat mode and presets inside the native Codex client, plus usage/resource controls, observability, and reproducible build tooling

---

## What makes Community Codex different (novel features)
These are the actual features implemented in the repository (look in `scripts/` and `src/mac-x64/_asar/` for the code):

1) **Chat first, same-task behavior**
- Chat mode stays on the current native Codex task, route, and sidebar. ChatGPT and Codex activate their corresponding native surfaces without repurposing ChatGPT conversation IDs as Codex task IDs.
- The local Codex submitter routes Chat turns through ChatGPT Web's `startCompletionStream`; `CDRStickyChatSend` persists every Chat row and the transcript overlay renders it in the same task.
- Background resume & handoffs are routed to a lightweight GPT-5.6 flavor (Luna Light) to resume state or fetch context without consuming the heavier model budget.

2) **Live ChatGPT model picker**
- Chat mode reads the signed-in ChatGPT Web `models()` response as its source of truth, shows the current selectable models, and filters only explicit Codex namespaces. It does not use obsolete hard-coded fallback families.

3) **UI‑visible presets (Chat, ChatGPT, Codex) with safe semantics**
- Three presets are exposed in the selector. Chat keeps the native task/sidebar in place; mode changes immediately update the model selector, effort, and preset-colored Send button.
- The selector colorization and model/effort mapping are local UI conveniences; authoritative history remains on AppServer and all thread reads/hydration use upstream `thread/read` with `includeTurns: true` (see `CUSTOM_BUILD.md` and `scripts/patch-local-canonical-mode.js`).

4) **Custom Providers settings panel**
- A dedicated settings section for integrating custom models and providers by base URL and API key.
- Uses the open-source Codex CLI backend which already supports custom provider configuration.
- Writes Responses-compatible providers to Codex `model_providers` config. Environment-variable credentials are recommended; secrets are never cached in local storage.

5) **Seamless chat + minimal server-side mutation**
- Patches (e.g., `patch-local-canonical-mode.js`) use careful surface-only edits: setMode-only selectors, local `cdr-local-mode-change` events, and safe composer/controller replacements so that server-side identifiers remain stable.
- The test harness `scripts/test-local-canonical-mode-patch.js` validates that patched bundles preserve required call sites and parse cleanly with Acorn.

6) **Usage controls and telemetry for local inspection**
- Telemetry and prompt-cache counters are exposed under `/status` for local inspection; tests assert expected deltas.

7) **Resource saver / lifecycle tuning**
- `patch-resource-saver.js` reduces detached/inactive defaults (e.g., from 32 pages / 30 minutes to 8 pages / 10 minutes) and tightens background defaults to save CPU and memory while keeping upstream protections.

8) **Side‑by‑side packaging and isolated runtime**
- The outer launcher installs a fingerprinted private runtime under `~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`, keeping CODEX_HOME and profile data isolated from the official app. Packaging scripts (`build-side-by-side-mac.js`, `build-from-upstream.js`) handle embedding the patched runtime into a launcher.

---

## Why this is a ChatGPT-style app for Codex
Community Codex adapts the ChatGPT UX and conversation semantics into the Codex client by:

- Reading the real ChatGPT Web model catalog and using the ChatGPT stream transport for Chat turns.
- Providing a same-task composer and transcript overlay so messages remain visible after task/mode switches.
- Preserving server‑authoritative task history and thread reads (no covert server-side rewriting), so the rebuild is UX‑focused rather than invasive.

In short: the repo makes Codex behave like ChatGPT's chat app while keeping data, IDs, and history consistent with the original Codex AppServer.

---

## Files to inspect (where the magic lives)
- scripts/_apply-26721-all-features.js — ChatGPT stream bridge, local submit route, live catalog, usage runtime
- scripts/_apply-chat-catalog-v3.js — live ChatGPT model catalog integration
- scripts/_apply-chat-catalog-v4.js, _apply-chat-catalog-v5.js — catalog refinements
- scripts/_apply-chat-extras-render-v1.js — same-task Chat transcript overlay
- scripts/_apply-chat-fake-stream-v1.js — animated streaming effect for Chat mode
- scripts/_apply-chat-picker-style-v1.js — Chat model picker UI
- scripts/_apply-chat-real-v2.js — catalog-backed Chat picker behavior
- scripts/_apply-chat-stream-lifecycle-v1.js — stream lifecycle management (Stop → Send)
- scripts/_apply-chat-ux-v1.js — Chat UX improvements
- scripts/_apply-custom-providers-settings-v1.js — Custom Providers settings panel
- scripts/_apply-handoff-sync-v1.js — bidirectional Chat ↔ Codex handoff sync
- scripts/_apply-luna-context-v2.js — Luna Light context resume
- scripts/_apply-mode-switch-work-v1.js — Work → Chat mode switch fix
- scripts/_apply-mode-ui-invariants-v1.js — mode switching UI invariants
- scripts/_apply-transcript-publisher-v1.js — transcript overlay publishing
- scripts/_apply-turn-usage-v2.js — per-turn token usage badges
- scripts/patch-local-canonical-mode.js — selector/composer/controller patches and durable notes
- scripts/patch-resource-saver.js — lifecycle and detached tab defaults
- scripts/patch-latest-models.js — keeps Sol/Terra/Luna variants surfaced
- scripts/patch-all.js — runs all patches in a deterministic sequence
- scripts/custom-features.js — canonical ordered feature/platform/dependency manifest
- scripts/reapply-customizations.js — transactional one-command reapply, verification, rollback, and build workflow
- scripts/test-*.js — local tests that verify patch invariants using Acorn-based parsing and targeted asserts
- scripts/verify-features.js — behavioral feature gate verification
- scripts/verify-packaged-runtime.js — packaged runtime integrity checks
- src/mac-x64/_asar/ — patched runtime assets after the patches are applied

---

## Quick build & verification

After updating the official Intel Codex app, reapply every customization and
build the side-by-side app with one command:

```bash
npm ci
npm run upgrade:x64
```

The command snapshots the last-good `src/mac-x64`, syncs the installed official
base, audits it as clean, applies the feature manifest, runs regression and
post-patch verification, proves a second apply is byte-identical, and builds.
Failures automatically restore the snapshot. Each run writes a machine-readable
report under `out/.reapply-runs/`.

Use `npm run reapply:x64` to safely reapply/verify the source already in this
checkout, or `npm run reapply -- --plan` to inspect the exact ordered plan.

---

## Runtime & install paths
- Isolated runtime path: `~/Library/Application Support/CodexDesktop-Rebuild/` (the launcher installs `Codex.app` inside this folder)

---

## Manual Installation

Download the DMG from the [latest release](https://github.com/random-guy-05/oh-my-openai/releases),
open it, and drag **Codex** to Applications. The build is ad-hoc signed and
not notarized, so first launch may require Control-click → Open and a
Keychain Always Allow approval.

## License

Community Codex is released under the MIT license.

---

## Contributing
- Read the patch scripts in `scripts/` and run their `test-*.js` helpers before opening PRs.
- Keep patches focused and reversible; all patch scripts parse target bundles with Acorn and fail closed on unexpected upstream drift.
