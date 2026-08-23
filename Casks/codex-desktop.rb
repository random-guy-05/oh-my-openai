cask "codex-desktop" do
  version "26.818.41509"
  # Side-by-side DMG hash for v#{version}.
  # Recompute via `shasum -a 256 out/Codex-side-by-side-mac-x64-*.dmg`
  # after every `npm run build:side-by-side:x64`.
  sha256 "82fe8a38061350436fa8d53cc5ba49715a51020e84d862aa22d0d8e8589ee659"

  url "https://github.com/random-guy-05/oh-my-openai/releases/download/v#{version}/Codex-side-by-side-mac-x64-#{version}.dmg",
      verified: "github.com/random-guy-05/oh-my-openai/releases/"
  name "Codex Desktop"
  desc "Side-by-side Codex build with an isolated profile and optional enhancements"
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
