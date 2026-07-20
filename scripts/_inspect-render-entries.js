#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const i = local.indexOf("me.current=De");
console.log(local.slice(i - 500, i + 200));

// Find De= assignment before that
const j = local.lastIndexOf("De=", i);
console.log("\nDe=", local.slice(j, j + 300));

// Find renderEntries:
let idx = 0,
  n = 0;
while ((idx = local.indexOf("renderEntries:", idx)) >= 0 && n < 6) {
  console.log("\nRE", n, local.slice(idx - 60, idx + 150));
  idx += 12;
  n++;
}
