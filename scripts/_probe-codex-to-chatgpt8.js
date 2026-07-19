#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

function dump(src, i, before, after) {
  console.log(src.slice(Math.max(0, i - before), i + after));
}

// Find export of zr
const exportIdx = remote.lastIndexOf("export{");
console.log("export at", exportIdx);
if (exportIdx >= 0) {
  const chunk = remote.slice(exportIdx, exportIdx + 4000);
  console.log(chunk.slice(0, 2500));
  const zr = chunk.match(/([A-Za-z0-9_$]+) as zr/);
  console.log("zr export match", zr);
}

// Also search for navigate local patterns in remote bundle
for (const needle of [
  "`/local/${",
  "function zr(",
  "async function zr(",
  "zr=async",
  "zr=e=>",
  "zr=function",
  "navigateToThread",
  "openConversation",
]) {
  console.log(needle, remote.indexOf(needle));
}

// Search page import line for zr as Aw context - extract full import from that file
const importMatch = page.match(/zr as Aw[^}]{0,200}/);
console.log("\npage import snippet", importMatch?.[0]);

const fromMatch = page.match(/zr as Aw[^}]*\}from"([^"]+)"/);
console.log("from file", fromMatch?.[1]);

// If fromMatch, search that file for the original name exported as zr
if (fromMatch) {
  const fname = fromMatch[1].replace(/^\.\//, "");
  const full = path.join(assets, fname.endsWith(".js") ? fname : fname + ".js");
  // try resolve truncated name
  console.log("looking for", fname);
  const candidates = fs.readdirSync(assets).filter((n) => n.startsWith(fname.split("~")[0]) && n.includes("remote-conversation") && n.endsWith(".js"));
  console.log("candidates", candidates);
}

// Broader: find functions that navigate to /local/
for (const name of fs.readdirSync(assets).filter((n) => n.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(assets, name), "utf8");
  if (!src.includes("`/local/${")) continue;
  // find nearby function defs
  let from = 0;
  let count = 0;
  while (count < 3) {
    const i = src.indexOf("`/local/${", from);
    if (i < 0) break;
    // walk back for function
    const start = Math.max(0, i - 400);
    const slice = src.slice(start, i + 200);
    if (slice.includes("function ") || slice.includes("=>")) {
      console.log("\n===", name, "at", i, "===");
      console.log(slice);
    }
    from = i + 10;
    count++;
  }
}
