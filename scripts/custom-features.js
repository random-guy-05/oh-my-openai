"use strict";

/**
 * Canonical custom-feature manifest.
 *
 * Keep ordering and platform support here so patching, reapply planning, tests,
 * and documentation cannot silently disagree. Dependencies are validated and
 * topologically ordered by orderedFeatures().
 */
const FEATURES = Object.freeze([
  { id: "i18n", script: "patch-i18n.js", platforms: ["mac-x64"] },
  { id: "copyright", script: "patch-copyright.js", platforms: ["mac-x64"] },
  { id: "devtools", script: "patch-devtools.js", platforms: ["mac-x64"] },
  { id: "fast-mode", script: "patch-fast-mode.js", platforms: ["mac-x64"] },
  { id: "latest-models", script: "patch-latest-models.js", platforms: ["mac-x64"] },
  { id: "local-canonical-mode", script: "patch-local-canonical-mode.js", platforms: ["mac-x64"], dependsOn: ["latest-models"] },
  { id: "resource-saver", script: "patch-resource-saver.js", platforms: ["mac-x64"] },
  { id: "side-by-side-scheme", script: "patch-side-by-side-scheme.js", platforms: ["mac-x64"] },
  { id: "isolated-userdata", script: "patch-isolated-userdata.js", platforms: ["mac-x64"] },
  { id: "plugin-auth", script: "patch-plugin-auth.js", platforms: ["mac-x64"] },
  { id: "updater", script: "patch-updater.js", platforms: ["mac-x64"] },
  { id: "archive-delete", script: "patch-archive-delete.js", platforms: ["mac-x64"] },
  { id: "all-features-26721", script: "_apply-26721-all-features.js", platforms: ["mac-x64"], dependsOn: ["local-canonical-mode"] },
  { id: "transcript-publisher", script: "_apply-transcript-publisher-v1.js", platforms: ["mac-x64"], dependsOn: ["all-features-26721"] },
  { id: "handoff-sync", script: "_apply-handoff-sync-v1.js", platforms: ["mac-x64"], dependsOn: ["transcript-publisher"] },
  { id: "chat-ux", script: "_apply-chat-ux-v1.js", platforms: ["mac-x64"], dependsOn: ["all-features-26721"] },
  { id: "chat-real", script: "_apply-chat-real-v2.js", platforms: ["mac-x64"], dependsOn: ["chat-ux"] },
  { id: "chat-picker-style", script: "_apply-chat-picker-style-v1.js", platforms: ["mac-x64"], dependsOn: ["chat-real"] },
  { id: "chat-history-overlay", script: "_apply-chat-extras-render-v1.js", platforms: ["mac-x64"], dependsOn: ["all-features-26721"] },
  { id: "chat-stream-lifecycle", script: "_apply-chat-stream-lifecycle-v1.js", platforms: ["mac-x64"], dependsOn: ["chat-ux", "chat-history-overlay", "handoff-sync"] },
  { id: "chat-smooth-stream", script: "_apply-chat-fake-stream-v1.js", platforms: ["mac-x64"], dependsOn: ["chat-stream-lifecycle"] },
  { id: "mode-switch-work", script: "_apply-mode-switch-work-v1.js", platforms: ["mac-x64"], dependsOn: ["local-canonical-mode"] },
  { id: "luna-context", script: "_apply-luna-context-v2.js", platforms: ["mac-x64"], dependsOn: ["handoff-sync"] },
  { id: "mode-ui-invariants", script: "_apply-mode-ui-invariants-v1.js", platforms: ["mac-x64"], dependsOn: ["mode-switch-work", "chat-real", "luna-context"] },
  // Custom Providers is deliberately independent of the Chat/mode patch chain.
  // The settings surface uses native Codex config and can be ported safely even
  // when a future upstream refactors the unrelated composer/controller code.
  { id: "custom-providers-settings", script: "_apply-custom-providers-settings-v1.js", platforms: ["mac-x64"] },
].map((feature) => Object.freeze({ critical: true, dependsOn: [], ...feature })));

const TEST_SCRIPTS = Object.freeze([
  "test-latest-model-patch.js",
  "test-local-canonical-mode-patch.js",
  "test-resource-saver-patch.js",
  "test-handoff-sync.js",
  "test-chat-transport.js",
  "test-new-feature-integrations.js",
  "test-custom-providers-26727.js",
]);

function orderedFeatures(platform = "mac-x64") {
  const supported = FEATURES.filter((feature) => feature.platforms.includes(platform));
  const byId = new Map(supported.map((feature) => [feature.id, feature]));
  const visiting = new Set();
  const visited = new Set();
  const result = [];
  const visit = (feature) => {
    if (visited.has(feature.id)) return;
    if (visiting.has(feature.id)) throw new Error(`custom feature dependency cycle at ${feature.id}`);
    visiting.add(feature.id);
    for (const dependency of feature.dependsOn) {
      const target = byId.get(dependency);
      if (!target) throw new Error(`${feature.id} depends on unavailable feature ${dependency} for ${platform}`);
      visit(target);
    }
    visiting.delete(feature.id);
    visited.add(feature.id);
    result.push(feature);
  };
  supported.forEach(visit);
  return result;
}

module.exports = { FEATURES, TEST_SCRIPTS, orderedFeatures };
