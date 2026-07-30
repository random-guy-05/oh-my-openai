# Intel Codex custom build

Supported upstream: official Intel macOS app `26.721.41059` (`5848`).

## Conversation architecture

Chat mode remains on the current native Codex task and never swaps the route,
task ID, sidebar data, or native history owner for a ChatGPT conversation.
ChatGPT Work and Codex select their corresponding native product surfaces.
Chat is intercepted in the local submitter and uses the signed-in ChatGPT Web
`startCompletionStream` client while keeping the local task identity and
mixed transcript.

`scripts/patch-local-canonical-mode.js`:

- stores only the selected preset in `cdr-product-mode`;
- keeps Chat on the native local-task surface and uses native Work/Codex
  navigation for the other presets;
- updates the native model-and-effort setting only on an explicit preset click;
- overrides the next local collaboration mode with the same model and effort;
- colors the native send control by preset;
- leaves `thread/read`, `thread/turns/list`, and history hydration unchanged;
- routes model-consuming ChatGPT context handoffs and background resumes through
  GPT-5.6 Luna Light.

`_apply-26721-all-features.js` owns the Chat transport and live model catalog.
The picker consumes the current ChatGPT Web `models()` response directly; it
does not invent obsolete fallback rows, and filters only explicit Codex
namespaces. `CDRStickyChatSend` persists every Chat user/assistant row under
`cdr-thread-extras:local:<task-id>`. `_apply-chat-extras-render-v1.js` overlays
those rows into the native task transcript, so switching tasks and modes does
not hide or replace prior history.

`_apply-handoff-sync-v1.js` attaches only the missing cross-mode transcript
delta as hidden transport context and advances its watermark only after a
successful send. `_apply-chat-fake-stream-v1.js` retains its legacy filename
but now smooths live snapshots; it does not replay a completed response.

The visible Custom Providers settings panel writes `model_providers.<id>`
through the native config bridge. It supports Codex's Responses wire API,
rejects reserved built-in provider IDs, prefers `env_key`, and never persists
direct bearer-token values in local storage.

Referenced-thread context uses upstream `thread/read` with `includeTurns: true`.
Background transcript hydration also retains full turns. These reads are local
data operations and consume no model tokens.

## Usage and resource controls

Custom usage controls and transcript token badges are intentionally excluded;
the app leaves upstream account and usage surfaces unchanged.

`patch-resource-saver.js` preserves upstream lifecycle protections while
reducing detached inactive-browser defaults from 32 pages / 30 minutes to
8 pages / 10 minutes.

## Rebuild workflow

For a newly installed official Intel Codex base, the supported upgrade path is
one command:

```sh
npm run upgrade:x64
```

This snapshots the last-good source, imports the installed upstream, performs a
clean-source audit, applies the canonical feature manifest, runs every test and
the patched audit, reapplies the manifest to prove byte-for-byte idempotency,
then builds the runtime and side-by-side app. A failure restores the last-good
source and leaves a JSON report under `out/.reapply-runs/`.

Useful narrower commands:

```sh
npm run reapply:x64             # reapply and verify the current source
npm run reapply -- --plan       # print the ordered feature/test plan
npm run audit:clean             # audit a freshly synced upstream
npm run audit:patched           # audit a customized source
```

The manifest intentionally supports only `mac-x64` until every binary patcher
has a platform-neutral target resolver. Unsupported platforms fail instead of
silently producing a partly customized build.

The outer launcher atomically installs its fingerprinted private runtime under
`~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`. The isolated
profile and Codex home survive runtime upgrades.
