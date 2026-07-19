#!/usr/bin/env node
"use strict";
const fs = require("fs");
const quick = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
  "utf8",
);
const i = quick.indexOf("function hS(e){");
const chunk = quick.slice(i, i + 80000);
console.log("onSubmit region:\n", chunk.slice(7800, 8600));
console.log("\n\nDm region:\n", chunk.slice(46200, 47200));
console.log("\n\nv?.(te) region:\n", chunk.slice(6000, 6500));
