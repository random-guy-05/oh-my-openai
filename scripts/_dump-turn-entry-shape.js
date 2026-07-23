#!/usr/bin/env node
"use strict";
/**
 * Dump native visibleTurnEntry construction and renderEntry shape expectations.
 */
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");

for (const needle of [
  "estimatedHeightPx",
  "turnSearchKey",
  "physicalTurnIds",
  "preserveServerUserMessages",
  "renderEntries",
  "visibleTurnEntries:",
]) {
  let i = 0,
    n = 0;
  console.log("\n====", needle, "====");
  while ((i = local.indexOf(needle, i)) >= 0 && n < 5) {
    console.log(local.slice(Math.max(0, i - 100), i + 280));
    console.log("---");
    i += needle.length;
    n++;
  }
}

// Find function that builds turn entries from conversation turns
const turns = fs.readFileSync(
  path.join(
    ASSETS,
    fs.readdirSync(ASSETS).find((f) => f.includes("bzu8y8ld") && f.endsWith(".js")),
  ),
  "utf8",
);
console.log("\n==== turns-fa-safe vicinity ====");
const tf = turns.indexOf("turns-fa-safe");
console.log(turns.slice(Math.max(0, tf - 200), tf + 400));

// Look for where visibleTurnEntries objects are created in turns bundle
let i = 0,
  n = 0;
console.log("\n==== physicalTurnIds in turns ====");
while ((i = turns.indexOf("physicalTurnIds", i)) >= 0 && n < 6) {
  console.log(turns.slice(Math.max(0, i - 80), i + 350));
  console.log("---");
  i += 15;
  n++;
}
