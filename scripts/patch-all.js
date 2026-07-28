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
const { orderedFeatures } = require("./custom-features");

/* Historical rationale for the manifest entries now lives beside the
 * orchestrator; the executable order itself comes only from custom-features. */
const PATCH_HISTORY = [
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
  // Transcript publisher v1 — codex→chat context handoff. Injects an event
  // dispatch into the OD component (visibleTurnEntries + conversationId) and
  // a self-contained IIFE that serializes native codex turns into a
  // <codex_transcript> block on globalThis.__cdrCodexContextByThread.
  // CDRStickyChatSend then prepends it as context on the first chat send.
  // This replaces the disabled `if (false && ...)` publisher that was in
  // _apply-26721-all-features.js section 5 (which had a template literal
  // escaping bug). Must run AFTER _apply-26721-all-features.js so the
  // thread file is not already patched by the disabled block.
  "_apply-transcript-publisher-v1.js",
  // Bidirectional Codex <-> Chat context handoff. Chat mode intentionally
  // forks into a separate ChatGPT conversation (separate models, separate
  // quota); this makes context cross that fork in both directions on every
  // send instead of only at conversation creation. Must run last: it rewrites
  // the bridge injected by _apply-26721-all-features.js and the publisher
  // injected by _apply-transcript-publisher-v1.js.
  "_apply-handoff-sync-v1.js",
  // Replaces the fabricated per-turn badge (which rendered one thread-level
  // counter identically on every turn) with usage bound to the turn that
  // actually produced it, and drops the cumulative task badge that was being
  // duplicated down the whole transcript. Must run after the badges exist.
  "_apply-turn-usage-v2.js",
  // Chat UX: live ChatGPT model selector in Chat mode + never fall through
  // to the Codex send path (which burns Codex quota) while Chat is active.
  "_apply-chat-ux-v1.js",
  // Chat-real-v2: Chat mode uses the signed-in ChatGPT Web catalog and quota;
  // the native response is the source of truth and explicit Codex namespaces
  // are the only rows excluded.
  "_apply-chat-real-v2.js",
  "_apply-chat-picker-style-v1.js",
  // Render persisted Chat turns inside the same local task transcript and
  // subscribe only while the task view is mounted (no sidebar/router changes).
  "_apply-chat-extras-render-v1.js",
  "_apply-mode-switch-work-v1.js",
];

function main() {
  const args = process.argv.slice(2);
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win", "unix"].includes(a)) || "mac-x64";
  const extra = args.filter((a) => a.startsWith("--"));
  const passArgs = [platform, ...extra];
  const features = orderedFeatures(platform);
  if (!features.length) {
    console.error(`[x] No custom feature manifest exists for ${platform}; refusing to ship a partially patched build.`);
    process.exit(1);
  }

  for (const { id, script } of features) {
    const scriptPath = path.join(__dirname, script);
    const label = script.replace(".js", "");
    console.log(`\n== ${label} ==`);

    try {
      execFileSync("node", [scriptPath, ...passArgs], { stdio: "inherit" });
    } catch (e) {
      console.error(`[x] ${label} failed (exit ${e.status})`);
      console.error("[x] Stopping immediately to avoid compounding a partial patch state");
      process.exit(1);
    }
  }

  console.log(`\n== ${features.length}/${features.length} manifest features ran without error ==`);

  // Running without error is not the same as producing a working feature.
  // Every patcher here can soft-fail, and the per-script "[verify]" lines
  // only grep for marker comments the script itself just wrote. The gate
  // below inspects the resulting bundle instead: required code present,
  // pristine anchors gone, injected components actually rendered, and every
  // identifier the injected code references resolvable in this bundle.
  console.log("\n== verify-features (behavioural gate) ==");
  const verifyArgs = platform && platform !== "unix" ? [platform] : [];
  try {
    execFileSync(
      "node",
      ["--max-old-space-size=8192", path.join(__dirname, "verify-features.js"), ...verifyArgs],
      { stdio: "inherit" },
    );
  } catch {
    console.error("\n[x] Feature verification failed — do not build or release this tree.");
    process.exit(1);
  }
}

main();
