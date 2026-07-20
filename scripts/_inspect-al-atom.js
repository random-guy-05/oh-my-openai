#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);

// Find atom definitions for al and ll
for (const name of ["al=", "ll=", "var al", "al=f(", "al=e(", ",al=", "al=v("]) {
  const i = local.indexOf(name);
  console.log(name, i);
}

// Search for conversationTurns: assignment in atom builders
let idx = 0,
  n = 0;
while ((idx = local.indexOf("conversationTurns:", idx)) >= 0 && n < 15) {
  console.log("\nCT", n, idx);
  console.log(local.slice(idx - 80, idx + 200));
  idx += 18;
  n++;
}

// How al is created - search atom with isBackgroundSubagentsEnabled
const needle = "isBackgroundSubagentsEnabled";
idx = 0;
n = 0;
while ((idx = local.indexOf(needle, idx)) >= 0 && n < 10) {
  if (local.slice(idx - 30, idx + 80).includes("conversationId")) {
    console.log("\nPAIR", n, idx);
    console.log(local.slice(idx - 100, idx + 250));
  }
  idx += needle.length;
  n++;
}
