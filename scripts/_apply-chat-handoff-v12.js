#!/usr/bin/env node
"use strict";

const fs = require("fs");
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
  "codex-rebuild:native-chat-mode-v12",
  "codex-rebuild:native-chat-home-v12",
  "codex-rebuild:chat-codex-handoff-v12",
  "codex-rebuild:chat-origin-v12",
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

const packed = path.join(REBUILD, "out", "app-chat-handoff-v12.asar");
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
  const bak = `${dest}.bak-v12-${Date.now()}`;
  fs.copyFileSync(dest, bak);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
  console.log("backup", bak);
}

console.log("done");
