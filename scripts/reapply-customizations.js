#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { orderedFeatures, TEST_SCRIPTS } = require("./custom-features");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const platform = valueOf("--platform", "mac-x64");
const planOnly = args.includes("--plan");
const syncInstalled = args.includes("--sync-installed");
const build = args.includes("--build");
const sideBySide = args.includes("--side-by-side");
if (platform !== "mac-x64") throw new Error(`custom reapply is intentionally mac-x64-only; ${platform} is not yet ported`);

const features = orderedFeatures(platform);
const plan = {
  platform,
  syncInstalled,
  build,
  sideBySide,
  features: features.map(({ id, script, dependsOn }) => ({ id, script, dependsOn })),
  tests: [...TEST_SCRIPTS],
};
if (planOnly) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(ROOT, "out", ".reapply-runs", runId);
const sourceDir = path.join(ROOT, "src", platform);
const backupDir = path.join(runDir, "last-good");
const reportPath = path.join(runDir, "report.json");
const report = { runId, startedAt: new Date().toISOString(), ...plan, steps: [], ok: false };
fs.mkdirSync(runDir, { recursive: true });

function record(name, fn) {
  const step = { name, startedAt: new Date().toISOString() };
  report.steps.push(step);
  try {
    const result = fn();
    step.ok = true;
    step.finishedAt = new Date().toISOString();
    return result;
  } catch (error) {
    step.ok = false;
    step.error = String(error?.message || error);
    step.finishedAt = new Date().toISOString();
    throw error;
  }
}

function runNode(script, scriptArgs = []) {
  execFileSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], { cwd: ROOT, stdio: "inherit" });
}

function treeHash(root) {
  const digest = crypto.createHash("sha256");
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      digest.update(relative + "\0");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) digest.update(fs.readFileSync(absolute));
    }
  };
  visit(root);
  return digest.digest("hex");
}

let hadSource = fs.existsSync(sourceDir);
try {
  if (hadSource) record("snapshot-last-good", () => fs.cpSync(sourceDir, backupDir, { recursive: true, dereference: true }));
  if (syncInstalled) record("sync-installed-upstream", () => runNode("sync-upstream.js", ["--installed-x64"]));
  if (!fs.existsSync(sourceDir)) throw new Error(`missing ${sourceDir}; use --sync-installed first`);

  const monoDir = path.join(sourceDir, "_asar", "webview", "assets");
  const alreadyPatched = fs.readdirSync(monoDir).some((name) => {
    if (!name.startsWith("app-initial-") || !name.endsWith(".js")) return false;
    return fs.readFileSync(path.join(monoDir, name), "utf8").includes("codex-rebuild:all-features-26721-v1:applied");
  });
  record(alreadyPatched ? "audit-current-patched" : "audit-clean-upstream", () =>
    runNode("rebase-audit.js", [platform, `--phase=${alreadyPatched ? "patched" : "clean"}`]),
  );
  record("apply-custom-feature-manifest", () => runNode("patch-all.js", [platform]));
  for (const test of TEST_SCRIPTS) record(`test:${test}`, () => runNode(test));
  record("audit-patched", () => runNode("rebase-audit.js", [platform, "--phase=patched"]));

  const firstHash = treeHash(path.join(sourceDir, "_asar"));
  record("idempotent-second-apply", () => runNode("patch-all.js", [platform]));
  const secondHash = treeHash(path.join(sourceDir, "_asar"));
  report.idempotency = { firstHash, secondHash, ok: firstHash === secondHash };
  if (firstHash !== secondHash) throw new Error("second manifest apply changed the patched ASAR; patch set is not idempotent");

  if (build) record("build", () => runNode("build-from-upstream.js", ["--platform", platform]));
  if (sideBySide) record("build-side-by-side", () => runNode("build-side-by-side-mac.js"));
  report.ok = true;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (!args.includes("--keep-backup")) fs.rmSync(backupDir, { recursive: true, force: true });
  console.log(`\nCustom reapply complete. Report: ${reportPath}`);
} catch (error) {
  report.error = String(error?.stack || error);
  report.finishedAt = new Date().toISOString();
  if (hadSource && fs.existsSync(backupDir)) {
    try {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.cpSync(backupDir, sourceDir, { recursive: true, dereference: true });
      report.rolledBack = true;
    } catch (rollbackError) {
      report.rolledBack = false;
      report.rollbackError = String(rollbackError?.stack || rollbackError);
    }
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(`\nCustom reapply failed${report.rolledBack ? "; last-good source restored" : ""}. Report: ${reportPath}`);
  process.exitCode = 1;
}
