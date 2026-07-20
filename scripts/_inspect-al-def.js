#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const i = local.indexOf("al=");
console.log("al= at", i);
console.log(local.slice(i, i + 2500));

// Also search conversationTurns without colon
let idx = 0,
  n = 0;
while ((idx = local.indexOf("conversationTurns", idx)) >= 0 && n < 12) {
  console.log(n, idx, local.slice(idx - 60, idx + 90).replace(/\n/g, " "));
  idx += 18;
  n++;
}
