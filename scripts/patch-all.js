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
  // Intentionally removed: _apply-26721-all-features.js was the user's
  // "failed reapply" attempt that tried to consolidate every custom
  // feature into a single script via dynamic alias detection. Its
  // upstream anchors (P_a(await this.request.getModelsResponse()),
  // async function Nka(e,{attachments: …), the thumbs_up/thumbs_down
  // rating action row, and the previous-version error boundary marker)
  // do not match the 26.721.31836 monolith, so it silently no-ops on
  // every important step (no chat catalog hookup, no send bridge, no
  // usage badges) and even double-injects CDRInstallUsageRuntime when
  // it is run twice on partial state. The two canonical patches above
  // (_apply-26721-all-features.js was meant to replace) now run from
  // patch-util.js's cached parser and produce the durable, marker-
  // verified custom features.
];

function main() {
  const args = process.argv.slice(2);
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win", "unix"].includes(a));
  const extra = args.filter((a) => a.startsWith("--"));
  const passArgs = [...(platform ? [platform] : []), ...extra];

  for (const script of PATCHES) {
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

  console.log(`\n== Summary: ${PATCHES.length}/${PATCHES.length} succeeded ==`);
}

main();
