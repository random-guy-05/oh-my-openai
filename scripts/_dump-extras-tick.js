#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const os = require("os");
const root =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const local = asar
  .extractFile(root, "webview/assets/local-conversation-thread-Bnxyo76e.js")
  .toString("utf8");

const start = local.indexOf("/* codex-rebuild:sticky-chat-v49:extras-tick */");
console.log("start", start);
console.log(local.slice(start, start + 3500));

// Also find where mapped extras get merged into renderEntries / visibleTurnEntries
const mergeHints = ["mapped.filter", "cdrSource", "renderEntries", "...mapped", "base.visibleTurnEntries"];
for (const h of mergeHints) {
  const i = local.indexOf(h, start);
  if (i >= 0 && i < start + 5000) console.log("\nhint", h, "->", local.slice(i, i + 200));
}
