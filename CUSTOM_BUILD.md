# Intel Codex custom build

Supported upstream: official Intel macOS app `26.721.41059` (`5848`).

## Conversation architecture

Chat, ChatGPT Work, and Codex are local presets on the same native Codex task.
Preset selection never changes the route, task ID, sidebar data, or native
history owner. Work/Codex use AppServer; Chat is intercepted in the local
submitter and uses the signed-in ChatGPT Web `startCompletionStream` client,
while keeping the local task identity and transcript.

`scripts/patch-local-canonical-mode.js`:

- stores only the selected preset in `cdr-product-mode`;
- keeps the native product surface normalized to Codex;
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

Referenced-thread context uses upstream `thread/read` with `includeTurns: true`.
Background transcript hydration also retains full turns. These reads are local
data operations and consume no model tokens.

## Usage and resource controls

`patch-usage-controls.js` adds exact AppServer token/cache counters, observed
account-quota deltas, and optional per-task caps without resetting baselines
when limits change.

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
