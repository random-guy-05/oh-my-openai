#!/usr/bin/env node
"use strict";

/**
 * Repair the illegal class-body CDRMergeChatModels helper that SyntaxError'd
 * the catalog chunk and froze the HTML startup-loader forever.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { patch, verify } = require("./patch-chat-catalog");

const REBUILD =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const ASAR_ROOT = path.join(REBUILD, "src/mac-x64/_asar");
const CATALOG_BUNDLE = path.join(
  ASAR_ROOT,
  "webview/assets/app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js",
);

// Quit live runtime so asar replace sticks
const ps = execFileSync("/bin/ps", ["auxww"], { encoding: "utf8" });
for (const line of ps.split("\n")) {
  if (!line.includes("CodexDesktop-Rebuild") || !line.includes("MacOS/ChatGPT")) continue;
  if (line.includes("Helper") || line.includes("Frameworks")) continue;
  const pid = Number(line.trim().split(/\s+/)[1]);
  if (!Number.isFinite(pid)) continue;
  console.log("killing runtime pid", pid);
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}
for (const line of ps.split("\n")) {
  if (!line.includes("/Applications/Codex.app/Contents/MacOS/CodexLauncher")) continue;
  const pid = Number(line.trim().split(/\s+/)[1]);
  if (!Number.isFinite(pid)) continue;
  console.log("killing launcher pid", pid);
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

if (!fs.existsSync(CATALOG_BUNDLE)) {
  throw new Error(`catalog bundle missing: ${CATALOG_BUNDLE}`);
}
const source = fs.readFileSync(CATALOG_BUNDLE, "utf8");
const next = patch(source, CATALOG_BUNDLE);
fs.writeFileSync(CATALOG_BUNDLE, next.source);
verify(fs.readFileSync(CATALOG_BUNDLE, "utf8"), CATALOG_BUNDLE);
console.log(next.changed ? "patched catalog bundle" : "catalog already good");
const packed = path.join(REBUILD, "out", "app-chat-catalog-syntax-fix.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
console.log("packing...");
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: REBUILD,
  stdio: "inherit",
});

const live = [
  path.join(
    process.env.HOME,
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];
for (const dest of live) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  const bak = `${dest}.bak-catalog-fix-${Date.now()}`;
  fs.copyFileSync(dest, bak);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}

console.log("re-signing...");
execFileSync("node", [path.join(__dirname, "_resign-live-runtime.js")], {
  stdio: "inherit",
});
console.log("done");
