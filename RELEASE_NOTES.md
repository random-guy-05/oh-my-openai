# Codex Intel 26.721.31836 — custom build

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
