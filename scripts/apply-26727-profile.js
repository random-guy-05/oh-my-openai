#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const { patchSelectorBundle } = require("./patch-local-canonical-mode.js");
const {
  commitBundleSet,
  recoverBundleTransactions,
  patchMonolith,
  patchSectionsBundle,
  patchSettingsPage,
  resolveDependencyIndices,
} = require("./_apply-custom-providers-settings-v1.js");

const ROOT = path.join(__dirname, "..");
const platform = process.argv.find((arg) => ["mac-x64"].includes(arg)) || "mac-x64";
const checkOnly = process.argv.includes("--check");
const ASSETS = path.join(ROOT, "src", platform, "_asar", "webview", "assets");

function findAsset(prefix) {
  const name = fs.readdirSync(ASSETS).find((entry) => entry.startsWith(prefix) && entry.endsWith(".js"));
  if (!name) throw new Error(`26.727 profile: missing ${prefix} bundle`);
  return path.join(ASSETS, name);
}

function parse(source, label) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`26.727 profile: ${label} does not parse: ${error.message}`);
  }
}

function exactOnce(source, needle, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`26.727 profile: ${label} expected once, found ${count}`);
}

function verify({ mono, sections, settings, dependencyIndices }) {
  for (const [label, source] of [["app-initial", mono], ["visible settings", sections], ["settings page", settings]]) parse(source, label);
  for (const needle of [
    "/* codex-rebuild:local-canonical-selector-v3 */",
    "codex-rebuild:local-canonical-selector-v3:26727-state",
    "codex-rebuild:local-canonical-send-v3",
    "CDRSetMode(`chat`)",
    "mode:CDRMode",
    "CDRObserver=new MutationObserver(CDRMarkSend)",
  ]) exactOnce(mono, needle, `mode invariant ${needle}`);
  for (const needle of [
    "custom-providers-settings-v1:26727:gls",
    "custom-providers-settings-v1:26727:KJ",
    "custom-providers-settings-v1:26727:Yyu",
    "custom-providers-settings-v1:config-bridge",
    "case`custom-providers`:",
    '"custom-providers":KJ(',
    `__vite__mapDeps([${dependencyIndices.join(",")}])`,
  ]) exactOnce(mono, needle, `provider invariant ${needle}`);
  const bridgeMarker = "codex-rebuild:custom-providers-settings-v1:config-bridge";
  const bridgeMarkerIndex = mono.indexOf(bridgeMarker);
  const bridgeStart = mono.lastIndexOf("globalThis.__cdrWriteConfigEdits=", bridgeMarkerIndex);
  if (bridgeMarkerIndex < 0 || bridgeStart < 0 || !mono.slice(bridgeStart, bridgeMarkerIndex).includes("return rp(`batch-write-config-value`")) {
    throw new Error("26.727 profile: config bridge does not call the native rp batch-write dispatcher");
  }
  for (const needle of [
    "CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2",
    "Save changes",
    "data-cdr-provider-row",
    "globalThis.__cdrWriteConfigEdits",
  ]) if (!sections.includes(needle)) throw new Error(`26.727 profile: missing visible-settings invariant ${needle}`);
  for (const needle of ["data-controls.custom-providers", "`skills-settings`,`custom-providers`,`browser-use`"]) {
    if (!settings.includes(needle)) throw new Error(`26.727 profile: missing settings-page invariant ${needle}`);
  }
  const state = mono.indexOf("let [CDRMode,CDRSetMode]");
  const observer = mono.indexOf("codex-rebuild:local-canonical-send-v3");
  if (observer <= state) throw new Error("26.727 profile: send observer precedes CDRMode initialization");
}

function main() {
  if (platform !== "mac-x64") throw new Error(`26.727 profile is only ported for mac-x64, got ${platform}`);
  if (!checkOnly) recoverBundleTransactions(ASSETS);
  const monoFile = findAsset("app-initial-");
  const sectionsFile = findAsset("use-visible-settings-sections-");
  const settingsFile = findAsset("settings-page-");
  const monoSource = fs.readFileSync(monoFile, "utf8");
  const sectionsSource = fs.readFileSync(sectionsFile, "utf8");
  const settingsSource = fs.readFileSync(settingsFile, "utf8");
  const dependencyIndices = resolveDependencyIndices(
    monoSource,
    fs.readFileSync(sectionsFile, "utf8"),
    path.basename(monoFile),
  );

  const nextSections = patchSectionsBundle(sectionsSource);
  const nextSettings = patchSettingsPage(settingsSource);
  // Both patches own app-initial. Mode runs first; provider registration then
  // adds its bridge/route without reparsing or overwriting the mode result.
  const nextMono = patchMonolith(
    patchSelectorBundle(monoSource, monoFile),
    path.basename(sectionsFile),
    dependencyIndices,
  );
  verify({ mono: nextMono, sections: nextSections, settings: nextSettings, dependencyIndices });

  if (!checkOnly) {
    commitBundleSet([
      { file: sectionsFile, previous: sectionsSource, next: nextSections },
      { file: settingsFile, previous: settingsSource, next: nextSettings },
      { file: monoFile, previous: monoSource, next: nextMono },
    ]);
  }
  console.log(checkOnly ? "26.727 provider/mode profile check passed (no files written)" : "26.727 provider/mode profile applied transactionally");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { verify };
