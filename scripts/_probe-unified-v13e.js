#!/usr/bin/env node
"use strict";
const fs = require("fs");
const quick = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
  "utf8",
);
const i = quick.indexOf("function hS(e){");
// Find end of hS roughly - next function at same level is hard; search for submit helpers used
const chunk = quick.slice(i, i + 80000);
// Find references to v?.( or onSubmitAccepted call
let idx = 0, n = 0;
while (n < 15) {
  const j = chunk.indexOf("onSubmitAccepted", idx);
  if (j < 0) break;
  console.log("---", j, chunk.slice(j - 80, j + 120));
  idx = j + 10;
  n++;
}
console.log("\n==== submit-ish ====");
for (const n of ["v?.(", "v&&v(", "await Dm", "km(", "yc(", "recordInSidebar", "submitComposer", "sendPrompt", "onSubmit:"]) {
  console.log(n, chunk.indexOf(n));
}
// Look for ComposerFooter or submit button
const btn = chunk.indexOf("type:`submit`");
console.log("type submit", btn, chunk.slice(btn - 50, btn + 200));
const send = chunk.indexOf("`Send`");
console.log("Send", send, chunk.slice(Math.max(0, send - 80), send + 150));
