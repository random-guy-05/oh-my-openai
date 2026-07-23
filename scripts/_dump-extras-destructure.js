#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");
const ew = local.indexOf("sticky-chat-v52:extras-wrap");
console.log("==== 600 before extras-wrap ====");
console.log(local.slice(Math.max(0, ew - 600), ew + 200));
console.log("\n==== 400 after extras IIFE end ====");
const end = local.indexOf("})(),V=", ew);
console.log(local.slice(end, end + 500));

// Find submit / send handlers that call Nl or Ml in local
for (const needle of [
  "await Nl(",
  "await Ml(",
  "Error creating chat",
  "create chat",
  ".turn.id",
  "turnId:",
]) {
  let idx = 0,
    n = 0;
  console.log("\n====", needle, "====");
  while ((idx = local.indexOf(needle, idx)) >= 0 && n < 4) {
    console.log(local.slice(Math.max(0, idx - 100), idx + 200));
    idx += needle.length;
    n++;
  }
}

// Find composer submit in kgjrczv7 / Fo
const toast = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("kgjrczv7") && f.endsWith(".js"))),
  "utf8",
);
const fo = toast.indexOf("Error creating chat");
console.log("\n==== Error creating chat toast ====");
console.log(toast.slice(Math.max(0, fo - 300), fo + 400));

// Dump how renderEntries / turn items are consumed - look for item.type switches near render
const itemType = local.indexOf("e.type===`userMessage`");
console.log("\n==== userMessage type checks ====");
let idx = 0,
  n = 0;
while ((idx = local.indexOf("userMessage", idx)) >= 0 && n < 10) {
  console.log("---", n, "---");
  console.log(local.slice(Math.max(0, idx - 80), idx + 200));
  idx += 11;
  n++;
}
