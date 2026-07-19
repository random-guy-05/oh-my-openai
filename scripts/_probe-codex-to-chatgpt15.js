#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");

// Extract import from quick-chat in page
const re = /import\{([^}]+)\}from"\.\/app-initial~app-main~quick-chat-window-page-Bg2jp_pK\.js"/;
const m = page.match(re);
if (!m) {
  console.log("no direct import match");
  // try broader
  const i = page.indexOf("quick-chat-window-page-Bg2jp_pK.js");
  console.log("idx", i);
  console.log(page.slice(Math.max(0, i - 500), i + 80));
} else {
  const names = m[1].split(",").map((s) => s.trim());
  console.log("imported count", names.length);
  // show aliases that look useful
  for (const n of names) {
    if (/Dm|km|Fl|yc|Fo|dt|start|Conversation|Origin|ll\b|Ou\b|Fw|Gee|Jhe|tpp|model/i.test(n)) {
      console.log(n);
    }
  }
  console.log("\nall aliases containing Conversation/Stream/Origin/dt/Fl:");
  for (const n of names) {
    if (/Conversation|Stream|Origin| as dt| as Fl| as ll| as Ou| as Dm| as yc| as Fo| as GS/i.test(n)) console.log(n);
  }
}

// Find export of dt (route helper) from quick or catalog
const quickExport = quick.lastIndexOf("export{");
const exportChunk = quick.slice(quickExport, quickExport + 8000);
for (const name of ["dt", "Dm", "Fl", "yc", "ll", "Ou", "GS", "Fw"]) {
  const mm = exportChunk.match(new RegExp(`([A-Za-z0-9_$]+) as ${name}[,}]`));
  console.log("export", name, mm?.[1] ?? "NOT FOUND");
}

// Find dt function - conversation route
function findFn(src, name) {
  const patterns = [`function ${name}(`, `async function ${name}(`, `${name}=e=>`, `${name}=t=>`, `${name}=n=>`];
  for (const p of patterns) {
    const i = src.indexOf(p);
    if (i >= 0) return src.slice(i, i + 300);
  }
  return null;
}

// In remote bundle, d_ as dt was exported earlier from as6G4j38
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);
console.log("\nremote d_ / dt:");
console.log(findFn(remote, "d_"));

// page imports dt from somewhere
const dtImport = page.match(/([A-Za-z0-9_$]+) as dt[,}]/);
console.log("page dt import", dtImport?.[0]);
const dtFrom = page.match(/as dt[^}]*\}from"([^"]+)"/);
console.log("dt from file snippet search...");
// search all as dt in first import section
let idx = 0;
while (true) {
  const i = page.indexOf(" as dt", idx);
  if (i < 0 || i > 100000) break;
  console.log(page.slice(i - 30, i + 80));
  idx = i + 5;
}
