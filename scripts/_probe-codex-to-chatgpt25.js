#!/usr/bin/env node
"use strict";

const fs = require("fs");
const page = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
  "utf8",
);

for (const n of [
  "q_e",
  "function q_e",
  "q_e=",
  " as q_e",
  "threadKey:t.threadKey",
  "Aw(e,",
  "Aw(a,",
  "Aw(i,",
]) {
  console.log(n, page.indexOf(n), page.split(n).length - 1);
}
const i = page.indexOf("threadKey:t.threadKey");
console.log(page.slice(i - 200, i + 500));

// Find codex thread row component that navigates
const j = page.indexOf("function q_e");
console.log("\nfunction q_e", j);

// Search imported q_e
const m = page.match(/([A-Za-z0-9_$]+) as q_e[,}]/);
console.log("import", m?.[0]);
