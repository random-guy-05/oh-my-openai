#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);

// Find export or var declarations containing ,al,
const exp = local.slice(local.lastIndexOf("export{"));
console.log(exp.slice(0, 800));

// Find al in exports
const m = exp.match(/([A-Za-z0-9_$]+) as al[,}]/);
console.log("al export from", m);

// Find ll
const m2 = exp.match(/([A-Za-z0-9_$]+) as ll[,}]/);
console.log("ll export", m2);

// Search atom family patterns with conversationTurns property assignment
const patterns = [
  /conversationTurns:([a-zA-Z0-9_$.]+)/g,
  /conversationTurns=([a-zA-Z0-9_$.]+)/g,
  /\{conversationTurns:/g,
];
for (const p of patterns) {
  let hit,
    n = 0;
  while ((hit = p.exec(local)) && n < 8) {
    console.log(p, hit.index, local.slice(hit.index - 40, hit.index + 80));
    n++;
  }
}

// Find where get(al is defined - look for atomFamily / family
for (const needle of [
  "atomFamily",
  "visibleTurnEntries:",
  "conversationTurns:",
  "function vu(",
  "al=u(",
  "al=c(",
  "al=l(",
]) {
  let idx = 0,
    n = 0;
  while ((idx = local.indexOf(needle, idx)) >= 0 && n < 3) {
    console.log("\n", needle, idx);
    console.log(local.slice(idx, idx + 200));
    idx += needle.length;
    n++;
  }
}
