#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const provider = require("./_apply-custom-providers-settings-v1.js");
const mode = require("./patch-local-canonical-mode.js");

const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const bundle = (prefix) => {
  const name = fs.readdirSync(ASSETS).find((entry) => entry.startsWith(prefix) && entry.endsWith(".js"));
  assert.ok(name, `missing ${prefix} bundle`);
  const file = path.join(ASSETS, name);
  return { name, file, source: fs.readFileSync(file, "utf8") };
};
const mono = bundle("app-initial-");
const sections = bundle("use-visible-settings-sections-");
const settings = bundle("settings-page-");

for (const source of [mono.source, sections.source, settings.source]) {
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
}

const compiledSections = provider.patchSectionsBundle(sections.source);
const compiledSettings = provider.patchSettingsPage(settings.source);
const compiledMode = mode.patchSelectorBundle(mono.source, mono.file);
const dependencyIndices = provider.resolveDependencyIndices(mono.source, sections.source, mono.name);
const compiledMono = provider.patchMonolith(compiledMode, sections.name, dependencyIndices);

for (const [label, source] of [["sections", compiledSections], ["settings", compiledSettings], ["mode", compiledMode], ["monolith", compiledMono]]) {
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const original = { sections: sections.source, settings: settings.source, mode: mono.source, monolith: mono.source }[label];
  if (source === original) {
    assert.ok(source.includes("codex-rebuild:") || source.includes("CDRCustomProviders"), `${label} transform was a no-op`);
  }
}

assert.strictEqual(mode.patchSelectorBundle(compiledMode, mono.file), compiledMode, "mode patch is not byte-idempotent");
assert.strictEqual(provider.patchMonolith(compiledMono, sections.name, dependencyIndices), compiledMono, "provider monolith patch is not byte-idempotent");
assert.strictEqual(provider.patchSectionsBundle(compiledSections), compiledSections, "provider sections patch is not byte-idempotent");
assert.strictEqual(provider.patchSettingsPage(compiledSettings), compiledSettings, "provider settings patch is not byte-idempotent");

for (const [source, needle] of [
  [compiledMode, "codex-rebuild:local-canonical-selector-v3"],
  [compiledMode, "codex-rebuild:local-canonical-send-v3"],
  [compiledMode, "CDRSetMode(`chat`)"],
  [compiledMode, "mode:CDRMode"],
  [compiledMode, "CDRChatItem"],
  [compiledMode, "CDRObserver=new MutationObserver(CDRMarkSend)"],
  [compiledSections, "CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2"],
  [compiledSections, "Save changes"],
  [compiledSections, "data-cdr-provider-row"],
  [compiledSections, "globalThis.__cdrWriteConfigEdits"],
  [compiledSettings, "data-controls.custom-providers"],
  [compiledMono, "custom-providers-settings-v1:26727:gls"],
  [compiledMono, "custom-providers-settings-v1:26727:KJ"],
  [compiledMono, "custom-providers-settings-v1:26727:Yyu"],
  [compiledMono, "rp(`batch-write-config-value`"],
]) assert.ok(source.includes(needle), `missing transformed invariant: ${needle}`);

const modeState = compiledMode.indexOf("let [CDRMode,CDRSetMode]");
const observer = compiledMode.indexOf("codex-rebuild:local-canonical-send-v3");
assert.ok(modeState >= 0 && observer > modeState, "send observer executes before CDRMode initialization");

for (const marker of [
  "custom-providers-settings-v1:26727:gls",
  "custom-providers-settings-v1:26727:KJ",
  "custom-providers-settings-v1:26727:Yyu",
  '"custom-providers":KJ(',
  "case`custom-providers`:",
]) {
  assert.strictEqual(compiledMono.split(marker).length - 1, 1, `duplicate provider marker: ${marker}`);
}

console.log("new feature integrations: 26.727 mode/provider transforms passed");
