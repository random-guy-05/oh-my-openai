# Codex Intel 26.715.31925 — custom build 5551.13

## Highlights

- Chat, ChatGPT Work, and Codex now remain on one native Codex task and sidebar.
- Explicit preset clicks immediately update the native model selector and next
  turn model:
  - Chat: GPT-5.6 Sol Medium
  - ChatGPT Work: GPT-5.6 Terra Light
  - Codex: GPT-5.6 Sol High
- Send styling is black, blue, and red respectively.
- Full transcripts remain available after preset and task switches.
- ChatGPT context handoffs and background resumes use GPT-5.6 Luna Light.
- Startup no longer mutates model settings for stale or home conversations.
- Existing token/cache telemetry, per-task caps, bounded stores, and detached
  browser resource limits remain enabled.

## Verification

- All focused patch tests passed.
- Aggregate patch pipeline passed `13/13` and an idempotent `--check`.
- Packaged ASAR integrity and strict deep signatures passed.
- Live installed-app validation confirmed:
  - native runtime `__cdrLocalModeV4`;
  - no startup model-setting error;
  - Chat → Sol Medium;
  - ChatGPT Work → Terra Light;
  - Codex → Sol High;
  - send colors `#111111`, `#2563eb`, and `#dc2626`;
  - unchanged active task ID during preset switches;
  - earliest transcript turns still load after switching tasks.

Installer SHA-256:

```text
111e7dd8458ac36e973e7760a666120da16ccceaa9eb10e1c7a0684662ea2d18
```
