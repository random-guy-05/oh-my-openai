#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const provider = require("./_apply-custom-providers-settings-v1.js");

const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const find = (prefix) => {
  const name = fs.readdirSync(ASSETS).find((entry) => entry.startsWith(prefix) && entry.endsWith(".js"));
  assert.ok(name, `missing ${prefix} bundle`);
  const file = path.join(ASSETS, name);
  return { name, file, source: fs.readFileSync(file, "utf8") };
};
const sections = find("use-visible-settings-sections-");
const settings = find("settings-page-");
const monolith = find("app-initial-");

const compiledSections = provider.patchSectionsBundle(sections.source);
const compiledSettings = provider.patchSettingsPage(settings.source);
const dependencyIndices = provider.resolveDependencyIndices(monolith.source, sections.source, monolith.name);
const compiledMonolith = provider.patchMonolith(monolith.source, sections.name, dependencyIndices);
for (const [label, source] of [["sections", compiledSections], ["settings", compiledSettings], ["monolith", compiledMonolith]]) {
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const original = { sections: sections.source, settings: settings.source, monolith: monolith.source }[label];
  // The profile may already be applied to the working tree. In that case the
  // patch must be byte-idempotent while retaining its durable marker.
  assert.ok(
    source !== original || source.includes("codex-rebuild:custom-providers-settings-v1"),
    `${label} was neither transformed nor recognized as an already-applied bundle`,
  );
}

const required = [
  [compiledSections, "CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2"],
  [compiledSections, "codex-rebuild:custom-providers-settings-v1:icon-v2-export"],
  [compiledSections, '"custom-providers":CDRCustomProvidersIconV2'],
  [compiledSections, "globalThis.__cdrWriteConfigEdits"],
  [compiledSections, "normalized.map(({api_key,...p})=>p)"],
  [compiledSections, "Save changes"],
  [compiledSections, "data-cdr-provider-row"],
  [compiledSections, "TOML preview"],
  [compiledSettings, "data-controls.custom-providers"],
  [compiledSettings, "`skills-settings`,`custom-providers`,`browser-use`"],
  [compiledMonolith, "custom-providers-settings-v1:26727:gls"],
  [compiledMonolith, "custom-providers-settings-v1:26727:KJ"],
  [compiledMonolith, "custom-providers-settings-v1:26727:Yyu"],
  [compiledMonolith, "skills-settings.custom-providers"],
  [compiledMonolith, '"custom-providers":KJ(async()=>(await eu(async()=>{let{CDRCustomProvidersPanelV2:e}=await import(`./use-visible-settings-sections-'],
  [compiledMonolith, `__vite__mapDeps([${dependencyIndices.join(",")}])`],
  [compiledMonolith, "rp(`batch-write-config-value`"],
  [compiledMonolith, "case`custom-providers`:"],
];
for (const [source, needle] of required) assert.ok(source.includes(needle), `missing provider invariant: ${needle}`);

const onceMarkers = [
  "custom-providers-settings-v1:26727:gls",
  "custom-providers-settings-v1:26727:KJ",
  "custom-providers-settings-v1:26727:Yyu",
  '"custom-providers":KJ(',
  "case`custom-providers`:",
];
for (const marker of onceMarkers) assert.strictEqual(compiledMonolith.split(marker).length - 1, 1, `duplicate provider registration: ${marker}`);
assert.strictEqual(provider.patchMonolith(compiledMonolith, sections.name, dependencyIndices), compiledMonolith, "provider monolith is not byte-idempotent");
assert.strictEqual(provider.patchSectionsBundle(compiledSections), compiledSections, "provider sections bundle is not byte-idempotent");
assert.strictEqual(provider.patchSettingsPage(compiledSettings), compiledSettings, "provider settings bundle is not byte-idempotent");

// The bridge uses the real 26.727 request helper, not the unrelated Rf tracer.
assert.ok(compiledMonolith.includes("function rp(e,t){return J6e.sendRequest(e,t)}"));
assert.ok(!compiledMonolith.includes("Rf(`batch-write-config-value`"));

// A later anchor failure must abort before any caller can write a result.
const broken = monolith.source.replace("function Yyu(e){", "function NotYyu(e){");
assert.throws(() => provider.patchMonolith(broken, sections.name, dependencyIndices), /Yyu|section-label|settings module boundary|config bridge/);
assert.strictEqual(monolith.source, fs.readFileSync(monolith.file, "utf8"), "failed provider transform mutated the source file");
assert.strictEqual(sections.source, fs.readFileSync(sections.file, "utf8"), "failed provider transform mutated sections");
assert.strictEqual(settings.source, fs.readFileSync(settings.file, "utf8"), "failed provider transform mutated settings");

// Exercise the actual three-file commit rollback, not only the pure patch
// functions. Every injected failure is one-shot so recovery can complete and
// prove the originals are restored byte-for-byte with no orphaned artifacts.
const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "cdr-provider-"));
try {
  const makeEntries = () => ["one", "two", "three"].map((name) => {
    const file = path.join(tempDir, name);
    fs.writeFileSync(file, `original-${name}`, "utf8");
    return { file, previous: `original-${name}`, next: `patched-${name}` };
  });
  const assertCleanOriginals = (entries, label, expected = "previous") => {
    for (const entry of entries) {
      const value = expected === "next" ? entry.next : entry.previous;
      assert.strictEqual(fs.readFileSync(entry.file, "utf8"), value, `${label}: unexpected ${path.basename(entry.file)} contents`);
    }
    const leftovers = fs.readdirSync(tempDir).filter((name) => /cdr-(?:staged|backup|transaction)/.test(name));
    assert.deepStrictEqual(leftovers, [], `${label}: transaction artifacts remain: ${leftovers.join(", ")}`);
  };
  const makeIo = ({ failWrite, failRename, failUnlink, failRestore } = {}) => {
    let writes = 0;
    let renames = 0;
    let unlinks = 0;
    let failedPrimary = false;
    let failedRestore = false;
    return {
      existsSync: (...args) => fs.existsSync(...args),
      readdirSync: (...args) => fs.readdirSync(...args),
      readFileSync: (...args) => fs.readFileSync(...args),
      writeFileSync: (...args) => {
        writes += 1;
        if (!failedPrimary && failWrite === writes) { failedPrimary = true; throw new Error(`injected write failure ${writes}`); }
        return fs.writeFileSync(...args);
      },
      renameSync: (from, to) => {
        renames += 1;
        const restoring = String(from).includes(".cdr-backup-") && !String(to).includes(".cdr-backup-");
        if (!failedPrimary && failRename === renames) { failedPrimary = true; throw new Error("injected rename failure"); }
        if (!failedRestore && failRestore && restoring) { failedRestore = true; throw new Error("injected restore failure"); }
        return fs.renameSync(from, to);
      },
      unlinkSync: (...args) => {
        unlinks += 1;
        if (!failedPrimary && failUnlink === unlinks) { failedPrimary = true; throw new Error("injected cleanup failure"); }
        return fs.unlinkSync(...args);
      },
    };
  };
  const runRollbackCase = (label, options) => {
    const entries = makeEntries();
    try {
      assert.throws(() => provider.commitBundleSet(entries, makeIo(options)), /injected/);
      if (options.failRestore) provider.recoverBundleTransactions(tempDir);
      assertCleanOriginals(entries, label);
    } finally {
      for (const entry of entries) {
        try { fs.unlinkSync(entry.file); } catch {}
      }
      for (const name of fs.readdirSync(tempDir)) {
        if (/cdr-(?:staged|backup|transaction)/.test(name)) fs.rmSync(path.join(tempDir, name), { force: true });
      }
    }
  };
  // Initial/staged writes, every journal/backup/install rename, and restore.
  // The journaled commit performs 15 writeFileSync calls and 18 renames
  // (12 journal swaps plus 6 bundle backup/install renames).
  for (let write = 1; write <= 15; write += 1) runRollbackCase(`write-${write}`, { failWrite: write });
  for (let rename = 1; rename <= 18; rename += 1) runRollbackCase(`rename-${rename}`, { failRename: rename });
  // Fail an install rename, then fail the first restore rename. The subsequent
  // startup recovery must finish restoring all originals from the journal.
  runRollbackCase("restore", { failRename: 12, failRestore: true });

  // A cleanup failure is a committed transaction, not a rollback. The journal
  // remains and normal startup recovery must finish cleanup safely.
  const cleanupEntries = makeEntries();
  const cleanupResult = provider.commitBundleSet(cleanupEntries, makeIo({ failUnlink: 1 }));
  assert.ok(cleanupResult.cleanupErrors.length, "cleanup failure was not surfaced");
  provider.recoverBundleTransactions(tempDir);
  assertCleanOriginals(cleanupEntries, "cleanup recovery", "next");
  for (const entry of cleanupEntries) fs.unlinkSync(entry.file);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("custom providers 26.727: transformed bundles parse, mount, validate, and reapply safely");
