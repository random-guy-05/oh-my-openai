#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { FEATURES, TEST_SCRIPTS, orderedFeatures } = require("./custom-features");

const ordered = orderedFeatures("mac-x64");
assert.ok(ordered.length >= 20, "custom feature manifest is unexpectedly incomplete");
assert.strictEqual(new Set(ordered.map((feature) => feature.id)).size, ordered.length, "duplicate feature ids");
assert.strictEqual(new Set(ordered.map((feature) => feature.script)).size, ordered.length, "duplicate patch scripts");
const positions = new Map(ordered.map((feature, index) => [feature.id, index]));
for (const feature of ordered) {
  assert.deepStrictEqual(feature.platforms, ["mac-x64"], `${feature.id} overclaims platform support`);
  for (const dependency of feature.dependsOn) assert.ok(positions.get(dependency) < positions.get(feature.id), `${feature.id} runs before ${dependency}`);
}
assert.deepStrictEqual(orderedFeatures("mac-arm64"), [], "arm64 must remain gated until patch scripts are ported");
assert.ok(TEST_SCRIPTS.includes("test-chat-transport.js"));
assert.ok(FEATURES.some((feature) => feature.id === "mode-ui-invariants"));
console.log("reapply manifest contract ok");
