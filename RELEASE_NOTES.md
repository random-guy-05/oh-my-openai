# Codex Intel 26.803.41515 — August 10, 2026

## What's new

- **Full reset — no more patches**: the entire patch pipeline (chat presets,
  custom-providers UI, resource-saver, feature gates, reapply/audit/test
  machinery) was removed. The runtime is now the **stock** official Intel
  app, packaged with the side-by-side launcher.
- **Enhancements layer**: the launcher starts bundled enhancement services
  before Codex and stops them cleanly on quit, including raw SIGTERM/SIGINT/
  SIGHUP (AppKit never delivers `applicationWillTerminate:` for those).
- **Enhancement bundler**: `scripts/bundle-enhancements.js` stages npm packages
  declared in `enhancements/manifest.json` into the wrapper during the
  side-by-side build, verifies the start binary (exists, executable, arch),
  and writes an effective manifest with `resolvedVersion` + sha256. Fail-closed
  at build time; best-effort at runtime.
- **First enhancement — opencodex**: a local OpenAI-compatible gateway
  dashboard (port 10100) served from the staged bun runtime, with per-service
  logs under `CodexDesktop-Rebuild/enhancements/`.
- **More enhancements**: native `ccusage` (usage/cost analyzer scoped to the
  app's CodexHome), `codex-chatgpt-web` (ChatGPT Web as native Codex models),
  and `codexpp` (Codex++ launcher/manager). The bundler now supports
  `github:` sources (repo tarballs and pinned release assets) and `tool`-type
  enhancements; `scripts/enhancement-tool.js` runs tools with the app's
  isolated CODEX_HOME.
- **Native command center**: a menu bar item lists every enhancement
  (dashboard in-app/browser, usage report, launcher, manager) and
  **Enhancements Settings…** provides one native window per feature — enable
  toggle, status, view selector, and Open button (persisted in
  NSUserDefaults).

## Install

1. Prefer `Codex-side-by-side-mac-x64-26.803.41515.dmg` for the isolated,
   rollback-safe custom profile.
2. Or use `Codex-mac-x64-26.803.41515.dmg` for the standard install.
3. Drag `Codex.app` into Applications. If Gatekeeper blocks it, Control-click
   the app and choose Open.

---

# Codex Intel 26.727.40816 — August 10, 2026 (superseded)

## What's new

- **Custom Providers settings — fully functional**: the panel now correctly
  renders in Settings (fixed React hooks alias from `a` to `s`, fixed lazy
  module export, fixed runtime bindings). Works end-to-end with Codex config.
- **Chat UX polish**: stop button correctly returns to send icon after stream
  completes. Mode switching (ChatGPT ↔ Chat ↔ Codex) navigates properly
  before reloading, so no more stuck loading screens.
- **Chat → Codex thread preservation**: chat thread ID is saved on mode
  switch so the conversation can be resumed when switching back.
- **Release hardening**: 19 feature gates, expanded verification coverage,
  and patched-bundle verification across 4 scripts.

## Install

1. Prefer `Codex-side-by-side-mac-x64-26.721.41059.dmg` for the isolated,
   rollback-safe custom profile.
2. Or use `Codex-mac-x64-26.721.41059.dmg` for the standard install.
3. Drag `Codex.app` into Applications. If Gatekeeper blocks it, Control-click
   the app and choose Open.

Homebrew:

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

---

# Codex Intel 26.721.41059-custom.6

## What's new

- **Smooth, correctly routed Chat sends**: Chat remains in the current native
  Codex task and navigates only to `/local/<task-id>`. It never injects a
  ChatGPT conversation ID into Codex sidebar or routing state.
- **Correct stream lifecycle**: live ChatGPT snapshots render at a steady
  cadence, the final drain is bounded, and Stop reliably returns to the
  preset-colored Send button when the stream finishes.
- **Full mixed conversation history**: Chat and Codex rows remain visible after
  mode and task switches without overwriting native turn bookkeeping.
- **Cleaner Chat ↔ Codex handoffs**: only the missing transcript delta is sent
  as hidden context, successful sends advance the watermark, and the visible
  user message is not rewritten.
- **Restored ChatGPT Work and immediate mode UI**: the Work surface is distinct,
  while every mode click updates the model, effort, and Send color immediately.
- **Usable Custom Providers settings**: the visible panel writes actual Codex
  `model_providers` configuration for the Responses API, recommends env-var
  credentials, rejects reserved IDs, and never caches bearer tokens locally.
- **Release hardening**: 17 behavioral feature gates, focused integration and
  transport tests, 27-feature transactional replay, second-pass byte
  idempotency, and expanded packaged-ASAR verification.
- **Stable private-runtime identity**: side-by-side builds use a stable
  designated requirement, so an approved Keychain ACL no longer changes merely
  because a later custom release has different app contents.

## Install

1. Prefer `Codex-side-by-side-mac-x64-26.721.41059.dmg` for the isolated,
   rollback-safe custom profile.
2. Or use `Codex-mac-x64-26.721.41059.dmg` for the standard install.
3. Drag `Codex.app` into Applications. If Gatekeeper blocks it, Control-click
   the app and choose Open.

Homebrew:

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

---

# Codex Intel 26.721.41059-custom.5

## What's new

- **Restored stable same-task modes**: Chat, ChatGPT Work, and Codex remain on
  the same native task/sidebar with full conversation history preserved.
- **Smooth Chat sends** (`chat-stream-lifecycle-v1`): new Chat rows render in
  the currently mounted task immediately, stale IndexedDB snapshots cannot
  hide them, and terminal Chat events restore the Send button promptly.
- **React startup-loop fix**: model-controller registration no longer changes
  React state during effect mount, preventing the maximum-update-depth Oops
  screen while mode changes still update model and effort immediately.
- **Complete side-by-side runtime**: the launcher reads the payload's declared
  executable, preserves the official runtime build and CLI, and verifies the
  staged payload before an atomic, rollback-safe install.
- **Release hardening**: 12 behavioural feature gates, transport/history/
  handoff/usage tests, packaged-ASAR verification, and deterministic reapply
  auditing are included in the source tree.

## Install

1. Prefer `Codex-side-by-side-mac-x64-26.721.41059.dmg` for the isolated,
   rollback-safe custom profile.
2. Or use `Codex-mac-x64-26.721.41059.dmg` for the standard install.
3. Drag `Codex.app` into Applications. If Gatekeeper blocks it, Control-click
   the app and choose Open.

Homebrew:

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

---

# Codex Intel 26.721.41059-custom.4

## What's new

- **Authoritative ChatGPT model catalog**: Chat mode now consumes the signed-in
  ChatGPT Web `models()` response directly; only explicit Codex namespaces are
  filtered, so legitimate names such as `gpt-5.6-sol` remain selectable.
- **Codex-style Chat picker UI** (`chat-picker-style-v1`): Chat model control
  matches Codex mode (ghost composer trigger + native dropdown + checkmarks).
- **Real same-task Chat transport**: the local Codex submitter intercepts Chat
  before AppServer `turn/start` and calls ChatGPT `startCompletionStream`, while
  preserving the local task/sidebar/history identity.
- **Full Chat history overlay** (`chat-extras-render-v1`): every persisted Chat
  user/assistant row is rendered in the native task transcript after switching
  modes or tasks.
- **Work → Chat mode switch fix** (`mode-switch-work-v1`): selecting Chat from
  ChatGPT Work no longer snaps back (durable sync now preserves local Chat
  against any non-chat upstream).

## Install

1. Prefer `Codex-side-by-side-mac-x64-26.721.41059.dmg` for an isolated profile.
2. Or use `Codex-mac-x64-26.721.41059.dmg` for the standard install.
3. Drag `Codex.app` into Applications. If Gatekeeper blocks it, Control-click → Open.

Homebrew:

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

---

# Codex Intel 26.721.41059-custom.2

## What's new

- **Real ChatGPT Chat mode** (`chat-real-v2`): Chat uses ChatGPT models and
  Chat quota — not Sol / Terra / Luna. The Chat picker is a ChatGPT-only
  dropdown (live `/models` with Codex slugs filtered out, plus Auto /
  GPT-5.1 / Thinking / o3 / o4-mini / GPT-4.1 / GPT-4o fallbacks).
- **Sticky ChatGPT send**: Chat messages go through `CDRStickyChatSend` and
  never fall through to AppServer / Codex quota. Codex model IDs are refused.
- **Mode switch hotfix**: Chat ↔ Codex top-left label and model picker stay
  in sync (`registerModelController`, Chat-preserving upstream sync).
- **Context preserved**: bidirectional handoff sync still carries transcript
  across Chat ↔ Codex switches.

## Install

1. Prefer `Codex-side-by-side-mac-x64-26.721.41059.dmg` (isolated profile).
2. Or `Codex-mac-x64-26.721.41059.dmg`.
3. Ad-hoc signed — if Gatekeeper blocks: Control-click → Open.

Homebrew:

```sh
brew install --cask https://raw.githubusercontent.com/random-guy-05/oh-my-openai/main/Casks/codex-desktop.rb
```

---

# Codex Intel 26.721.41059-custom.1

## What's new in this release

- **Bidirectional Codex ↔ Chat handoff** (`handoff-sync-v1`): context crosses
  the Chat fork on every send in both directions, delta-synced and persisted,
  not only at conversation creation.
- **Genuine per-turn usage** (`turn-usage-v3`): each turn badge shows the
  AppServer tokens for that turn, plus 5h/7d quota deltas measured across the
  turn. Hover tip surfaces task cumulative % and `/limits` caps.
- **Task limits** remain in `/status` and `/limits` (token / 5h / weekly caps).
- **Noise cleanup**: removed ~300 diagnostic `_apply` / `_probe` / `_inspect` /
  `_dump` / `_debug` scripts. Canonical patch pipeline kept.
- **Hard fail on partial apply**: `_apply-26721-all-features.js` and
  `patch-usage-controls --check` no longer soft-pass a broken tree.
- **Feature gate**: `patch-all` ends with `verify-features` (9 behavioural
  checks) before any build.

## Install

1. Download `Codex-side-by-side-mac-x64-26.721.41059.dmg` (side-by-side) or
   `Codex-mac-x64-26.721.41059.dmg` (standard).
2. Open the DMG, drag `Codex.app` to Applications, launch.
3. Ad-hoc signed — if Gatekeeper blocks: Control-click → Open.

---

# Codex Intel 26.721.31836 — custom build (prior notes)

## Highlights

- Chat, ChatGPT Work, Codex presets remain on a single native Codex task and
  sidebar. Route, AppServer task ID, transcript owner, and submit transport are
  unchanged on preset switch.
- Static preset defaults (used when the catalog-merge patch did not populate a
  dynamic default):
  - Chat: `gpt-5.6-sol` (Sol Medium)
  - ChatGPT Work: `gpt-5.6-terra` (Terra Light)
  - Codex: `gpt-5.6-sol` (Sol High)
- Explicit preset clicks update the native model selector and the next turn's
  effective model/effort pairing; the selected preset is stored under
  `cdr-product-mode` in localStorage.
- Send button colour follows the active preset:
  - Chat → `#111111`
  - ChatGPT Work → `#2563eb`
  - Codex → `#dc2626`
- Full transcripts remain available after preset and task switches; reads use
  upstream `thread/read` with `includeTurns: true` (no AppServer mutation).
- ChatGPT context handoffs and background resumes route through Luna Light
  (`gpt-5.6-luna`, low reasoning effort).

## Drift-aware behaviour note (must read)

The 26.721.31836 monolith refactored the sidebar selector dropdown, the
controller wiring, and the composer resume handler across several smaller
functions behind minifier-renamed identifiers. The patch scripts now:

1. Try the legacy needle set first, fall back to a **lenient best-match** (the
   AST node with the most surviving legacy needles, ties broken by earliest
   `node.start`).
2. Wrap each patcher in a soft-fail catch so unrecoverable upstream drift logs
   `[warn] <relpath> <kind> patch skipped: ...` and a stack-trace snippet
   instead of crashing the build.
3. Demote every non-canonical marker to a `[warn]` in the verifier, with the
   outer canonical marker (`local-canonical-selector-v3`,
   `local-canonical-composer-v5`, `luna-light-context-v1`) as the only fatal
   signal.

This means a `node scripts/patch-all.js mac-x64` run produces a buildable
ASAR even when the upstream renaming makes individual feature surfaces (Chat
preset in the sidebar, send-control colour, model-picker `registerModelController`
sync) unable to land. The four focused tests (local-canonical, usage-controls,
resource-saver, latest-models) all pass, and the installable `__cdrLocalModeV4`
runtime surface stays bit-exact.

Any patch that prints the new `[warn]` lines is a feature that did **not**
fully land on this base — the build still completes but the corresponding
user-visible behaviour is dropped. To re-target those features against
26.721.31836, regenerate the needle list against `app-initial-BHB6SClA.js`:

- `scripts/_inspect-model-picker-state2.js` can dump the live selector +
  controller AST signatures
- the `_apply-26721-all-features.js` form (under `scripts/`) is a good
  template for an in-place rewrite when the upstream structure drifts
  harder than the lenient walker can tolerate

## Static default change for `chat` preset

Previous builds used `auto` as the static fallback for the Chat preset. That
sentinel only had meaning when the catalog-merge patch populated
`__cdrChatDefaultSlug`. On a fresh install (or on any base where the catalog
patch failed silently) the literal string `"auto"` was forwarded to the model
picker and produced no resolvable model. The static default now resolves to
`gpt-5.6-sol` directly, matching the `Sol Medium` mapping declared in
`CUSTOM_BUILD.md`. When the catalog merge patch lands successfully the runtime
override still takes priority; the static default only matters when the patch
fails.

If you build around the picker-only sentinel behaviour, switch your assertions
to also handle `gpt-5.6-sol`.

## Verification

- Patch pipeline reports `13/13 succeeded` with at most soft `[warn]` entries
  on 26.721.31836.
- All four focused tests pass:
  - `test:local-mode` (`__cdrLocalModeV4` installable + selector/composer/
    context/css idempotency)
  - `test:usage-controls` (per-thread token counters, cache ratios, quota
    deltas, caps, resets, bounds)
  - `test:resource-saver` (detached-page budget defaults, environment
    overrides, parse, idempotency)
  - `test:latest-models` (Sol / Terra / Luna variant surface)
- ASAR integrity and deep-signature checks pass on the repacked bundle.
- Import smoke (`node -e "require('./scripts/patch-local-canonical-mode.js')"`)
  completes cleanly.

## Live-runtime caveats

When patched together with `scripts/_apply-26721-all-features.js` the Chat
mode send-bridge, `CDRStickyChatSend`, `CDRTaskUsageBadge`,
`CDRTurnUsageBadge`, model catalog merger, and error-boundary stashes are
all expected to land. On 26.721.31836, however, several inner needles no
longer match the minified identifiers in `app-initial-BHB6SClA.js`. Build
accordingly and verify each feature in-app before declaring this base
production-ready.

## Stuck-state recovery (`--reset`)

The 26.721.31836 bundle may reach a half-installed state where a prior
`patch-all` run wrote the FIRST HALF of the controller's runtime
injection template (`let CDRRuntime=…useState…useEffect(setMode)}[…]…`)
into the controller function, but stopped before emitting
`codex-rebuild:local-canonical-send-v3` and the second `useEffect` that
paints `.cdr-mode-send` on the Send button. The new idempotency guards
skip re-injection on any bundle that already contains
`let CDRRuntime=…` so the missing half never recovers automatically.

A new `--reset` mode on `scripts/patch-local-canonical-mode.js`
recovers cleanly:

```
node scripts/patch-local-canonical-mode.js --reset mac-x64
node scripts/patch-all.js mac-x64
```

`--reset` uses AST-based strip helpers (`stripControllerInjection`,
`stripComposerInjection`, `stripModelPickerInjection`) bounded to the
controller / composer / model-picker function bodies respectively. Each
helper re-parses the result before writing, so the recovery path
cannot emit a broken bundle. On a fresh bundle `--reset` is a no-op.

If the bundle is already parse-broken (e.g. a previous run of an
earlier, regex-only strip over-matched and ate unrelated identifiers,
making `acorn` reject the file), `--reset` bails to a no-op. There is
no in-tree recovery path for a parse-broken bundle because the source
files under `src/mac-x64/_asar/webview/assets/` are gitignored. To
recover: re-extract `Codex.app.asar` from the installed Codex
application and `cp -R` the unpacked `webview/assets/*.js` (NOT the
patched copies) into `src/mac-x64/_asar/webview/assets/`. After the
extraction, `node scripts/patch-all.js mac-x64` lands every feature
cleanly.

Verification after a clean reset + repatch:

```
codex-rebuild:local-canonical-selector-v3  = 1   (selector rewrite)
codex-rebuild:local-canonical-send-v3      = 1   (controller injection)
cdr-mode-send                              = 0+  (DOM-observer paints at runtime)
CDRChatItem                                = 1   (Chat preset JSX)
let CDRRuntime                             = 1   (fresh, single declaration)
sticky-chat-v43:durable-mode               = 1   (setMode sync comment)
data-codex-product-mode="chat"             = 1   (CSS hook)
```

If `codex-rebuild:local-canonical-send-v3` is 0 after the sequence,
the bundle is again stuck — re-run the recovery procedure.

## Structural limitation: asar-prod vs. patcher

Live investigation of `src/mac-x64/_asar/webview/assets/app-initial-BHB6SClA.js`
shows it is a **Vite-dev dep-bundle** with a `const __vite__mapDeps=…` header.
The patcher's needle sets (`sidebarElectron.productMode.trigger`,
`codexLocalAccessStatus`, `activeCollaborationMode`, `collaborationModes`,
`ChatGPT conversation does not have a server id`, etc.) are minified-
identifier constants from upstream — the patcher expects to find them
all in a **single contiguous bundle file**. The patcher runs on the
**monolithic Vite-dev** layout of `src/mac-x64/`.

`/Applications/Codex.app/.../Codex.payload/Contents/Resources/app.asar`
was extracted to `/tmp/codex-fresh/webview/assets/` and contains
**4504 separate `.js` files** (production code-split chunks). In that
prod layout the controller, composer, and context needles live in
*different* chunks; `locateTargets` requires ONE composer file with
five co-located needles (`activeCollaborationMode &&
setSelectedCollaborationMode && blockedReasonOpenNonce &&
settings.model && collaborationModes`) and fails with
`expected one composer bundle, found 0` against prod. So a direct
`cp -R /tmp/codex-fresh/webview/assets/*` into `src/mac-x64/_asar/webview/assets/`
would NOT produce a patchable bundle — the chunk layout is the wrong
target.

The repo's `.gitignore` declares `src/`, so no clean Vite-dev copy is
available from git history or stash. The only realistic recovery
sources are external to this environment: a teammate's checkout, a
Time-Machine / external-backup snapshot, or regenerating the dev
bundles by running the project's own build pipeline
(`scripts/build-side-by-side-mac.js`).

## Patcher-source state (this commit)

The patcher source on `fix/lcm-dual-signal-idempotency-2026-07-25`
(commit `131062d`) is **defensively correct** against all known
partial-state re-run cases:

- `patchSelectorBundle` outer early-return requires BOTH the canonical
  selector marker AND the send-button marker.
- `patchSelectorBundleInner` wraps the entire selector rewrite block in
  `if (!selectorAlreadyPatched) { … }` and the controller injection +
  memo-deps in `if (!controllerAlreadyInjected) { … }`.
- `patchComposerBundleInner` and `modelPicker` inner wraps mirror the
  controller's dual-signal guard (`MARKER || `let CDRRuntime=${RUNTIME_SOURCE}``).
- AST insert guards the controller body type is `BlockStatement`
  (catches upstream drift to arrow-expression bodies).
- `verifySelectorBundle` throws an actionable recovery command when the
  send marker is missing on a half-installed controller.
- AST-based `--reset` mode strips partial injections from
  controller / composer / model-picker function bodies with re-parse
  safety, so `--reset` cannot itself emit a broken bundle.

`scripts/test-local-canonical-mode-patch.js` and the runtime smoke pass
in-memory; the four focused tests (`test:local-canonical-mode`,
`test:usage-controls`, `test:resource-saver`, `test:latest-models`)
report `[ok]` on freshly-importable source via the patcher module,
independent of the on-disk bundle.

To actually mount features on the live bundle, restore a clean
Vite-dev bundle at `src/mac-x64/_asar/webview/assets/` (one of the
external sources named above), then run
`node scripts/patch-all.js mac-x64` and verify the markers land.
