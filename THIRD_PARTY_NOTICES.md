# Third-party notices

## NerfTrack

This build bundles the unmodified NerfTrack macOS Intel desktop application as
the native usage dashboard enhancement.

- Project: [NerfTrack/NerfTrack](https://github.com/NerfTrack/NerfTrack)
- Release: `v1.1.2`
- License: GPL-3.0-only
- Source and license text: [upstream repository](https://github.com/NerfTrack/NerfTrack)
- Bundled asset: `NerfTrack-1.1.2-macos-x86_64.dmg`
- Bundled asset SHA-256: `5e132574fd6216516095f17bd20ad8fc5a3b6c2aad8971a75f4f37ac732994f7`

NerfTrack remains a separate application inside the enhancement bundle. Its
copyright, license, and third-party notices remain governed by the upstream
project and its bundled notice files.

## Codex Web GPT

This build bundles the upstream Codex Web GPT loopback bridge runtime. Its
command-center entry is wrapped by a repo-owned local dashboard; the upstream
runtime is supervised as a hidden service rather than opened as a second app.

- Project: [miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)
- Release: `v2.1.11`
- License: MIT
- Bundled asset: `codex-chatgpt-web-darwin-amd64.tar.gz`
- Bundled asset SHA-256: `447f37729c8709dfd72a5acf8d195376774e8b49e3ce05015dac61933c8d83a1`

The dashboard overlay is part of this repository; the upstream runtime and
its own license and third-party notices remain governed by the upstream
project.
