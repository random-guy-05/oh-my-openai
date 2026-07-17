#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REBUILD =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const ASSETS = path.join(REBUILD, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(REBUILD, "src/mac-x64/_asar");

const LIVE = [
  path.join(
    process.env.HOME,
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

const MARKERS = [
  "codex-rebuild:native-chat-mode-v13",
  "codex-rebuild:native-chat-home-v13",
  "codex-rebuild:chat-codex-handoff-v13",
  "codex-rebuild:chat-origin-v13",
];

for (const marker of MARKERS) {
  const hits = [];
  for (const name of fs.readdirSync(ASSETS)) {
    if (!name.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(ASSETS, name), "utf8");
    if (src.includes(marker)) hits.push(name);
  }
  if (hits.length === 0) throw new Error(`missing marker in rebuild assets: ${marker}`);
  console.log("ok", marker, "->", hits.join(", "));
}

const packed = path.join(REBUILD, "out", "app-chat-continuity-v13.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
console.log("packing", ASAR_ROOT, "->", packed);
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: REBUILD,
  stdio: "inherit",
});

for (const dest of LIVE) {
  if (!fs.existsSync(dest)) {
    console.log("skip missing", dest);
    continue;
  }
  const bak = `${dest}.bak-v13-${Date.now()}`;
  fs.copyFileSync(dest, bak);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
  console.log("backup", bak);
}

// Replacing app.asar invalidates the outer ad-hoc seal. Without re-signing,
// CodexLauncher treats every launch as a failed integrity check and spends
// minutes reinstalling/verifying the ~2GB payload (which also fails).
const BUNDLES = [
  path.join(process.env.HOME, "Library/Application Support/CodexDesktop-Rebuild/Codex.app"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload",
];
function extractEntitlements(bundle, entitlementsPath) {
  let entitlements;
  try {
    entitlements = execFileSync(
      "/usr/bin/codesign",
      ["--display", "--entitlements", ":-", bundle],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    entitlements = `${error.stdout || ""}`;
  }
  if (!entitlements) throw new Error(`could not extract entitlements for ${bundle}`);
  fs.writeFileSync(entitlementsPath, entitlements);
  try {
    execFileSync("/usr/bin/plutil", ["-lint", entitlementsPath], { stdio: "ignore" });
  } catch {
    const xmlPath = `${entitlementsPath}.xml`;
    execFileSync("/usr/bin/plutil", ["-convert", "xml1", "-o", xmlPath, entitlementsPath], {
      stdio: "ignore",
    });
    fs.renameSync(xmlPath, entitlementsPath);
    execFileSync("/usr/bin/plutil", ["-lint", entitlementsPath], { stdio: "ignore" });
  }
}

for (const bundle of BUNDLES) {
  if (!fs.existsSync(bundle)) continue;
  const entitlements = path.join(os.tmpdir(), `codex-v13-entitlements-${Date.now()}.plist`);
  extractEntitlements(bundle, entitlements);
  console.log("re-signing", bundle);
  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--sign", "-", "--timestamp=none", "--options", "runtime", "--entitlements", entitlements, bundle],
    { stdio: "inherit" },
  );
  execFileSync("/usr/bin/codesign", ["--verify", "--strict", bundle], { stdio: "inherit" });
  fs.unlinkSync(entitlements);
  console.log("signature ok", bundle);
}

console.log("done");
