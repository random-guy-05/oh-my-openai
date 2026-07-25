#!/usr/bin/env node
/**
 * Run all patch scripts in sequence.
 *
 * Usage:
 *   node scripts/patch-all.js              # Patch both platforms
 *   node scripts/patch-all.js unix         # Patch unix only
 *   node scripts/patch-all.js win          # Patch win only
 *   node scripts/patch-all.js --check      # Dry-run all
 */
const { execFileSync } = require("child_process");
const path = require("path");

const PATCHES = [
  "patch-i18n.js",
  "patch-copyright.js",
  "patch-devtools.js",
  "patch-fast-mode.js",
  "patch-latest-models.js",
  // Re-enabled after adding a process-scoped AST cache in patch-util.js.
  // The cache lets patchSelectorBundle / patchComposerBundle /
  // patchContextBundle / patchCss share a single Acorn parse per
  // source per file path, so the monolith is parsed at most twice
  // (original + post-verification) instead of five-plus times.
  // These are the canonical Chat / ChatGPT Work / Codex presets that
  // defined the custom set of features in oh-my-openai v26.715.72359.
  "patch-local-canonical-mode.js",
  // Token telemetry, prompt-cache visibility, and conservative local
  // usage caps. Also re-enabled: cached parser invoked once for the
  // status bundle and once for the turn guard bundle.
  "patch-usage-controls.js",
  "patch-resource-saver.js",
  "patch-side-by-side-scheme.js",
  "patch-isolated-userdata.js",
  "patch-plugin-auth.js",
  "patch-updater.js",
  "patch-archive-delete.js",
  // Unified custom-feature mount for the 26.721 base. Ports all of the
  // features lost during the 26.721 rebase: CDRStickyChatSend (chat-mode
  // send bridge), CDRTaskUsageBadge + CDRTurnUsageBadge (usage displays),
  // CDRMergeChatModels (live ChatGPT catalog picker), CDRInstallUsageRuntime,
  // error-boundary instrumentation, and the transcript publisher.
  //
  // IMPORTANT HISTORY: this script was briefly removed in commit 0d19210 on
  // the (empirically FALSE) claim that its anchors "do not match the 26.721
  // monolith". A direct test against the shipped 26.721.41059 monolith proved
  // 6 of 7 anchors match exactly; the only drift was the minified send
  // function name Nka -> Pka between builds. The script now detects the send
  // function name dynamically (findSendFunction) so it survives future
  // webpack renames. Removing it ships a vanilla DMG missing every custom
  // feature. Do NOT remove it again without re-running the anchor test in
  // /tmp/cdr-diag/test-anchors.js against the current upstream monolith.
  "_apply-26721-all-features.js",
];

function main() {
  const args = process.argv.slice(2);
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win", "unix"].includes(a));
  const extra = args.filter((a) => a.startsWith("--"));
  const passArgs = [...(platform ? [platform] : []), ...extra];

  // Patches whose needle set is only valid for macOS x86_64 against the current
  // 26.721.x monolith. Skip them on every other platform instead of letting
  // the per-patcher hard-throw abort the entire patch pipeline.
  const MAC_X64_ONLY_PATCHES = new Set([
    "patch-local-canonical-mode.js",
  ]);

  for (const script of PATCHES) {
    const scriptPath = path.join(__dirname, script);
    const label = script.replace(".js", "");
    console.log(`\n== ${label} ==`);

    if (platform && platform !== "mac-x64" && MAC_X64_ONLY_PATCHES.has(script)) {
      console.log(`[skip] ${label} supports mac-x64 only; skipping for ${platform}`);
      continue;
    }

    try {
      execFileSync("node", [scriptPath, ...passArgs], { stdio: "inherit" });
    } catch (e) {
      console.error(`[x] ${label} failed (exit ${e.status})`);
      console.error("[x] Stopping immediately to avoid compounding a partial patch state");
      process.exit(1);
    }
  }

  console.log(`\n== Summary: ${PATCHES.length}/${PATCHES.length} succeeded ==`);
}

main();
