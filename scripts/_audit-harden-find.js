#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const asar = require("@electron/asar");
const os = require("os");

const root =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const local = asar
  .extractFile(root, "webview/assets/local-conversation-thread-Bnxyo76e.js")
  .toString("utf8");

for (const marker of [
  "harden-find",
  "harden-CC",
  "harden-D-map",
  "harden-NC",
  "gs-guard",
  "extras-tick",
  "extras-safe",
  "turns-fa-safe",
]) {
  const i = local.indexOf(marker);
  console.log("\n====", marker, i);
  if (i >= 0) console.log(local.slice(Math.max(0, i - 350), i + 400));
}

// Compare with source tree
const srcLocal = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  ),
  "utf8",
);
console.log("\nsrc==live", srcLocal === local);

// Look at apply scripts for harden-find
const scripts = fs
  .readdirSync(path.join(__dirname))
  .filter((f) => f.includes("sticky-chat") && f.endsWith(".js"));
for (const f of scripts) {
  const s = fs.readFileSync(path.join(__dirname, f), "utf8");
  if (s.includes("harden-find")) {
    console.log("\nSCRIPT", f);
    const j = s.indexOf("harden-find");
    console.log(s.slice(Math.max(0, j - 400), j + 200));
  }
}
