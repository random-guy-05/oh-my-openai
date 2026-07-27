cask "codex-desktop" do
  version "26.721.41059"
  # Side-by-side DMG hash for v26.721.41059-custom.3
  # (chat catalog v5 + Codex-style picker + Work→Chat switch fix).
  # Recompute via `shasum -a 256 out/Codex-side-by-side-mac-x64-*.dmg`
  # after every `npm run build:mac-x64` + `npm run build:side-by-side:x64`.
  sha256 "PLACEHOLDER_UPDATE_AFTER_BUILD"

  url "https://github.com/random-guy-05/oh-my-openai/releases/download/v#{version}-custom.3/Codex-side-by-side-mac-x64-#{version}.dmg",
      verified: "github.com/random-guy-05/oh-my-openai/releases/"
  name "Codex Desktop"
  desc "Custom Codex build with ChatGPT models, usage controls, and per-turn tokens"
  homepage "https://github.com/random-guy-05/oh-my-openai"

  depends_on macos: :ventura

  app "Codex.app"

  postflight do
    # The build is ad-hoc signed (not notarized). Strip the quarantine
    # attribute so Gatekeeper does not block first launch.
    system_command("xattr",
                   args: ["-rd", "com.apple.quarantine", "#{appdir}/Codex.app"])
    # Launch the app — the launcher installs its private runtime from the
    # embedded payload on first run, then opens Codex.
    system_command("open",
                   args: ["#{appdir}/Codex.app"])
  end

  zap trash: "~/Library/Application Support/CodexDesktop-Rebuild"

  caveats do
    <<~EOS
      Codex Desktop is an Intel (x86_64) build — runs natively on Intel Macs
      and via Rosetta 2 on Apple Silicon.

      The app is ad-hoc signed (not notarized). Quarantine is stripped
      automatically, but if macOS still blocks launch:
        Control-click Codex.app → Open → Open

      Runtime data: ~/Library/Application Support/CodexDesktop-Rebuild/
    EOS
  end
end

