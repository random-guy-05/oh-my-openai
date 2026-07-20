# Intel Codex custom build

Supported upstream: official Intel macOS app `26.715.31925` (`5551`).

## Conversation architecture

Chat, ChatGPT Work, and Codex are local presets on the same native Codex task.
Preset selection never changes the route, AppServer task ID, sidebar data,
transcript owner, or submit transport.

`scripts/patch-local-canonical-mode.js`:

- stores only the selected preset in `cdr-product-mode`;
- keeps the native product surface normalized to Codex;
- updates the native model-and-effort setting only on an explicit preset click;
- overrides the next local collaboration mode with the same model and effort;
- colors the native send control by preset;
- leaves `thread/read`, `thread/turns/list`, and history hydration unchanged;
- routes model-consuming ChatGPT context handoffs and background resumes through
  GPT-5.6 Luna Light.

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

```sh
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

Patches structurally identify one expected target, parse modified JavaScript
again with Acorn, verify invariants, and fail closed on upstream drift.

The outer launcher atomically installs its fingerprinted private runtime under
`~/Library/Application Support/CodexDesktop-Rebuild/Codex.app`. The isolated
profile and Codex home survive runtime upgrades.

