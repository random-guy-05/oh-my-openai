#!/usr/bin/env node
"use strict";
/**
 * Hot-swap catalog-v3 into:
 * 1) Application Support runtime app.asar
 * 2) Side-by-side launcher Codex.payload app.asar
 * (opening the launcher otherwise reinstalls the old payload and wipes the fix)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, execSync } = require("child_process");
const plist = require("util"); // not used; use python for plist

const ROOT = path.join(__dirname, "..");
const SRC_ASAR = path.join(ROOT, "src/mac-x64/_asar");
const PACKED = path.join(ROOT, "out/mac-x64/Codex.app/Contents/Resources/app.asar");
const RUNTIME =
  "/Users/admin/Library/Application Support/CodexDesktop-Rebuild/Codex.app";
const LAUNCHER = path.join(ROOT, "out/side-by-side-mac-x64/Codex.app");
const PAYLOAD = path.join(
  LAUNCHER,
  "Contents/Resources/Codex.payload/Contents/Resources/app.asar",
);

function asarHeaderHash(asarPath) {
  const buf = fs.readFileSync(asarPath);
  const headerSize = buf.readUInt32LE(12);
  return crypto.createHash("sha256").update(buf.slice(16, 16 + headerSize)).digest("hex");
}

function updateIntegrity(appRoot, asarRelPath) {
  const asarPath = path.join(appRoot, asarRelPath);
  const plistPath = path.join(appRoot, "Contents/Info.plist");
  const hash = asarHeaderHash(asarPath);
  // Use plutil
  execFileSync(
    "/usr/bin/plutil",
    [
      "-replace",
      "ElectronAsarIntegrity.Resources/app\\.asar.hash",
      "-string",
      hash,
      plistPath,
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "/usr/bin/plutil",
    [
      "-replace",
      "ElectronAsarIntegrity.Resources/app\\.asar.algorithm",
      "-string",
      "SHA256",
      plistPath,
    ],
    { stdio: "pipe" },
  );
  return hash;
}

function codesign(app) {
  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", app],
    { stdio: "pipe" },
  );
}

function hasV3(asarPath) {
  const tmp = fs.mkdtempSync("/tmp/cdr-v3-");
  try {
    execSync(`npx --yes asar extract "${asarPath}" "${tmp}"`, { stdio: "pipe" });
    const js = fs.readFileSync(
      path.join(tmp, "webview/assets/app-initial-BHB6SClA.js"),
      "utf8",
    );
    return (
      js.includes("chat-picker-style-v1:flat-selector") ||
      js.includes("chat-catalog-v5:catalog-merge") ||
      js.includes("chat-catalog-v4:catalog-merge") ||
      js.includes("chat-catalog-v3c:catalog-merge") ||
      js.includes("chat-catalog-v3b:catalog-merge") ||
      js.includes("chat-catalog-v3:catalog-merge")
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Ensure packed asar exists and is v3
fs.mkdirSync(path.dirname(PACKED), { recursive: true });
console.log("[pack] src/_asar ->", PACKED);
execSync(`npx --yes asar pack "${SRC_ASAR}" "${PACKED}"`, { stdio: "inherit" });
if (!hasV3(PACKED)) throw new Error("packed ASAR missing catalog-v3");
console.log("[ok] packed has catalog-v3");

// 1) Runtime
const runtimeAsar = path.join(RUNTIME, "Contents/Resources/app.asar");
fs.copyFileSync(PACKED, runtimeAsar);
const h1 = updateIntegrity(RUNTIME, "Contents/Resources/app.asar");
codesign(RUNTIME);
console.log("[ok] runtime swapped", h1.slice(0, 16), "v3=", hasV3(runtimeAsar));

// 2) Launcher payload (prevents wipe on next open)
if (!fs.existsSync(PAYLOAD)) throw new Error("launcher payload asar missing: " + PAYLOAD);
fs.copyFileSync(PACKED, PAYLOAD);
const payloadApp = path.join(LAUNCHER, "Contents/Resources/Codex.payload");
// payload is a .app-like tree but named Codex.payload — update its Info.plist integrity
const payloadPlist = path.join(payloadApp, "Contents/Info.plist");
if (fs.existsSync(payloadPlist)) {
  const hash = asarHeaderHash(PAYLOAD);
  execFileSync(
    "/usr/bin/plutil",
    [
      "-replace",
      "ElectronAsarIntegrity.Resources/app\\.asar.hash",
      "-string",
      hash,
      payloadPlist,
    ],
    { stdio: "pipe" },
  );
  console.log("[ok] payload integrity", hash.slice(0, 16));
}
codesign(LAUNCHER);
console.log("[ok] launcher signed, payload v3=", hasV3(PAYLOAD));

console.log("[done]");
