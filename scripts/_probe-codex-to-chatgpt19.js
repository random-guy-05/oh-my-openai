#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");

const re = /import\{([^}]+)\}from"\.\/app-initial~app-main~quick-chat-window-page-Bg2jp_pK\.js"/;
const m = page.match(re);
const names = m[1].split(",").map((s) => s.trim());
console.log("all quick imports into page:");
for (const n of names) console.log(n);

// Resolve what `in as GS` is
const exportIdx = quick.lastIndexOf("export{");
const exportChunk = quick.slice(exportIdx);
const gs = exportChunk.match(/([A-Za-z0-9_$]+) as in[,}]/);
console.log("\nGS export original:", gs?.[1]);
if (gs) {
  const name = gs[1];
  for (const p of [`function ${name}(`, `async function ${name}(`, `${name}=`]) {
    const i = quick.indexOf(p);
    if (i >= 0) {
      console.log(quick.slice(i, i + 600));
      break;
    }
  }
}

// Find how ge home composer submits - B as ge in work-home
const geExport = exportChunk.match(/([A-Za-z0-9_$]+) as B[,}]/);
console.log("\nge (B) export:", geExport?.[1]);
if (geExport) {
  const name = geExport[1];
  const i = quick.indexOf(`function ${name}(`);
  console.log("fn at", i);
  if (i >= 0) console.log(quick.slice(i, i + 2000));
}
