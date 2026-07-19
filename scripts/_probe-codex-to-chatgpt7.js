#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

function dump(src, i, before, after) {
  console.log(src.slice(Math.max(0, i - before), i + after));
}

// Find all Aw( call sites in page
const re = /\bAw\(/g;
let m;
const sites = [];
while ((m = re.exec(page))) sites.push(m.index);
console.log("Aw( call sites", sites.length);
for (const i of sites.slice(0, 20)) {
  console.log("\n===", i, "===");
  dump(page, i, 60, 180);
}

// Find navigate to local path helpers near Do( / path builders
console.log("\n=== Do( definition / local path ===");
for (const needle of [
  "function Do(",
  "Do=e=>",
  "Do=e=>`",
  "`/local/${",
  "navigate(`/local/",
  "r(`/local/",
  "path:`/local/",
]) {
  const i = page.indexOf(needle);
  console.log(needle, i);
  if (i >= 0) dump(page, i, 40, 250);
}

// Search for openThread / activateThread / selectThread helpers used by sidebar
for (const needle of [
  "activateThreadSummary",
  "openLocalConversation",
  "openThread",
  "selectThread",
  "setActiveConversation",
  "conversationDetailMode",
  "Iee(",
]) {
  const idxs = [];
  let from = 0;
  while (idxs.length < 3) {
    const i = page.indexOf(needle, from);
    if (i < 0) break;
    idxs.push(i);
    from = i + needle.length;
  }
  console.log(needle, idxs);
  if (idxs[0] != null) {
    console.log(dump(page, idxs[0], 80, 300));
  }
}

// Look for Aw imported via var / destructure - maybe `Aw` appears in import list
const importish = page.match(/.{0,80}\bAw\b.{0,80}/g);
console.log("\nAw context samples", (importish || []).slice(0, 30));
