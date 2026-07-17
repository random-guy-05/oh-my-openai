#!/usr/bin/env node
"use strict";

/**
 * After manually replacing app.asar, the runtime/payload code signature is
 * invalid. CodexLauncher then treats every launch as a failed integrity check
 * and spends minutes ditto-copying + deep-verifying the 2.3GB payload — which
 * also fails — so startup can look like 10–20 minutes (or crash).
 *
 * Re-ad-hoc-sign the outer bundles the same way build-side-by-side does.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const TARGETS = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload",
];

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, {
    encoding: opts.encoding || "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
  });
}

function extractEntitlements(appPath, destination) {
  // Match build-side-by-side-mac.js: dump to stdout via ":-"
  let entitlements;
  try {
    entitlements = run("/usr/bin/codesign", [
      "--display",
      "--entitlements",
      ":-",
      appPath,
    ]);
  } catch (error) {
    entitlements = `${error.stdout || ""}`;
  }
  if (!entitlements || entitlements.length === 0) {
    throw new Error(`No root entitlements found on ${appPath}`);
  }
  fs.writeFileSync(destination, entitlements);
  // If DER blob, convert to XML plist
  try {
    run("/usr/bin/plutil", ["-lint", destination]);
  } catch {
    const xmlPath = `${destination}.xml`;
    run("/usr/bin/plutil", ["-convert", "xml1", "-o", xmlPath, destination]);
    fs.renameSync(xmlPath, destination);
    run("/usr/bin/plutil", ["-lint", destination]);
  }
}

function resign(appPath) {
  if (!fs.existsSync(appPath)) {
    console.log("skip missing", appPath);
    return;
  }
  const entitlements = path.join(
    os.tmpdir(),
    `codex-resign-${path.basename(appPath)}-${Date.now()}.plist`,
  );
  console.log("extract entitlements", appPath);
  extractEntitlements(appPath, entitlements);
  console.log("re-sign", appPath);
  const t0 = Date.now();
  run("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
    "--options",
    "runtime",
    "--entitlements",
    entitlements,
    appPath,
  ]);
  console.log(`signed in ${Date.now() - t0}ms`);
  const t1 = Date.now();
  run("/usr/bin/codesign", ["--verify", "--strict", appPath]);
  console.log(`verify strict ok in ${Date.now() - t1}ms`);
  fs.unlinkSync(entitlements);
}

for (const target of TARGETS) {
  resign(target);
}
console.log("done — fully quit Codex, then reopen /Applications/Codex.app");
