#!/usr/bin/env node
"use strict";
/**
 * Understand how renderEntries vs visibleTurnEntries are consumed after extras-wrap.
 */
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");

const ew = local.indexOf("sticky-chat-v52:extras-wrap");
// Show 2500 chars AFTER the IIFE to see how B and z are used
const end = local.indexOf("})(),V=", ew);
console.log("==== after extras destructure (3000 chars) ====");
console.log(local.slice(end, end + 3000));

// Find function that builds render entries from visible turns
console.log("\n==== ie( / Fa / build render near transcriptBlock creation ====");
let i = 0,
  n = 0;
while ((i = local.indexOf("transcriptBlock:", i)) >= 0 && n < 8) {
  console.log("\n---", n, "---");
  console.log(local.slice(Math.max(0, i - 200), i + 350));
  i += 15;
  n++;
}

// Find tl( helper - virtualized placeholder check
const tl = local.indexOf("function tl(");
console.log("\n==== tl ====");
console.log(local.slice(tl, tl + 200));

// How renderEntries get built from turns - look at function near "historyEntityKey"
console.log("\n==== building render entry objects ====");
i = 0;
n = 0;
while ((i = local.indexOf("historyEntityKey:", i)) >= 0 && n < 6) {
  console.log("\n---", n, "---");
  console.log(local.slice(Math.max(0, i - 250), i + 400));
  i += 16;
  n++;
}
