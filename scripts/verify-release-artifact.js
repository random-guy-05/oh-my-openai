#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");

const root = path.resolve(__dirname, "..");
const app = path.resolve(process.argv[2] || path.join(root, "out/side-by-side-mac-x64/Codex.app"));
const runtime = path.join(app, "Contents/Resources/Codex.payload");
const runtimeAsar = path.join(runtime, "Contents/Resources/app.asar");
const launcher = path.join(app, "Contents/MacOS/CodexLauncher");

function run(label, executable, args) {
  process.stdout.write(`[verify] ${label}\n`);
  execFileSync(executable, args, { cwd: root, stdio: "inherit", env: process.env });
}

assert.ok(fs.existsSync(app), `Built app is missing: ${app}`);
assert.ok(fs.existsSync(runtimeAsar), `Embedded runtime ASAR is missing: ${runtimeAsar}`);

run("unit tests", process.execPath, ["--test", "scripts/verify-enhancements.test.js", "scripts/verify-release-metadata.test.js"]);
run("source metadata and manifest", process.execPath, ["scripts/verify-enhancements.js"]);
run("built enhancement bundle", process.execPath, ["scripts/verify-enhancements.js", "--app", app]);
run("Responses provider routing", process.execPath, ["scripts/verify-provider-routing.js", app]);
run("service lifecycle and auth isolation", process.execPath, ["scripts/verify-service-lifecycle.js", app]);
run("deep code signature", "/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);

const launcherSymbols = execFileSync("/usr/bin/nm", ["-u", launcher], { encoding: "utf8" });
assert.match(launcherSymbols, /_objc_storeStrong/,
  "Native launcher was not compiled with Objective-C ARC; cached service metadata could dangle");

const marker = "codex-rebuild:enhancements-tray-v1";
const javascriptFiles = asar.listPackage(runtimeAsar)
  .filter((entry) => /\/main-[^/]+\.js$/.test(entry));
assert.ok(javascriptFiles.length > 0, "No packaged Electron main bundle was found");
const integrated = javascriptFiles.some((entry) => {
  const normalized = entry.replace(/^\//, "");
  return asar.extractFile(runtimeAsar, normalized).toString("utf8").includes(marker);
});
assert.ok(integrated, "The packaged runtime is missing the right-side enhancement menu integration");

console.log(`[ok] release artifact verified: ${app}`);
