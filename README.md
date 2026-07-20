# Oh My OpenAI

Custom Intel macOS Codex build packaged side-by-side with the official app.

## Current build

- Upstream: `26.715.31925` (`5551`)
- Custom revision: `5551.13`
- Architecture: Intel `x86_64`
- Installer: `out/Codex-side-by-side-mac-x64-26.715.31925.dmg`
- SHA-256: `111e7dd8458ac36e973e7760a666120da16ccceaa9eb10e1c7a0684662ea2d18`

## Local task presets

The selector exposes three presets without changing the native Codex task,
route, sidebar selection, transcript, or AppServer transport:

| Preset | Model | Send color |
| --- | --- | --- |
| Chat | GPT-5.6 Sol, Medium | black |
| ChatGPT Work | GPT-5.6 Terra, Light | blue |
| Codex | GPT-5.6 Sol, High | red |

Switches update the visible native model selector and the model used by the
next turn. Full task history stays authoritative in AppServer and remains
available after switching presets or tasks.

Existing ChatGPT-conversation context handoffs and background task resumes use
GPT-5.6 Luna Light. Plain thread reads use no model or tokens and request full
turn history.

## Other customizations

- Exact AppServer token and prompt-cache telemetry in `/status`.
- Observed per-task 5-hour and weekly usage deltas.
- Optional `/limits` caps for cumulative tokens and observed quota percentage.
- Usage and telemetry stores are bounded.
- Detached inactive-browser defaults are reduced to 8 pages and 10 minutes.
- Latest GPT-5.6 Sol, Terra, and Luna models remain available.
- Isolated profile, `CODEX_HOME`, private runtime, bundle IDs, and URL scheme.

## Build and verify

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

The order matters: `build:mac-x64` repacks patched source into the runtime;
`build:side-by-side:x64` then embeds that runtime in the launcher.

Durable custom logic lives in `scripts/`, principally:

- `patch-local-canonical-mode.js`
- `patch-usage-controls.js`
- `patch-resource-saver.js`
- `patch-latest-models.js`
- `patch-all.js`

Compiled upstream application assets live under `src/mac-x64/_asar/`.

## Installation

The launcher is `io.haleclipse.codexdesktop.launcher`; the private runtime is
`io.haleclipse.codexdesktop.runtime`. Runtime data is preserved under:

```text
~/Library/Application Support/CodexDesktop-Rebuild/
```

The build is ad-hoc signed and not notarized, so first launch may require
Control-click → Open and a Keychain Always Allow approval.

